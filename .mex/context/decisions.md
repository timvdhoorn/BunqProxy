---
name: decisions
description: Key architectural and technical decisions for BunqProxy with reasoning. Load when making design choices or understanding why something is built a certain way.
triggers:
  - "why do we"
  - "why is it"
  - "decision"
  - "alternative"
  - "we chose"
edges:
  - target: context/architecture.md
    condition: when a decision relates to system structure
  - target: context/stack.md
    condition: when a decision relates to a technology choice
  - target: context/bunq-auth.md
    condition: when a decision relates to the bunq session/handshake
last_updated: 2026-04-14
---

# Decisions

## Decision Log

### Cloudflare Worker as the proxy runtime
**Date:** 2025 (origin commit, exact date in git history)
**Status:** Active
**Decision:** Run BunqProxy as a single Cloudflare Worker with one KV namespace for state.
**Reasoning:** Free/cheap globally distributed HTTPS endpoint, no server to maintain, native `crypto.subtle` for the bunq RSA signing requirement, KV is enough for the four cached values we need.
**Alternatives considered:** Node + Express on a VPS (rejected — operational overhead, TLS termination, no need for long-lived processes); AWS Lambda (rejected — cold-start cost on the bunq handshake hurts more than KV-cached sessions on Workers).
**Consequences:** No Node APIs available — must use Web Crypto, native `fetch`, and `KVNamespace`. Session/keypair persistence is bound to one KV namespace per environment.

### Permission policy is static TypeScript in `src/config.ts`
**Date:** 2025
**Status:** Active
**Decision:** Permission mode and endpoint rules are a typed constant in source, not runtime config / KV / env vars.
**Reasoning:** Policy changes are security-critical and should require a code review + deploy, not a KV write. Type system catches typos in `mode` / rule shape at build time.
**Alternatives considered:** KV-backed config (rejected — anyone with KV write would silently widen permissions); env vars (rejected — unstructured, no type safety on patterns).
**Consequences:** Changing scope requires editing `src/config.ts` and redeploying. There is no per-token scoping — one `PROXY_TOKEN` shares one policy.

### Always-blocked DELETE endpoints regardless of mode
**Date:** 2025
**Status:** Active
**Decision:** `DELETE` on `/v1/installation/*`, `/v1/device-server/*`, and `/v1/session/*` is hard-blocked in `config.blockedEndpoints` and checked before mode evaluation in `isAllowed`.
**Reasoning:** A client that can delete the proxy's own installation/device/session can brick the worker until KV is manually cleared. These are never legitimate calls from a client.
**Alternatives considered:** Trusting `read-only` mode to cover it (rejected — `read-write` and `custom` modes would still allow it); checking only on KV-key paths (rejected — pattern wildcards are simpler to reason about).
**Consequences:** `blockedEndpoints` must be preserved on every edit to `src/config.ts`. The non-negotiables in `AGENTS.md` enforce this.

### Cache bunq session for 25 minutes in KV
**Date:** 2025
**Status:** Active
**Decision:** `SESSION_TTL_SECONDS = 25 * 60`; session is stored in KV under `bunq:session` with both an `expiresAt` field and KV's own `expirationTtl`.
**Reasoning:** bunq sessions live longer than 25 minutes, but we expire early to avoid mid-request expiry races. Storing `expiresAt` in the value lets us check freshness without trusting KV TTL alone (KV is eventually consistent).
**Alternatives considered:** Re-handshaking on every request (rejected — adds 3 extra round trips and rate-limit pressure on bunq); longer TTL (rejected — narrows the safety margin).
**Consequences:** First request after a cold cache pays the full installation/device-server/session-server cost. See `context/bunq-auth.md`.

### IP allowlist via `ALLOWED_IPS` is opt-in
**Date:** 2025 (commit `12f8bfa feat: add IP allowlist and bunq-proxy skill`)
**Status:** Active
**Decision:** `validateIP` returns `true` when `ALLOWED_IPS` is unset, otherwise checks `CF-Connecting-IP` against a comma-separated list.
**Reasoning:** Bearer-token auth is the primary gate; IP allowlisting is a defence-in-depth layer that's useful when the client has a stable egress.
**Alternatives considered:** Required IP allowlist (rejected — breaks mobile / dynamic-IP clients); CIDR ranges (deferred — exact-match is enough today).
**Consequences:** No CIDR support; if the client roams, leave `ALLOWED_IPS` unset and rely on `PROXY_TOKEN` rotation.
