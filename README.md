# Class Building Tool

A classroom web app where kids chat with Claude to build a simple webpage, watching it update live in a preview panel.

## Setup

```bash
npm install
cp .env.example .env
# then edit .env and add your ANTHROPIC_API_KEY and PEXELS_API_KEY
npm start
```

Open http://localhost:3000 — each browser tab gets its own anonymous session (no login), tracked via a cookie, with its own conversation and page state held in memory on the server.

## How it works

- Left panel: chat with Claude. Right panel: a live `<iframe>` preview of the HTML page being built.
- Claude has two tools: `update_page` (returns the full HTML page whenever it changes something) and `search_images` (searches Pexels for a photo subject). When `search_images` is called, the conversation pauses and the frontend shows clickable photo thumbnails — Claude doesn't pick or guess an image URL itself.
- `ANTHROPIC_API_KEY` and `PEXELS_API_KEY` are read from environment variables only and never sent to the frontend.
- Model is Haiku 4.5, chosen for cost — simple kid webpages don't need a bigger model. Each session is capped at 40 turns to bound API cost per class.

## Deploying

Single Node/Express app — deploys as-is to Render (or any Node host). Set `ANTHROPIC_API_KEY` and `PEXELS_API_KEY` as environment variables on the host; no other config needed. Sessions are in-memory, so a server restart clears everyone's in-progress pages — fine for a single-day classroom use, but note if you need persistence across restarts.
