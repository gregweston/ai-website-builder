// Haiku 4.5 by default: cheap and plenty capable for generating simple kid
// webpages. Override with the ANTHROPIC_MODEL env var for a specific class
// session doing more ambitious work (e.g. complex p5.js games or 3D scenes)
// that could benefit from a stronger model, without raising cost for every
// session by default. The current API call (see anthropicClient.js) doesn't
// pass `effort` or `thinking`, so this is safe to override to any model.
export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
// Generous enough that update_page regenerating a full HTML document (with
// inline styles/scripts) has no realistic chance of truncating mid-tool-call
// (the old 4096 could, silently dropping the page update), while staying
// under the ~16K ceiling where non-streaming requests start risking SDK HTTP
// timeouts. Going higher would require switching the API call to streaming.
export const MAX_TOKENS = 16000;

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

// Defensive cap on a client-submitted HTML payload — /api/restore (the
// browser's localStorage save of its own page) and /api/upload (a file the
// student picked). Well under the 1mb JSON body limit.
export const MAX_CLIENT_HTML_LENGTH = 200000;

// Which project type this deployment builds — set via MODE in .env. 'app'
// runs the mobile-app prototype builder; anything else (including unset)
// runs the classic webpage builder. Fixed for the life of the server
// process — a given classroom session builds one or the other, never both,
// so there's no runtime switch (see systemPrompt.js, routes/api.js).
export const SITE_MODE = process.env.MODE === 'app' ? 'app' : 'webpage';
