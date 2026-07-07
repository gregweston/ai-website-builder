// Haiku 4.5: cheap and plenty capable for generating simple kid webpages.
// Note: Haiku 4.5 does not support the `effort` or `thinking` parameters —
// don't add them here.
export const MODEL = 'claude-haiku-4-5';
export const MAX_TOKENS = 4096;

// Guards against a runaway tool-call loop in a single turn.
export const MAX_TOOL_ITERATIONS = 5;

// Caps total user-initiated turns (chat messages + image picks) per session,
// to keep token costs bounded for a classroom of 25 kids.
export const MAX_TURNS = 40;

// Caps stored conversation history so token costs don't grow unbounded over
// a long session. The current page HTML is always re-injected into the
// system prompt fresh each turn (see systemPrompt.js), so trimming older
// chat history doesn't cause the model to "forget" what's on the page.
export const MAX_HISTORY_MESSAGES = 30;

// Defensive cap on a client-submitted /api/restore payload (the browser's
// localStorage save of its own page). Well under the 1mb JSON body limit.
export const MAX_RESTORE_HTML_LENGTH = 200000;
