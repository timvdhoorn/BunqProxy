---
name: add-worker-middleware
description: Add a new check, header, or transformation to the worker fetch handler in src/index.ts without breaking the auth → permission → forward order.
triggers:
  - "middleware"
  - "add header"
  - "rate limit"
  - "validate"
  - "index.ts"
  - "fetch handler"
edges:
  - target: context/architecture.md
    condition: when placing the new step in the request flow
  - target: context/conventions.md
    condition: when running the verify checklist
  - target: patterns/change-permission-policy.md
    condition: when the new check is policy-shaped and may belong in config.ts instead
last_updated: 2026-04-14
---

# Add Worker Middleware / Pre-Forward Check

## Context
- `src/index.ts#fetch` is the only entrypoint. Order today: `OPTIONS` → `validateAuth` → `validateIP` → `isAllowed` → `getSessionToken` → `forwardRequest` → `logRequest`.
- New checks almost always belong **after** `validateAuth` and **before** `getSessionToken`, so unauthenticated traffic and disallowed methods never trigger upstream work.
- Responses must always carry `CORS_HEADERS`. Use `jsonResponse()` for any new error branch.

## Steps
1. Decide where in the existing chain the new check belongs. Default: just after `validateIP`, just before `isAllowed`. State this placement out loud before editing.
2. Add the helper as a top-level pure function in `src/index.ts` (or a new file in `src/` if it has its own state). Keep it small (<50 lines, <4 nesting levels).
3. If it needs configuration, prefer adding a new field to `Env` (typed in `src/index.ts`) and binding it via `wrangler.toml` / `wrangler secret`. Do not invent a runtime config store.
4. Wire it into `fetch`. On rejection, return `jsonResponse({ error, reason }, <status>)` — never a bare `Response`.
5. Make sure the new branch still calls `logRequest` if it represents a denied request (mirror the existing `permission.allowed === false` branch).
6. `bun run dev`, exercise the new branch and the happy path, confirm `wrangler tail` shows the right log line.
7. `bun run deploy`.

## Gotchas
- Do NOT call `getSessionToken` or any `fetch` to bunq before the new check — that's a leak of upstream calls under denied traffic.
- Do NOT mutate the incoming `Request`. If you need to read the body, you consume the stream — pass the read body forward explicitly.
- `CF-Connecting-IP` is the only trustworthy client IP header on Workers; `X-Forwarded-For` can be spoofed.
- Anything you `console.log` ends up in `wrangler tail`. Never log secrets, session tokens, or full bunq error bodies.
- Do not add a runtime dependency to `package.json` for this — every dep ships in the worker bundle.

## Verify
- [ ] New check runs after `validateAuth`/`validateIP` and before any bunq call.
- [ ] Denied path returns JSON with `CORS_HEADERS` and is logged via `logRequest`.
- [ ] Happy path is unchanged for traffic the new check accepts.
- [ ] No new `dependencies` in `package.json`.
- [ ] No `node:*` import, no `Buffer`, no `process`.
- [ ] Run the full conventions Verify Checklist.

## Debug
- New branch never hits → confirm wiring order; insert a temp `console.log` and watch `wrangler tail`.
- CORS errors in the browser → the new error branch isn't going through `jsonResponse`.
- Missing IP / wrong header on `wrangler dev` → `wrangler dev` may not populate `CF-Connecting-IP` locally; verify on a deployed environment.

## Update Scaffold
- [ ] Update `.mex/context/architecture.md` "System Overview" if the new check changes the canonical flow.
- [ ] Update `.mex/ROUTER.md` "Current Project State" if a feature is now built that wasn't.
- [ ] Append any new gotcha discovered during the task.
