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

export { MAX_TURNS };
