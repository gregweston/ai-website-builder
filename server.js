import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRouter from './src/routes/api.js';
import { newSessionId } from './src/sessionStore.js';
import { basicAuth } from './src/basicAuth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.SITE_USERNAME || !process.env.SITE_PASSWORD) {
  console.warn('⚠️  SITE_USERNAME/SITE_PASSWORD not set — the site has no password protection.');
}

// Unauthenticated health check for Render (or any host) to poll — must stay
// outside the password gate below, or deploys will look unhealthy.
app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.use(basicAuth);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Anonymous per-browser-tab session via an httpOnly cookie — no login.
app.use((req, res, next) => {
  let sid = req.cookies?.sid;
  if (!sid) {
    sid = newSessionId();
    res.cookie('sid', sid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 6 // 6 hours
    });
  }
  req.sessionId = sid;
  next();
});

app.use('/api', apiRouter);
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Class Building Tool running at http://localhost:${PORT}`);
});
