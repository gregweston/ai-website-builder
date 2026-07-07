import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from './systemPrompt.js';
import { tools } from './tools.js';
import { searchPhotos } from './pexelsClient.js';
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
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(session.pageHtml),
        tools,
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
        messages: session.messages
      });
    } catch (err) {
      console.error('Anthropic API error:', err);
      return { type: 'error', text: 'Oops, I had trouble thinking just now. Try asking again!' };
    }

    session.messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'refusal') {
      return {
        type: 'error',
        text: "I can't help with that, but let's keep building your page! What would you like to add?"
      };
    }

    if (response.stop_reason !== 'tool_use') {
      return { type: 'message', text: extractText(response.content) || 'Okay!' };
    }

    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse) {
      return { type: 'message', text: extractText(response.content) || 'Okay!' };
    }

    if (toolUse.name === 'search_images') {
      const query = String(toolUse.input?.query || '').trim() || 'nature';
      let photos = [];
      try {
        photos = await searchPhotos(query);
      } catch (err) {
        console.error('Pexels error:', err);
      }
      // Pause the loop here — this tool_use is left unresolved until the
      // student picks a photo (or says something else), handled by the
      // /api/select-image or /api/chat routes.
      session.pendingToolUse = { id: toolUse.id, query };
      return { type: 'image_search', query, photos, text: extractText(response.content) };
    }

    if (toolUse.name === 'update_page') {
      const html = toolUse.input?.html;
      if (typeof html === 'string' && html.trim()) {
        session.pageHtml = html;
      }
      session.messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'Page updated.' }]
      });
      continue; // let Claude give a short confirmation message next
    }

    // Unknown tool name — shouldn't happen, but keep the transcript valid.
    session.messages.push({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: toolUse.id, content: 'Unknown tool.', is_error: true }
      ]
    });
  }

  return { type: 'message', text: "All done for now — what's next?" };
}
