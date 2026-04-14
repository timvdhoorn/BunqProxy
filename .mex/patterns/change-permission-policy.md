---
name: change-permission-policy
description: Add, widen, narrow, or switch the permission mode in src/config.ts safely without exposing destructive bunq operations.
triggers:
  - "permission"
  - "allow endpoint"
  - "block endpoint"
  - "read-only"
  - "read-write"
  - "custom mode"
  - "config.ts"
edges:
  - target: context/conventions.md
    condition: when reviewing the verify checklist after the change
  - target: context/decisions.md
    condition: when justifying mode changes against the always-blocked-DELETE decision
  - target: context/architecture.md
    condition: when understanding where isAllowed sits in the request flow
last_updated: 2026-04-14
---

# Change Permission Policy

## Context
- Read `src/config.ts` (single source of truth) and `src/permissions.ts` (`isAllowed`, `matchPattern`).
- `matchPattern` uses `*` as a **single-segment** wildcard. `/v1/user/*/monetary-account` matches `/v1/user/123/monetary-account`, NOT `/v1/user/123/monetary-account/456`.
- `blockedEndpoints` is checked **before** mode evaluation. The DELETE entries on `/v1/installation/*`, `/v1/device-server/*`, `/v1/session/*` are non-negotiables (`AGENTS.md`).

## Steps
1. Decide mode: `read-only` (GET only), `read-write` (everything except blocked), or `custom` (only entries in `allowedEndpoints`).
2. For `custom`: enumerate the exact `{ method, pattern }` pairs the client needs. Count path segments carefully — one `*` per segment.
3. Edit `src/config.ts`. Keep the `readonly` shape and the existing `blockedEndpoints` entries intact.
4. If widening to `read-write` or `custom` with non-GET methods, double-check that no new pattern overlaps with a destructive bunq endpoint that should also be blocked (consider adding new `blockedEndpoints`).
5. `bun run dev` and exercise both an allowed and a denied request against `http://localhost:8787` with a real `Authorization: Bearer <PROXY_TOKEN>`.
6. `bun run tail` while testing — confirm `logRequest` shows `allowed: true/false` and the expected `reason` for blocks.
7. `bun run deploy`.

## Gotchas
- Wildcard arity: pattern segment count must equal path segment count. A trailing `*` does NOT match deeper paths.
- Method comparison is case-insensitive (`isAllowed` upper-cases both sides). Still write rules in upper case for grep-ability.
- `read-only` blocks anything that is not exactly `GET` — `HEAD`, `OPTIONS` (the worker handles preflight earlier), `POST`, etc. all 403.
- Do NOT remove `blockedEndpoints` to "simplify" — they exist to stop a client from killing the proxy's own session.
- There is no per-token scoping; whatever you ship in `config.ts` applies to every request.

## Verify
- [ ] `blockedEndpoints` still contains the three DELETE rules on `/v1/installation/*`, `/v1/device-server/*`, `/v1/session/*`.
- [ ] An expected-allowed request returns the upstream bunq response (not 403).
- [ ] An expected-blocked request returns 403 with the correct `reason`.
- [ ] `wrangler tail` shows the JSON log line for both cases.
- [ ] No new dependencies, no mutation of existing rule arrays (build new arrays only).
- [ ] Run the full conventions Verify Checklist.

## Debug
- 403 where you expected 200 → `matchPattern` arity mismatch. Print `path.split("/").length` vs your pattern's segment count.
- 200 where you expected 403 → check `blockedEndpoints` ordering / spelling; remember blocks are evaluated first but only match if both method and pattern match.
- After deploy nothing changed → `bun run deploy` succeeded but you tested the dev URL; confirm against the production route.

## Update Scaffold
- [ ] Update `.mex/ROUTER.md` "Current Project State" if the policy change is significant (e.g. switching default mode).
- [ ] Update `.mex/context/decisions.md` with a new entry if the change reflects a policy shift, not a tactical edit.
- [ ] If this task revealed a new gotcha, append it to this pattern.
