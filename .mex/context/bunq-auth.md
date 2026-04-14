---
name: bunq-auth
description: The bunq installation/device-server/session-server handshake, RSA signing, and KV-cached session lifecycle inside src/bunq.ts. Load when touching authentication, KV cache keys, request signing, or debugging upstream 401/handshake failures.
triggers:
  - "bunq auth"
  - "session token"
  - "installation"
  - "device-server"
  - "session-server"
  - "X-Bunq-Client-Signature"
  - "RSA"
  - "handshake"
  - "KV cache"
edges:
  - target: context/architecture.md
    condition: when situating the auth flow inside the overall request flow
  - target: context/decisions.md
    condition: when the 25-minute TTL or always-blocked DELETE rules are in question
  - target: context/setup.md
    condition: when clearing KV state to recover from a bad session
  - target: patterns/debug-bunq-502.md
    condition: when an upstream call is failing and you need a diagnosis playbook
last_updated: 2026-04-14
---

# bunq Auth & Session Lifecycle

All logic lives in `src/bunq.ts`. The exported surface is just `getSessionToken` and `forwardRequest`; everything else is private.

## KV keys (constants — never inline)
- `bunq:keypair` → `StoredKeyPair { publicKeyPem, privateKeyJwk }`
- `bunq:installation` → `InstallationData { token, serverPublicKey }`
- `bunq:device` → literal `"registered"` sentinel
- `bunq:session` → `SessionData { token, expiresAt }`, also written with KV `expirationTtl: SESSION_TTL_SECONDS`

## Handshake flow (cold cache)
`getSessionToken(kv, apiKey)`:
1. Read `bunq:session`. If present and `expiresAt > Date.now()`, return `cached.token`. Done.
2. `getOrCreateKeyPair(kv)` — RSA-2048 PKCS1-v1_5 via `crypto.subtle.generateKey`, exported as `spki`/PEM (public) and `jwk` (private). Stored in `bunq:keypair`. Re-imported with `importPrivateKey` on hits.
3. `createInstallation(kv, publicKeyPem)` — POST `/v1/installation` with `{ client_public_key }`, no auth, no signature. Cached in `bunq:installation`. Returns `{ token, serverPublicKey }`.
4. `ensureDeviceServer(kv, apiKey, installationToken, privateKey)` — POST `/v1/device-server` with `{ description, secret: apiKey, permitted_ips: ["*"] }`, signed, auth header = installation token. On success or `409 / "already" / "Device"` body, write `bunq:device = "registered"`.
5. `createSessionServer(apiKey, installationToken, privateKey)` — POST `/v1/session-server` with `{ secret: apiKey }`, signed, auth header = installation token. Returns the new session token.
6. Write `bunq:session` with `expiresAt = Date.now() + 25min` and KV `expirationTtl`.

## Request signing
`signBody(privateKey, body)`:
- Algorithm: `RSASSA-PKCS1-v1_5` with `SHA-256` (set on key import and on `crypto.subtle.sign`).
- Signs the **exact stringified body** that goes on the wire (`JSON.stringify(body)` once, reused).
- Output is base64 of the raw signature bytes via `arrayBufferToBase64`. Header: `X-Bunq-Client-Signature`.
- Only the three handshake POSTs are signed. `forwardRequest` does **not** sign — it just attaches the cached session token as `X-Bunq-Client-Authentication`.

## Common bunq headers (set in `bunqPost` and `forwardRequest`)
- `X-Bunq-Client-Request-Id`: `crypto.randomUUID()` per request
- `X-Bunq-Geolocation`: `"0 0 0 0 000"`
- `X-Bunq-Language`: `"en_US"`
- `X-Bunq-Region`: `"nl_NL"`
- `User-Agent`: `"bunq-proxy/1.0"`
- `Cache-Control`: `"no-cache"`

## Failure modes & recovery
- **`installation` cached but bunq rejects it** → delete `bunq:installation`, `bunq:device`, `bunq:session`. Keypair stays.
- **`device-server` returns non-409 error mentioning `permitted_ips`** → bunq doesn't trust `["*"]` for this account; you'll need to set the actual Worker egress range (Cloudflare ranges).
- **`session-server` 401** → API key is wrong or revoked. Rotate `BUNQ_API_KEY` secret and clear all `bunq:*` KV keys.
- **Mid-request session expiry** → the 25-minute TTL is intentionally below bunq's real session lifetime to avoid this; if it still happens, lower `SESSION_TTL_SECONDS`.
- **Worker re-handshakes every request** → `bunq:session` is being written but reads come back stale (KV eventual consistency across regions) or the binding is wrong. Verify `wrangler.toml` and check `wrangler tail` for repeated `Installation` log lines.

## Invariants the auth layer relies on
- `getOrCreateKeyPair` must be called before any signed POST — `privateKey` is needed to sign.
- The body string passed to `signBody` and the body sent to `fetch` must be **byte-identical**. Do not re-stringify.
- KV writes use the typed constants `KV_KEY_*` — never inline a literal.
- `forwardRequest` must never sign; signing the user's payload would break bunq's session-token auth.
