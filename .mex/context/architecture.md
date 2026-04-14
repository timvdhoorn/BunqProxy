---
name: architecture
description: How the major pieces of BunqProxy connect and flow. Load when working on system design, integrations, or understanding how a request moves through the worker.
triggers:
  - "architecture"
  - "system design"
  - "request flow"
  - "how does X connect to Y"
  - "integration"
edges:
  - target: context/stack.md
    condition: when specific Cloudflare/bunq technology details are needed
  - target: context/decisions.md
    condition: when understanding why the architecture is structured this way
  - target: context/bunq-auth.md
    condition: when working on the bunq installation/device-server/session-server handshake or KV-cached session lifecycle
  - target: patterns/INDEX.md
    condition: when starting any concrete task on this worker
last_updated: 2026-04-14
---

# Architecture

## System Overview
Single Cloudflare Worker entrypoint (`src/index.ts#fetch`). Each request flows:
1. CORS preflight short-circuits on `OPTIONS`.
2. `validateAuth` checks the client's `Authorization: Bearer <PROXY_TOKEN>`.
3. `validateIP` checks `CF-Connecting-IP` against the optional `ALLOWED_IPS` allowlist.
4. `isAllowed(method, path)` (`src/permissions.ts`) evaluates `config` mode + blocked rules.
5. `getSessionToken(BUNQ_SESSION, BUNQ_API_KEY)` (`src/bunq.ts`) returns a cached or freshly-created bunq session token, doing the full installation → device-server → session-server handshake when the KV cache is cold/expired.
6. `forwardRequest` re-issues the request to `https://api.bunq.com` with bunq headers and the session token, then streams the response back with CORS headers.
7. `logRequest` (`src/logger.ts`) emits a structured JSON line for every request; view via `wrangler tail`.

## Key Components
- **`src/index.ts`** — Worker `fetch` handler. Does auth, IP allowlist, permission check, calls bunq layer, attaches CORS, logs. Depends on `permissions`, `bunq`, `logger`.
- **`src/permissions.ts`** — Pure permission evaluator. `matchPattern` uses `*` as a single-segment wildcard (segment count must match). Always checks `blockedEndpoints` first, then mode (`read-only` | `read-write` | `custom`).
- **`src/bunq.ts`** — bunq API client and session manager. Owns Web Crypto RSA-2048 keypair, KV caching of keypair / installation / device-server / session, request signing for the handshake POSTs, and `forwardRequest` for plain proxying. Depends on the `BUNQ_SESSION` KV namespace.
- **`src/config.ts`** — Static `PermissionConfig`. Single source of truth for `mode`, `allowedEndpoints`, `blockedEndpoints`. Edits to permission policy go here.
- **`src/logger.ts`** — `logRequest` writes a JSON line to `console.log` with the `RequestLogEntry` shape (timestamp, method, path, allowed, reason, bunqStatus).

## External Dependencies
- **bunq API (`https://api.bunq.com/v1`)** — the upstream being proxied. Requires installation → device-server → session-server flow before any user-scoped call. Signed POSTs use RSA-2048 PKCS1-v1_5 over the raw body. Sessions expire; we cache for 25 minutes (`SESSION_TTL_SECONDS`).
- **Cloudflare KV (`BUNQ_SESSION` binding)** — persistent storage for `bunq:keypair`, `bunq:installation`, `bunq:device`, `bunq:session`. KV is eventually consistent — assume reads may be slightly stale across regions.
- **Cloudflare Workers runtime** — `crypto.subtle` (Web Crypto), `fetch`, `KVNamespace`, no Node APIs. Configured via `wrangler.toml` (KV binding, secrets `PROXY_TOKEN` / `BUNQ_API_KEY`, optional var `ALLOWED_IPS`).

## What Does NOT Exist Here
- No request body validation or schema enforcement — bunq is the source of truth on payloads. The proxy only gates by method + path pattern.
- No rate limiting, quota, or per-token scoping — there is exactly one `PROXY_TOKEN` and one set of permission rules in `src/config.ts`.
- No tests, linter, or formatter configured — `package.json` has only `dev`/`deploy`/`tail` scripts.
- No multi-tenant support — one bunq API key, one KV namespace, one worker = one bunq account.
- No retry logic or circuit breaker — bunq errors are surfaced directly as `502` to the client.
