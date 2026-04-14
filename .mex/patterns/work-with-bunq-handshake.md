---
name: work-with-bunq-handshake
description: Modify or extend the bunq installation/device-server/session-server handshake or signing in src/bunq.ts without breaking session caching.
triggers:
  - "bunq.ts"
  - "session token"
  - "installation"
  - "device-server"
  - "session-server"
  - "RSA"
  - "sign"
edges:
  - target: context/bunq-auth.md
    condition: always — this is the canonical reference for the handshake
  - target: context/conventions.md
    condition: when running the verify checklist
  - target: patterns/debug-bunq-502.md
    condition: when the change causes upstream calls to fail
last_updated: 2026-04-14
---

# Work With the bunq Handshake

## Context
- Read `context/bunq-auth.md` first — it documents KV keys, the cold-cache flow, signing, and recovery.
- All handshake logic is in `src/bunq.ts`. Only `getSessionToken` and `forwardRequest` are exported; keep new helpers private.
- Session is cached in KV under `bunq:session` for `SESSION_TTL_SECONDS = 25 * 60` with both an `expiresAt` field and KV `expirationTtl`.

## Steps
1. State which step you are touching: keypair / installation / device-server / session-server / forwarding / signing.
2. Reuse the `KV_KEY_*` constants. If you need a new KV key, add a new `KV_KEY_*` const at the top of `src/bunq.ts`.
3. For any new signed POST, route it through `bunqPost(endpoint, body, authToken, privateKey)` — do not hand-roll headers.
4. Preserve the byte-identity rule: `bunqPost` already calls `JSON.stringify(body)` once and uses the same string for both `signBody` and the `fetch` body. Any new code that signs must do the same.
5. If you're shortening the TTL, lower `SESSION_TTL_SECONDS`. Update both the `expiresAt` math and the KV `expirationTtl` argument together.
6. After changes, force a cold cache: `bunx wrangler kv key delete --binding=BUNQ_SESSION bunq:session` (and `bunq:installation` / `bunq:device` if you touched those steps).
7. `bun run dev`, hit one allowed endpoint, watch `wrangler tail` for a clean handshake then a forwarded response.

## Gotchas
- Re-stringifying the body before `fetch` after signing breaks the signature — bunq returns 401.
- Importing the JWK with the wrong algorithm name (must be `RSASSA-PKCS1-v1_5` + `SHA-256`) yields a key that can't sign.
- KV is eventually consistent across colos — a freshly written session may not be readable from another region for a few seconds. Don't rely on read-after-write.
- `ensureDeviceServer` treats `409` and bodies containing `"already"` / `"Device"` as success. If bunq changes its error text, the cache will go cold.
- Returning the bunq error body verbatim from `getSessionToken` would surface internal info — `index.ts` already wraps it in a `502 { error: message }`; keep it that way.
- `forwardRequest` must NEVER sign — it uses the cached session token only.

## Verify
- [ ] All KV reads/writes use a `KV_KEY_*` constant.
- [ ] No new signed POST hand-rolls headers — they go through `bunqPost`.
- [ ] Body string used for signing equals the body string sent on the wire.
- [ ] `getSessionToken` still returns the cached token on the warm path without doing extra `fetch` calls.
- [ ] Cold-cache test (after deleting `bunq:session`) succeeds on the first request.
- [ ] No secret or full upstream error body is leaked to the client response.
- [ ] Run the full conventions Verify Checklist.

## Debug
See `patterns/debug-bunq-502.md` for the upstream-failure playbook.

## Update Scaffold
- [ ] Update `.mex/context/bunq-auth.md` if KV keys, TTL, signing, or error-recovery semantics changed.
- [ ] Update `.mex/context/decisions.md` if the change reflects a TTL or trust-boundary decision.
- [ ] Append any new gotcha discovered during the task.
