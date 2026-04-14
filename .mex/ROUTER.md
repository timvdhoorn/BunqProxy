---
name: router
description: Session bootstrap and navigation hub. Read at the start of every session before any task. Contains project state, routing table, and behavioural contract.
edges:
  - target: context/architecture.md
    condition: when working on system design, integrations, or understanding how components connect
  - target: context/stack.md
    condition: when working with specific technologies, libraries, or making tech decisions
  - target: context/conventions.md
    condition: when writing new code, reviewing code, or unsure about project patterns
  - target: context/decisions.md
    condition: when making architectural choices or understanding why something is built a certain way
  - target: context/setup.md
    condition: when setting up the dev environment or running the project for the first time
  - target: context/bunq-auth.md
    condition: when touching the bunq handshake, signing, KV cache, or debugging upstream auth
  - target: patterns/INDEX.md
    condition: when starting a task — check the pattern index for a matching pattern file
last_updated: 2026-04-14
---

# Session Bootstrap

If you haven't already read `AGENTS.md`, read it now — it contains the project identity, non-negotiables, and commands.

Then read this file fully before doing anything else in this session.

## Current Project State

**Working:**
- Cloudflare Worker proxy with Bearer-token + optional IP-allowlist auth
- Permission gate (`read-only` / `read-write` / `custom`) with always-blocked DELETE on installation/device/session
- Full bunq handshake (installation → device-server → session-server) with KV-cached keypair, installation, device, and 25-minute session
- RSA-2048 PKCS1-v1_5 signing of handshake POSTs via Web Crypto
- Transparent forwarding of approved methods to `api.bunq.com` with CORS headers
- Structured JSON request logging (viewable via `wrangler tail`)
- `skills/bunq-proxy/` skill bundle (setup prompt + endpoint reference)

**Not yet built:**
- Per-token scoping / multi-tenant support (one `PROXY_TOKEN`, one policy)
- Rate limiting or request quotas
- Tests, linter, formatter
- CIDR support in `ALLOWED_IPS`
- Retry/backoff on transient bunq failures

**Known issues:**
- Cold KV read across regions can occasionally re-trigger the handshake even when a fresh session was just written (KV eventual consistency).
- bunq error bodies are returned to the client verbatim inside the `502` JSON — review whether any error path leaks sensitive context before adding new error types.

## Routing Table

Load the relevant file based on the current task. Always load `context/architecture.md` first if not already in context this session.

| Task type | Load |
|-----------|------|
| Understanding how the system works | `context/architecture.md` |
| Working with a specific technology | `context/stack.md` |
| Writing or reviewing code | `context/conventions.md` |
| Making a design decision | `context/decisions.md` |
| Setting up or running the project | `context/setup.md` |
| Touching bunq auth / signing / KV cache | `context/bunq-auth.md` |
| Any specific task | Check `patterns/INDEX.md` for a matching pattern |

## Behavioural Contract

For every task, follow this loop:

1. **CONTEXT** — Load the relevant context file(s) from the routing table above. Check `patterns/INDEX.md` for a matching pattern. If one exists, follow it. Narrate what you load: "Loading architecture context..."
2. **BUILD** — Do the work. If a pattern exists, follow its Steps. If you are about to deviate from an established pattern, say so before writing any code — state the deviation and why.
3. **VERIFY** — Load `context/conventions.md` and run the Verify Checklist item by item. State each item and whether the output passes. Do not summarise — enumerate explicitly.
4. **DEBUG** — If verification fails or something breaks, check `patterns/INDEX.md` for a debug pattern. Follow it. Fix the issue and re-run VERIFY.
5. **GROW** — After completing the task:
   - If no pattern exists for this task type, create one in `patterns/` using the format in `patterns/README.md`. Add it to `patterns/INDEX.md`. Flag it: "Created `patterns/<name>.md` from this session."
   - If a pattern exists but you deviated from it or discovered a new gotcha, update it with what you learned.
   - If any `context/` file is now out of date because of this work, update it surgically — do not rewrite entire files.
   - Update the "Current Project State" section above if the work was significant.
