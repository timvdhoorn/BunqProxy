---
name: conventions
description: How code is written in BunqProxy — naming, structure, patterns, and the verify checklist for changes. Load when writing or reviewing code.
triggers:
  - "convention"
  - "pattern"
  - "naming"
  - "style"
  - "how should I"
  - "verify"
edges:
  - target: context/architecture.md
    condition: when a convention depends on understanding the request flow
  - target: context/stack.md
    condition: when a convention is grounded in a Workers/TS constraint
  - target: patterns/INDEX.md
    condition: when a task-specific pattern likely exists for what you are about to do
last_updated: 2026-04-14
---

# Conventions

## Naming
- Files: lower-case, single word per concern (`index.ts`, `bunq.ts`, `permissions.ts`, `config.ts`, `logger.ts`). No subfolders inside `src/`.
- Functions: camelCase, verb-first (`getSessionToken`, `forwardRequest`, `isAllowed`, `matchPattern`, `validateAuth`).
- Types/interfaces: PascalCase (`Env`, `PermissionConfig`, `EndpointRule`, `SessionData`, `RequestLogEntry`).
- Constants: SCREAMING_SNAKE_CASE at module scope (`BUNQ_API_HOST`, `KV_KEY_SESSION`, `SESSION_TTL_SECONDS`, `CORS_HEADERS`).
- KV keys: `bunq:<thing>` namespace prefix, defined as `KV_KEY_*` constants in `src/bunq.ts` — never inline a KV key string.

## Structure
- One file per concern in `src/`. Cross-file imports go through named exports only; no default exports except the worker handler.
- `src/index.ts` is the only entrypoint. It owns auth + IP + permission + logging orchestration; bunq logic stays in `src/bunq.ts`, permission logic in `src/permissions.ts`.
- All shapes use `readonly` fields and `readonly` arrays (`PermissionConfig`, `SessionData`, `InstallationData`). Treat data as immutable — never mutate; build new objects with spreads.
- bunq handshake helpers (`getOrCreateKeyPair`, `createInstallation`, `ensureDeviceServer`, `createSessionServer`) are private to `src/bunq.ts`; only `getSessionToken` and `forwardRequest` are exported.
- Errors from the bunq layer are thrown with a message including the upstream HTTP status and body text; `index.ts` catches them and returns `502` + `{ error: message }`.

## Patterns

**Permission gate first, network second.** Every new path through the worker must pass `isAllowed` before any `fetch`. Do not add side-channels around it.
```ts
// Correct
const permission = isAllowed(method, path);
if (!permission.allowed) return jsonResponse({ error: "Forbidden", reason: permission.reason }, 403);
const sessionToken = await getSessionToken(env.BUNQ_SESSION, env.BUNQ_API_KEY);

// Wrong — never call bunq before isAllowed succeeds
const sessionToken = await getSessionToken(env.BUNQ_SESSION, env.BUNQ_API_KEY);
if (!isAllowed(method, path).allowed) ...
```

**KV reads via typed `get(..., "json")` with a constant key.** Never use ad-hoc keys or untyped string parsing.
```ts
const cached = await kv.get<SessionData>(KV_KEY_SESSION, "json");
```

**Always attach `CORS_HEADERS` to responses leaving the worker** — both error and success paths. Use `jsonResponse()` for JSON bodies; for proxied bodies, copy headers and overlay `CORS_HEADERS` like in the success branch of `index.ts`.

**bunq POSTs go through `bunqPost`.** It is the only place that sets `X-Bunq-*` headers, generates request IDs, and signs bodies. Do not duplicate header construction.

## Verify Checklist
Before presenting any code change:
- [ ] Every new request path still passes through `isAllowed` (no bypass).
- [ ] No secret (`BUNQ_API_KEY`, session token, raw bunq error body) is leaked back to the client in a response or in `logRequest`.
- [ ] No new entries in `package.json#dependencies` unless explicitly discussed (worker bundle size + Workers compat).
- [ ] No `node:*` import, no `Buffer`, no `process`, no Node-only API.
- [ ] All new shapes use `readonly` fields and arrays; nothing is mutated in place.
- [ ] KV keys reference a `KV_KEY_*` constant, not an inline string.
- [ ] CORS headers are present on every response branch.
- [ ] `bun run dev` starts cleanly and the request you changed returns the expected status (validated via `wrangler tail`).
