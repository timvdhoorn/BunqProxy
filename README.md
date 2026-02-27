# BunqProxy

A Cloudflare Worker that acts as a permission-controlled proxy to the [bunq API](https://doc.bunq.com/). Designed to give AI agents (or any client) restricted access to your bunq account — for example, read-only access to account balances and transactions, without the ability to create payments.

## Why

The bunq API key grants full access to your account. BunqProxy sits between your client and the bunq API and enforces permission rules before forwarding requests. This lets you safely hand a single Bearer token to an AI agent, knowing it can only perform the operations you explicitly allow.

```
Client ──(Bearer token)──▶ BunqProxy ──(session token)──▶ api.bunq.com
                               ↕
                          Cloudflare KV
                        (session cache)
```

## Features

- **Permission modes** — `read-only` (default), `read-write`, or `custom` with per-endpoint rules
- **Blocked endpoints** — always blocks destructive session management operations regardless of mode
- **Automatic session management** — handles the full bunq authentication flow (installation, device-server, session-server) and caches session tokens in KV
- **Request signing** — generates RSA-2048 keypairs via Web Crypto and signs requests per bunq requirements
- **Structured logging** — JSON logs for every request, viewable via `wrangler tail`
- **CORS support** — allows browser-based clients during development

## Permission Modes

Configure the mode in `src/config.ts`:

| Mode | Behavior |
|------|----------|
| `read-only` | Only `GET` requests are forwarded. All other methods return `403`. |
| `read-write` | All methods are forwarded, except blocked endpoints. |
| `custom` | Only requests matching `allowedEndpoints` are forwarded. |

Blocked endpoints are always enforced, regardless of mode. By default these block `DELETE` on `/v1/installation/*`, `/v1/device-server/*`, and `/v1/session/*` to prevent clients from destroying the proxy's own session.

### Custom mode example

```ts
export const config: PermissionConfig = {
  mode: "custom",
  allowedEndpoints: [
    { method: "GET", pattern: "/v1/user" },
    { method: "GET", pattern: "/v1/user/*/monetary-account" },
    { method: "GET", pattern: "/v1/user/*/monetary-account/*/payment" },
    { method: "POST", pattern: "/v1/user/*/monetary-account/*/payment" },
  ],
  blockedEndpoints: [
    { method: "DELETE", pattern: "/v1/installation/*" },
    { method: "DELETE", pattern: "/v1/device-server/*" },
    { method: "DELETE", pattern: "/v1/session/*" },
  ],
};
```

Patterns use `*` as a single-segment wildcard (matches one path segment, not `/`).

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ or [Bun](https://bun.sh/)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- A [bunq API key](https://doc.bunq.com/)

### 1. Install dependencies

```bash
bun install
```

### 2. Create a KV namespace

```bash
npx wrangler kv namespace create BUNQ_SESSION
```

Copy the `id` from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "BUNQ_SESSION"
id = "your-kv-namespace-id"
```

### 3. Set secrets

```bash
npx wrangler secret put PROXY_TOKEN    # the Bearer token clients use to authenticate with the proxy
npx wrangler secret put BUNQ_API_KEY   # your bunq API key
```

### 4. Deploy

```bash
npx wrangler deploy
```

## Local Development

Create a `.dev.vars` file (gitignored):

```
PROXY_TOKEN=your-local-test-token
BUNQ_API_KEY=your-bunq-api-key
```

Start the local dev server:

```bash
bun run dev
```

Test with curl:

```bash
# Should return account data (with valid API key)
curl -H "Authorization: Bearer your-local-test-token" http://localhost:8787/v1/user

# Should return 403 (read-only mode blocks POST)
curl -X POST -H "Authorization: Bearer your-local-test-token" http://localhost:8787/v1/user/1/payment

# Should return 401 (no token)
curl http://localhost:8787/v1/user
```

View structured logs:

```bash
bun run tail
```

## How It Works

### Request flow

1. Client sends a request with `Authorization: Bearer <PROXY_TOKEN>`
2. Proxy validates the Bearer token
3. Proxy checks the HTTP method and path against the permission config
4. If denied: returns `403` with a reason
5. If allowed: obtains a bunq session token (from cache or via the session flow), forwards the request to `api.bunq.com`, and returns the response

### Session management

The bunq API requires a 3-step authentication flow before making API calls. BunqProxy handles this automatically:

1. **Installation** — registers an RSA-2048 public key with bunq
2. **Device-server** — registers the device with the API key
3. **Session-server** — creates a session and receives a session token

All artifacts (keypair, installation token, session token) are cached in Cloudflare KV. Session tokens are cached with a 25-minute TTL and automatically refreshed.

## Project Structure

```
src/
├── index.ts          # Worker entry point, routing, auth
├── config.ts         # Permission mode and endpoint rules
├── permissions.ts    # Method/path permission checking
├── bunq.ts           # Session management and API forwarding
└── logger.ts         # Structured JSON logging
```

## API Reference

### Authentication

All requests require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <PROXY_TOKEN>
```

### Response codes

| Code | Meaning |
|------|---------|
| `2xx` | Forwarded from bunq API |
| `401` | Missing or invalid Bearer token |
| `403` | Request blocked by permission rules (includes `reason` in body) |
| `502` | Error communicating with bunq API |

### Error response format

```json
{
  "error": "Forbidden",
  "reason": "Read-only mode: POST not allowed"
}
```

## License

MIT
