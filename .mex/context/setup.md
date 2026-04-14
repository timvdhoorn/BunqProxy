---
name: setup
description: Dev environment setup and commands for BunqProxy. Load when setting up the project for the first time or when environment issues arise.
triggers:
  - "setup"
  - "install"
  - "wrangler"
  - "kv namespace"
  - "getting started"
  - "how do I run"
edges:
  - target: context/stack.md
    condition: when specific Workers / wrangler / Bun details are needed
  - target: context/architecture.md
    condition: when understanding how components connect during setup
  - target: context/bunq-auth.md
    condition: when first-run handshake fails or KV cache needs to be cleared
last_updated: 2026-04-14
---

# Setup

## Prerequisites
- **Bun** (preferred) or Node.js 18+
- **Cloudflare account** with Workers + KV enabled
- **bunq production or sandbox API key** (`X-Bunq-Client-Authentication` source secret)
- `wrangler` is installed via devDependencies — invoked through `bun run` or `bunx wrangler`

## First-time Setup
1. `bun install`
2. `bunx wrangler kv namespace create BUNQ_SESSION` — copy the returned `id` into `wrangler.toml` under `[[kv_namespaces]]` as the `BUNQ_SESSION` binding.
3. `bunx wrangler secret put BUNQ_API_KEY` — paste the bunq API key.
4. `bunx wrangler secret put PROXY_TOKEN` — paste a long random string; this is the Bearer token clients will send.
5. (Optional) Set `ALLOWED_IPS` as a `[vars]` entry in `wrangler.toml` (comma-separated IPs) for the IP allowlist.
6. Edit `src/config.ts` to choose `mode` (`read-only` default) and any `allowedEndpoints` for `custom` mode.
7. `bun run dev` to run locally, or `bun run deploy` to ship.

## Environment Variables
All bound through `wrangler.toml` / `wrangler secret`:
- `PROXY_TOKEN` (required, secret) — Bearer token clients must send in `Authorization: Bearer <PROXY_TOKEN>`.
- `BUNQ_API_KEY` (required, secret) — bunq API key used as the device-server / session-server `secret`.
- `BUNQ_SESSION` (required, KV binding) — KV namespace storing keypair, installation, device, session entries.
- `ALLOWED_IPS` (optional, var) — comma-separated client IPs. When unset, IP check is skipped; when set, `CF-Connecting-IP` must match exactly.

## Common Commands
- `bun run dev` — `wrangler dev`, local Worker on `http://localhost:8787` with a remote KV proxy.
- `bun run deploy` — `wrangler deploy`, ships to the configured Workers route.
- `bun run tail` — `wrangler tail`, streams structured JSON logs from `logRequest`.
- `bunx wrangler secret put <NAME>` — set/rotate a secret.
- `bunx wrangler kv key delete --binding=BUNQ_SESSION bunq:session` — force a fresh bunq session on the next request (useful when bunq returns stale-session errors).
- `bunx wrangler kv key list --binding=BUNQ_SESSION` — inspect cached keys.

## Common Issues
**`401 Unauthorized` from the worker:** Client is missing/sending the wrong `Authorization: Bearer <PROXY_TOKEN>`. Verify `wrangler secret list` shows `PROXY_TOKEN`.

**`403 Forbidden — IP not allowed`:** `ALLOWED_IPS` is set and the client's `CF-Connecting-IP` is not in the list. Either remove the var or add the IP.

**`403 Forbidden — Read-only mode`:** Default `config.mode` is `read-only`; non-`GET` requests are rejected. Switch mode in `src/config.ts` and redeploy.

**`502` with bunq error message:** The handshake or the upstream call failed. Run `bun run tail`, find the JSON line with `bunqStatus`, then read the error message. If it mentions installation/device/session being invalid, delete the relevant `bunq:*` KV keys (see Common Commands) so the next request rebuilds the session — see `context/bunq-auth.md`.

**Session keeps re-handshaking on every request:** `BUNQ_SESSION` KV binding is missing or pointing at a different namespace per environment. Check `wrangler.toml` and `wrangler kv namespace list`.
