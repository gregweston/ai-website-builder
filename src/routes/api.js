import { Router } from 'express';
import { getOrCreateSession, trimHistory, hasReachedTurnLimit, MAX_TURNS } from '../sessionStore.js';
import { runTurn } from '../anthropicClient.js';
import { MAX_RESTORE_HTML_LENGTH } from '../config.js';

const router = Router();

const MAX_MESSAGE_LENGTH = 1000;
const LIMIT_REACHED_TEXT =
  "We've reached the chat limit for this session — ask your teacher to refresh and start a new page!";

router.get('/session', (req, res) => {
  const session = getOrCreateSession(req.sessionId);
  res.json({ pageHtml: session.pageHtml, turnCount: session.turnCount, maxTurns: MAX_TURNS });
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
  if (pageHtml.length > MAX_RESTORE_HTML_LENGTH) {
    return res.status(400).json({ error: 'Saved page is too large to restore.' });
  }

  if (session.messages.length === 0) {
    session.pageHtml = pageHtml;
  }

  res.json({ pageHtml: session.pageHtml, turnCount: session.turnCount, maxTurns: MAX_TURNS });
});

router.post('/chat', async (req, res) => {
  const session = getOrCreateSession(req.sessionId);
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

  session.turnCount += 1;

  if (session.pendingToolUse) {
    // An image search was pending but the student typed something instead of
    // picking a photo (e.g. "show me different ones"). Resolve the pending
    // tool_use and carry their new message in the same turn.
    session.messages.push({
      role: 'user',
      content: [
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
});

router.post('/select-image', async (req, res) => {
  const session = getOrCreateSession(req.sessionId);
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

  session.turnCount += 1;

  const pending = session.pendingToolUse;
  session.pendingToolUse = null;

  session.messages.push({
    role: 'user',
    content: [
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
});

export default router;
