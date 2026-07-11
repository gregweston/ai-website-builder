import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from './systemPrompt.js';
import { tools } from './tools.js';
import { searchPhotos } from './imageSearch.js';
import { MODEL, MAX_TOKENS, MAX_TOOL_ITERATIONS } from './config.js';

// Reads ANTHROPIC_API_KEY from the environment. Never exposed to the
// frontend — this module only runs server-side.
const client = new Anthropic();

function extractText(content) {
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/**
 * Drives one user turn to completion. `session.messages` must already have
 * the new user message (and any pending tool_result) appended.
 *
 * Returns one of:
 *   { type: 'message', text }
 *   { type: 'image_search', query, photos, text }
 *   { type: 'error', text }
 */
export async function runTurn(session) {
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    let response;
    const startedAt = Date.now();
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(session.pageHtml),
        tools,
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
        messages: session.messages
      });
      console.log(`Anthropic API response in ${Date.now() - startedAt}ms (model: ${MODEL})`);
    } catch (err) {
      console.error(`Anthropic API error after ${Date.now() - startedAt}ms:`, err);
      return { type: 'error', text: 'Oops, I had trouble thinking just now. Try asking again!' };
    }

    if (response.stop_reason === 'refusal') {
      // Don't push the refused content into history: it can be empty (a
      // pre-output refusal) or carry a tool_use we'd never resolve — either
      // shape would 400 on every later turn.
      return {
        type: 'error',
        text: "I can't help with that, but let's keep building your page! What would you like to add?"
      };
    }

    session.messages.push({ role: 'assistant', content: response.content });

    // Resolve EVERY tool_use in the response, not just the first. The API
    // requires a tool_result for each id in the single next message; the
    // model occasionally emits more than one call per turn even with
    // disable_parallel_tool_use set, and one missing result 400s every
    // request after it. Also keyed off content rather than stop_reason, so
    // a tool_use arriving under an unexpected stop_reason (e.g. max_tokens)
    // still gets resolved instead of dangling.
    const toolUses = response.content.filter((b) => b.type === 'tool_use');

    if (toolUses.length === 0) {
      return { type: 'message', text: extractText(response.content) || 'Okay!' };
    }

    const toolResults = [];
    let pendingSearch = null;

    for (const toolUse of toolUses) {
      if (toolUse.name === 'search_images') {
        if (pendingSearch) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: 'Only one image search can run at a time — this one was skipped.',
            is_error: true
          });
        } else {
          pendingSearch = toolUse;
        }
      } else if (toolUse.name === 'update_page') {
        const html = toolUse.input?.html;
        if (typeof html === 'string' && html.trim()) {
          session.pageHtml = html;
        }
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'Page updated.' });
      } else {
        // Unknown tool name — shouldn't happen, but keep the transcript valid.
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'Unknown tool.',
          is_error: true
        });
      }
    }

    if (pendingSearch) {
      const query = String(pendingSearch.input?.query || '').trim() || 'nature';
      let photos = [];
      try {
        photos = await searchPhotos(query);
      } catch (err) {
        console.error('Pexels error:', err);
      }
      // Pause the loop here — this tool_use is left unresolved until the
      // student picks a photo (or says something else), handled by the
      // /api/select-image or /api/chat routes. Results for any other tool
      // calls from this same response ride along as priorToolResults so the
      // eventual resolving message carries a result for every id.
      session.pendingToolUse = { id: pendingSearch.id, query, priorToolResults: toolResults };
      return { type: 'image_search', query, photos, text: extractText(response.content) };
    }

    session.messages.push({ role: 'user', content: toolResults });
    // loop again to let Claude give a short confirmation message
  }

  return { type: 'message', text: "All done for now — what's next?" };
}
