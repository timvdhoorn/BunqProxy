---
name: stack
description: Technology stack and library choices for the BunqProxy Cloudflare Worker. Load when working with specific technologies or making decisions about libraries and tools.
triggers:
  - "library"
  - "package"
  - "dependency"
  - "wrangler"
  - "cloudflare"
  - "which tool"
edges:
  - target: context/decisions.md
    condition: when the reasoning behind a tech choice is needed
  - target: context/architecture.md
    condition: when understanding how a piece of the stack fits the request flow
  - target: context/setup.md
    condition: when installing or running the stack locally
last_updated: 2026-04-14
---

# Stack

## Core Technologies
- **TypeScript ^5.7** — strict TS, all source under `src/*.ts`.
- **Cloudflare Workers runtime** — fetch handler exported via `satisfies ExportedHandler<Env>`. No Node APIs available.
- **Wrangler 4** (`devDependency`) — dev server, deploy, secrets, tail, KV namespace management.
- **Bun** — package manager (`bun install`, `bun run dev`). `wrangler` itself is invoked under the hood.
- **`@cloudflare/workers-types ^4.20241230`** — type definitions for `KVNamespace`, `Request`, `ExportedHandler`, etc.

## Key Libraries
- **Web Crypto (`crypto.subtle`)** — RSA-2048 keypair generation, JWK import/export, RSASSA-PKCS1-v1_5 signing of the bunq handshake bodies. No `node:crypto`, no third-party crypto lib.
- **Cloudflare KV (`KVNamespace`)** — only persistence layer. Keys are hard-coded in `src/bunq.ts`: `bunq:keypair`, `bunq:installation`, `bunq:device`, `bunq:session`.
- **Native `fetch`** — used both for forwarding to bunq and for the handshake POSTs. No HTTP client library.

## What We Deliberately Do NOT Use
- **No Node.js dependencies** — must run unmodified on the Workers runtime. No `node:*` imports, no `Buffer`, no `process`.
- **No runtime dependencies in `package.json`** — `dependencies: {}`. Anything we add ships in the worker bundle and increases cold-start size.
- **No validation library (Zod etc.)** — we are a transparent proxy; payload shape is bunq's concern.
- **No test framework** — there is currently no test runner configured. If adding tests, raise it as a decision first.
- **No linter / formatter** — none configured. Match existing style by hand.

## Version Constraints
- Wrangler is pinned to major **4** (see commit `dc93179 chore: update wrangler to v4`). Do not downgrade to v3 — config syntax differs.
- Worker types are tied to the `2024-12-30` compat date family; mismatched compat dates can change `KVNamespace` and `fetch` semantics.
