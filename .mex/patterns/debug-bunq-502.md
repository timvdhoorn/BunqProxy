---
name: debug-bunq-502
description: Diagnose 502 / upstream failures from BunqProxy — distinguishes handshake failures, expired/poisoned session cache, signature errors, and network errors against api.bunq.com.
triggers:
  - "502"
  - "bunq error"
  - "Installation failed"
  - "Device-server failed"
  - "Session-server failed"
  - "X-Bunq-Client-Signature"
  - "wrangler tail"
edges:
  - target: context/bunq-auth.md
    condition: always — to map error messages to the handshake step
  - target: patterns/work-with-bunq-handshake.md
    condition: when the fix requires a code change in src/bunq.ts
  - target: context/setup.md
    condition: when the fix is to clear KV keys or rotate secrets
last_updated: 2026-04-14
---

# Debug bunq 502 / Upstream Failures

## Context
The worker maps any thrown error from `getSessionToken` or `forwardRequest` to `502 { error: message }`. The thrown messages come from `src/bunq.ts` and look like `"Installation failed (<status>): <body>"`, `"Device-server failed ..."`, `"Session-server failed ..."`, or `"Unexpected <step> response structure"`. Use the prefix to localise the failure.

## Steps
1. Open a tail: `bun run tail`.
2. Reproduce the failing request. Find the `RequestLogEntry` JSON line matching your `path` + `method`. Note `bunqStatus` and the response `error` body.
3. Match the error message to a step:
   - `Installation failed (...)` → `createInstallation`. KV key `bunq:installation` is the suspect.
   - `Device-server failed (...)` → `ensureDeviceServer`. KV key `bunq:device` is the suspect.
   - `Session-server failed (...)` → `createSessionServer`. Likely API key or `bunq:installation` is stale.
   - `Unexpected ... response structure` → bunq returned 200 but the shape changed. Likely a bunq API change.
   - bunq returns `401` on a forwarded (non-handshake) call → `bunq:session` is poisoned or expired between read and use.
4. Recovery actions in order of cost:
   - **Clear session only:** `bunx wrangler kv key delete --binding=BUNQ_SESSION bunq:session`. Re-run.
   - **Clear session + device:** also delete `bunq:device`. Re-run.
   - **Full reset:** also delete `bunq:installation`. Keypair stays — don't delete `bunq:keypair` unless you've also rotated the bunq API key, since the public key is registered on bunq's side under the installation.
   - **Rotate API key:** `bunx wrangler secret put BUNQ_API_KEY`, then full reset including `bunq:keypair` (the new key needs a fresh installation).
5. After recovery, hit one allowed `GET` and confirm `wrangler tail` shows a clean handshake → forwarded 200.

## Gotchas
- KV deletes propagate eventually. If recovery doesn't take immediately, wait 30–60s before retrying from another region.
- Deleting `bunq:keypair` without also clearing `bunq:installation` leaves bunq with a registered public key the worker no longer holds → all signed POSTs will 401. Always clear them together.
- A `502` whose `error` is a generic `"fetch failed"` is a Workers-side network issue to `api.bunq.com`, not a bunq error. Check Cloudflare status.
- Repeated handshakes on every request usually mean the `BUNQ_SESSION` binding is wrong (different namespace per env), not a code bug.
- Don't paste raw bunq error bodies into commits or issues — they may include account identifiers.

## Fix → Verify
- [ ] One allowed `GET` returns the expected upstream payload.
- [ ] `wrangler tail` shows exactly one handshake (cold) followed by warm-path requests with no re-handshake.
- [ ] No new error lines for the same path.
- [ ] If a code change was needed, the conventions Verify Checklist passed.

## Update Scaffold
- [ ] If the failure mode was new, add it to `context/bunq-auth.md` "Failure modes & recovery".
- [ ] If the recovery procedure surprised you, update this pattern.
- [ ] If the bunq API shape changed, update `src/bunq.ts` response parsing and note it in `context/decisions.md`.
