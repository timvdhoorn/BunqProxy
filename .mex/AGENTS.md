---
name: agents
description: Always-loaded project anchor. Read this first. Contains project identity, non-negotiables, commands, and pointer to ROUTER.md for full context.
last_updated: 2026-04-14
---

# BunqProxy

## What This Is
A Cloudflare Worker that acts as a permission-controlled proxy in front of the bunq API, handing scoped Bearer-token access to clients (e.g. AI agents) while the worker holds the real bunq API key and session.

## Non-Negotiables
- Never expose `BUNQ_API_KEY` or session tokens in responses, logs, or errors returned to clients.
- Never bypass `isAllowed()` in `src/permissions.ts` — every forwarded request must pass through it.
- Never remove or weaken the entries in `config.blockedEndpoints` (DELETE on `/v1/installation/*`, `/v1/device-server/*`, `/v1/session/*`) — they prevent clients from destroying the proxy's own session.
- Never commit secrets — `PROXY_TOKEN`, `BUNQ_API_KEY`, and `ALLOWED_IPS` are wrangler secrets / vars only.
- Never mutate state in place — match the `readonly` style used throughout `src/`.

## Commands
- Dev: `bun run dev` (wraps `wrangler dev`)
- Deploy: `bun run deploy` (wraps `wrangler deploy`)
- Tail logs: `bun run tail` (wraps `wrangler tail`)
- Install: `bun install`

## Scaffold Growth
After every task: if no pattern exists for the task type you just completed, create one. If a pattern or context file is now out of date, update it. The scaffold grows from real work, not just setup. See the GROW step in `ROUTER.md` for details.

## Navigation
At the start of every session, read `ROUTER.md` before doing anything else.
For full project context, patterns, and task guidance — everything is there.
