# AI Website Builder

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
- Claude has two tools: `update_page` (returns the full HTML page whenever it changes something) and `search_images` (searches for a photo subject). When `search_images` is called, the conversation pauses and the frontend shows clickable photo thumbnails — Claude doesn't pick or guess an image URL itself.
- **Image provider**: defaults to Pexels (a curated stock library, pre-filtered for general/commercial use — see `src/pexelsClient.js`). Set `IMAGE_PROVIDER=wikimedia` to search Wikimedia Commons instead (`src/wikimediaClient.js`) — a much broader library that includes real named people, landmarks, and historical photos, which Pexels categorically doesn't have. Commons isn't pre-curated for kid-safety the way Pexels is, so that client applies its own mitigation: over-fetches results and excludes any whose Wikimedia categories match a keyword blocklist (nudity, violence, weapons, etc.) before they ever reach the frontend — a real reduction in risk, not a guarantee, since Commons' categorization is community-maintained. No API key needed for Wikimedia. Selecting the provider is handled by `src/imageSearch.js`, which the rest of the app calls without needing to know which one is active.
- Pages are styled with Tailwind CSS by default, loaded via its Play CDN script (`<script src="https://cdn.tailwindcss.com">`) rather than a build step — Claude reaches for utility classes on elements instead of hand-written CSS, so kids get better-looking pages without needing to ask for it. Falls back to a `<style>` tag only for effects Tailwind's utilities can't express.
- `ANTHROPIC_API_KEY` and `PEXELS_API_KEY` are read from environment variables only and never sent to the frontend.
- Model defaults to Haiku 4.5, chosen for cost — simple webpages don't need a bigger model. Override with the `ANTHROPIC_MODEL` env var (e.g. to `claude-sonnet-5`) for a class session doing more ambitious work like complex p5.js games or 3D scenes. Each session is capped at 40 turns to bound API cost per class.
- **Class gallery**: the "Submit to Gallery" menu item posts a student's current page to `src/galleryStore.js`, keyed by session — resubmitting replaces their previous entry rather than duplicating it. `/gallery.html` (linked as "View Gallery") lists every submission with each page rendered in its own iframe. Unlike the rest of this app's state, the gallery is backed by Upstash Redis, so it survives server restarts, redeploys, and free-tier spin-down.
- **Download / Upload**: "Download HTML" saves the current page as a `.html` file straight from the browser (no server round-trip — it's just the live preview's content). "Upload HTML" reads a chosen file client-side and posts it to `POST /api/upload`, which loads it as the session's current page and starts a fresh conversation from it (same shape as Start Over, just seeded from the uploaded content instead of the blank default).
- All of the above (Submit to Gallery, View Gallery, Download, Upload, Start Over) live under the **Menu** dropdown in the header, rather than as individual buttons.

## Deploying

Single Node/Express app — deploys as-is to Render via the included `render.yaml` blueprint (or any Node host, manually). Set `ANTHROPIC_API_KEY`, `PEXELS_API_KEY`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` as environment variables on the host; no other config needed. Chat sessions themselves are still in-memory, so a server restart clears everyone's in-progress chat history — the page itself and the visible chat log survive via the browser's localStorage (see `src/routes/api.js` `/api/restore`), but conversation context for Claude does not. The gallery is the one piece of state backed by real persistence, since it needs to survive independently of any one student's browser.

### Keeping the public out

Set `SITE_USERNAME` and `SITE_PASSWORD` as environment variables on the host to require a login prompt for the entire site (a plain HTTP Basic Auth gate — the browser's native login dialog, no code in this app needed to display it). Give the class the one shared username/password at the start. Leave both unset for local development — the server logs a startup warning if either is missing so it's never a silent surprise in production. This is meant to keep random passersby out, not as a strong security boundary.
