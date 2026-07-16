import { Router } from 'express';
import { getOrCreateSession, trimHistory, ensureValidHistory, hasReachedTurnLimit, MAX_TURNS } from '../sessionStore.js';
import { runTurn } from '../anthropicClient.js';
import { getDefaultHtml } from '../systemPrompt.js';
import { MAX_CLIENT_HTML_LENGTH, SITE_MODE } from '../config.js';
import { addSubmission, listSubmissions } from '../galleryStore.js';

const router = Router();

const MAX_MESSAGE_LENGTH = 1000;
const MAX_STUDENT_NAME_LENGTH = 60;
const LIMIT_REACHED_TEXT =
  "We've reached the chat limit for this session — click Start Over (top right) to begin a new page!";
const BUSY_TEXT = "Still working on your last message — give it a second and try again!";

router.get('/session', (req, res) => {
  const session = getOrCreateSession(req.sessionId);
  res.json({ mode: SITE_MODE, pageHtml: session.pageHtml, turnCount: session.turnCount, maxTurns: MAX_TURNS });
});

// Resets the session to a clean slate — used by the "Start Over" button.
// A deliberate student action, so it's allowed regardless of turn count
// (in fact it's the way out of a maxed-out session). The project type
// itself (SITE_MODE) is fixed for the whole deployment, so this only
// clears content/history, not the mode.
router.post('/reset', (req, res) => {
  const session = getOrCreateSession(req.sessionId);

  if (session.busy) {
    return res.status(409).json({ error: BUSY_TEXT });
  }

  session.messages = [];
  session.pageHtml = getDefaultHtml(SITE_MODE);
  session.turnCount = 0;
  session.pendingToolUse = null;
  res.json({ mode: SITE_MODE, pageHtml: session.pageHtml, turnCount: session.turnCount, maxTurns: MAX_TURNS });
});

// Loads a student-uploaded HTML file as the current page — used by the
// "Upload HTML" menu item. Same shape as /api/reset (clean slate: history
// cleared, turn count reset), just seeded from the uploaded content instead
// of the blank default.
router.post('/upload', (req, res) => {
  const session = getOrCreateSession(req.sessionId);

  if (session.busy) {
    return res.status(409).json({ error: BUSY_TEXT });
  }

  const { pageHtml } = req.body || {};
  if (typeof pageHtml !== 'string' || !pageHtml.trim()) {
    return res.status(400).json({ error: 'That file appears to be empty.' });
  }
  if (pageHtml.length > MAX_CLIENT_HTML_LENGTH) {
    return res.status(400).json({ error: 'That file is too large to upload.' });
  }

  session.messages = [];
  session.pageHtml = pageHtml;
  session.turnCount = 0;
  session.pendingToolUse = null;
  res.json({ mode: SITE_MODE, pageHtml: session.pageHtml, turnCount: session.turnCount, maxTurns: MAX_TURNS });
});

// Restores a page the browser saved to localStorage — used when the server's
// in-memory session was lost (restart, redeploy, or free-tier spin-down) but
// the student's browser still has their work. Only applies to a session that
// hasn't started a conversation yet, so a stale save can't clobber an
// already-active one.
router.post('/restore', (req, res) => {
  const session = getOrCreateSession(req.sessionId);
  const { pageHtml } = req.body || {};

  if (typeof pageHtml !== 'string' || !pageHtml.trim()) {
    return res.status(400).json({ error: 'pageHtml is required.' });
  }
  if (pageHtml.length > MAX_CLIENT_HTML_LENGTH) {
    return res.status(400).json({ error: 'Saved page is too large to restore.' });
  }

  if (session.messages.length === 0) {
    session.pageHtml = pageHtml;
  }

  res.json({ mode: SITE_MODE, pageHtml: session.pageHtml, turnCount: session.turnCount, maxTurns: MAX_TURNS });
});

router.post('/chat', async (req, res) => {
  const session = getOrCreateSession(req.sessionId);

  if (session.busy) {
    return res.status(409).json({ error: BUSY_TEXT });
  }

  ensureValidHistory(session);

  const message = String(req.body?.message || '').trim();

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: 'That message is too long — try shortening it!' });
  }

  if (hasReachedTurnLimit(session)) {
    return res.json({ type: 'message', text: LIMIT_REACHED_TEXT, pageHtml: session.pageHtml, turnCount: session.turnCount, maxTurns: MAX_TURNS });
  }

  // Locked for the rest of this request — a second concurrent request for the
  // same session (e.g. a duplicate browser tab) would otherwise interleave
  // its own message pushes and API call with this one, corrupting the
  // conversation history sent to Claude.
  session.busy = true;
  try {
    session.turnCount += 1;

    if (session.pendingToolUse) {
      // An image search was pending but the student typed something instead
      // of picking a photo (e.g. "show me different ones"). Resolve the
      // pending tool_use and carry their new message in the same turn.
      session.messages.push({
        role: 'user',
        content: [
          ...(session.pendingToolUse.priorToolResults || []),
          {
            type: 'tool_result',
            tool_use_id: session.pendingToolUse.id,
            content: 'The student did not pick any of those photos.'
          },
          { type: 'text', text: message }
        ]
      });
      session.pendingToolUse = null;
    } else {
      session.messages.push({ role: 'user', content: message });
    }

    trimHistory(session);

    const result = await runTurn(session);
    res.json({ ...result, pageHtml: session.pageHtml, turnCount: session.turnCount, maxTurns: MAX_TURNS });
  } finally {
    session.busy = false;
  }
});

router.post('/select-image', async (req, res) => {
  const session = getOrCreateSession(req.sessionId);

  if (session.busy) {
    return res.status(409).json({ error: BUSY_TEXT });
  }

  ensureValidHistory(session);

  const { imageUrl, alt } = req.body || {};

  if (!session.pendingToolUse) {
    return res.status(400).json({ error: 'No pending image search to resolve.' });
  }
  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).json({ error: 'imageUrl is required.' });
  }

  if (hasReachedTurnLimit(session)) {
    return res.json({ type: 'message', text: LIMIT_REACHED_TEXT, pageHtml: session.pageHtml, turnCount: session.turnCount, maxTurns: MAX_TURNS });
  }

  // See /api/chat — same reasoning for locking around the mutation + API call.
  session.busy = true;
  try {
    session.turnCount += 1;

    const pending = session.pendingToolUse;
    session.pendingToolUse = null;

    session.messages.push({
      role: 'user',
      content: [
        ...(pending.priorToolResults || []),
        {
          type: 'tool_result',
          tool_use_id: pending.id,
          content: `The student picked this photo. Use this exact URL as the image src: ${imageUrl}${
            alt ? ` (alt text suggestion: ${alt})` : ''
          }`
        }
      ]
    });

    trimHistory(session);

    const result = await runTurn(session);
    res.json({ ...result, pageHtml: session.pageHtml, turnCount: session.turnCount, maxTurns: MAX_TURNS });
  } finally {
    session.busy = false;
  }
});

// Lists everyone's submitted pages for this deployment's project type — used
// by the class gallery view. Submissions from before mode tracking existed
// have no `mode` field, which counts as 'webpage' (see galleryStore.js).
router.get('/gallery', async (req, res) => {
  const submissions = await listSubmissions();
  const filtered = submissions.filter((entry) => (entry.mode === 'app' ? 'app' : 'webpage') === SITE_MODE);
  res.json({ submissions: filtered });
});

// Submits the student's current page to the class gallery, keyed by their
// session — resubmitting replaces their previous entry rather than piling
// up duplicates.
router.post('/gallery', async (req, res) => {
  const session = getOrCreateSession(req.sessionId);

  if (session.pageHtml === getDefaultHtml(SITE_MODE)) {
    return res.status(400).json({ error: 'Build something first before submitting to the gallery!' });
  }

  let studentName = String(req.body?.studentName || '').trim();
  if (!studentName) {
    studentName = 'Anonymous';
  }
  if (studentName.length > MAX_STUDENT_NAME_LENGTH) {
    return res.status(400).json({ error: 'That name is too long — try shortening it!' });
  }

  const entry = await addSubmission(req.sessionId, { studentName, html: session.pageHtml, mode: SITE_MODE });
  res.json({ ok: true, submittedAt: entry.submittedAt });
});

export default router;
