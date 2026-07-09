# Class Building Tool

A classroom web app where kids chat with Claude to build a simple webpage, watching it update live in a preview panel.

## Setup

```bash
npm install
cp .env.example .env
# then edit .env and add your ANTHROPIC_API_KEY, PEXELS_API_KEY, and
# UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (from your Upstash database's REST API tab)
npm start
```

Open http://localhost:3000 — each browser tab gets its own anonymous session (no login), tracked via a cookie, with its own conversation and page state held in memory on the server.

## How it works

- Left panel: chat with Claude. Right panel: a live `<iframe>` preview of the HTML page being built.
- Claude has two tools: `update_page` (returns the full HTML page whenever it changes something) and `search_images` (searches Pexels for a photo subject). When `search_images` is called, the conversation pauses and the frontend shows clickable photo thumbnails — Claude doesn't pick or guess an image URL itself.
- `ANTHROPIC_API_KEY` and `PEXELS_API_KEY` are read from environment variables only and never sent to the frontend.
- Model is Haiku 4.5, chosen for cost — simple kid webpages don't need a bigger model. Each session is capped at 40 turns to bound API cost per class.
- **Class gallery**: the "Submit to Gallery" button posts a student's current page to `src/galleryStore.js`, keyed by session — resubmitting replaces their previous entry rather than duplicating it. `/gallery.html` (linked as "View Gallery") lists every submission with each page rendered in its own iframe. Unlike the rest of this app's state, the gallery is backed by Upstash Redis, so it survives server restarts, redeploys, and free-tier spin-down.

## Deploying

Single Node/Express app — deploys as-is to Render via the included `render.yaml` blueprint (or any Node host, manually). Set `ANTHROPIC_API_KEY`, `PEXELS_API_KEY`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` as environment variables on the host; no other config needed. Chat sessions themselves are still in-memory, so a server restart clears everyone's in-progress chat history — the page itself and the visible chat log survive via the browser's localStorage (see `src/routes/api.js` `/api/restore`), but conversation context for Claude does not. The gallery is the one piece of state backed by real persistence, since it needs to survive independently of any one student's browser.

### Keeping the public out

Set `SITE_USERNAME` and `SITE_PASSWORD` as environment variables on the host to require a login prompt for the entire site (a plain HTTP Basic Auth gate — the browser's native login dialog, no code in this app needed to display it). Give the class the one shared username/password at the start. Leave both unset for local development — the server logs a startup warning if either is missing so it's never a silent surprise in production. This is meant to keep random passersby out, not as a strong security boundary.
