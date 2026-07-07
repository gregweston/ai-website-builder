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
      pendingToolUse: null
    };
    sessions.set(sessionId, session);
  }
  return session;
}

export function hasReachedTurnLimit(session) {
  return session.turnCount >= MAX_TURNS;
}

// Keeps the stored history bounded. Always trims forward to the next 'user'
// role message so the array remains valid to send to the API (must start
// with a user message, and no tool_use is left with a missing tool_result).
export function trimHistory(session) {
  if (session.messages.length <= MAX_HISTORY_MESSAGES) return;
  let start = session.messages.length - MAX_HISTORY_MESSAGES;
  while (start < session.messages.length && session.messages[start].role !== 'user') {
    start++;
  }
  session.messages = session.messages.slice(start);
}

export { MAX_TURNS };
