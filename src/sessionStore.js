import crypto from 'node:crypto';
import { DEFAULT_HTML } from './systemPrompt.js';
import { MAX_HISTORY_MESSAGES, MAX_TURNS } from './config.js';

// In-memory session store — no login, one session per browser tab. Fine for
// a single classroom instance; state is lost on server restart, which is an
// acceptable tradeoff for this app's scope.
const sessions = new Map();

export function newSessionId() {
  return crypto.randomUUID();
}

export function getOrCreateSession(sessionId) {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      id: sessionId,
      messages: [],
      pageHtml: DEFAULT_HTML,
      turnCount: 0,
      pendingToolUse: null,
      busy: false
    };
    sessions.set(sessionId, session);
  }
  return session;
}

export function hasReachedTurnLimit(session) {
  return session.turnCount >= MAX_TURNS;
}

// A safe trim boundary: a 'user' message that carries no tool_result block.
// Some of our 'user' messages (the "Page updated." confirmation after
// update_page, or a tool_result bundled with a new chat message) reference a
// tool_use in the assistant message right before them — cutting the history
// there would leave a dangling tool_result with no matching tool_use, which
// the API rejects.
function isFreshUserTurn(message) {
  if (message.role !== 'user') return false;
  if (typeof message.content === 'string') return true;
  if (Array.isArray(message.content)) {
    return message.content.every((block) => block.type !== 'tool_result');
  }
  return false;
}

// Keeps the stored history bounded. Always trims forward to the next fresh
// user turn so the array remains valid to send to the API (must start with
// a user message, and no tool_use is left with a missing tool_result).
export function trimHistory(session) {
  if (session.messages.length <= MAX_HISTORY_MESSAGES) return;
  let start = session.messages.length - MAX_HISTORY_MESSAGES;
  while (start < session.messages.length && !isFreshUserTurn(session.messages[start])) {
    start++;
  }
  if (start >= session.messages.length) return; // no safe boundary in range — skip trimming this time
  session.messages = session.messages.slice(start);
}

// Validates that every tool_use has a matching tool_result in the message
// right after it, and every tool_result references a tool_use in the
// message right before it — the two shapes of corruption we've hit in
// practice. This is a safety net: if it's ever wrong (a bug we haven't
// found, or a session that got corrupted before a fix was deployed), a bad
// array would otherwise 400 on every subsequent turn forever, since nothing
// else repairs it automatically.
function isValidHistory(messages) {
  if (messages.length === 0) return true;
  if (messages[0].role !== 'user') return false;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type !== 'tool_result') continue;
        const prev = messages[i - 1];
        const prevToolUseIds = prev && Array.isArray(prev.content)
          ? prev.content.filter((b) => b.type === 'tool_use').map((b) => b.id)
          : [];
        if (!prevToolUseIds.includes(block.tool_use_id)) return false;
      }
    }

    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type !== 'tool_use') continue;
        const isLastMessage = i === messages.length - 1;
        const next = messages[i + 1];
        const nextHasResult = next && Array.isArray(next.content)
          && next.content.some((b) => b.type === 'tool_result' && b.tool_use_id === block.id);
        if (!nextHasResult && !isLastMessage) return false;
      }
    }
  }

  return true;
}

// Called right before a session's stored history is used for a new turn. If
// it's invalid, resets the conversation history only — session.pageHtml is
// untouched, since it's always re-injected fresh into the system prompt each
// turn regardless of chat history, so the student's actual page survives.
export function ensureValidHistory(session) {
  if (!isValidHistory(session.messages)) {
    console.warn(`Session ${session.id}: invalid message history detected — resetting conversation history (page content preserved).`);
    session.messages = [];
    session.pendingToolUse = null;
  }
}

export { MAX_TURNS };
