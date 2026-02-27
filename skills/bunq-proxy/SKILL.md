---
name: bunq-proxy
description: Use when interacting with bunq bank accounts via the BunqProxy. Provides the proxy URL, authentication method, and all available GET endpoints for accounts, payments, cards, insights, and more.
---

# BunqProxy — API Reference for AI Agents

## Setup (first use)

Before making any API calls, check if you have `BUNQ_PROXY_URL` and `BUNQ_PROXY_TOKEN`. If not, ask the user:

> "I need your BunqProxy connection details. Please provide:
> 1. Your proxy URL (e.g. `https://your-worker.workers.dev`)
> 2. Your Bearer token"

Store these as environment variables `BUNQ_PROXY_URL` and `BUNQ_PROXY_TOKEN` for subsequent calls.

## Connection

- **Proxy URL**: `$BUNQ_PROXY_URL`
- **Auth**: Bearer token in the `Authorization` header
- **Read-only**: Only `GET` requests are allowed (default mode)

```bash
curl -H "Authorization: Bearer $BUNQ_PROXY_TOKEN" "$BUNQ_PROXY_URL/v1/user"
```

All responses are JSON, forwarded directly from the bunq API. Responses follow bunq's `{ "Response": [...] }` envelope format.

## Endpoints

All paths are relative to the proxy URL. Replace `{userID}` and `{accountID}` with actual IDs obtained from prior calls.

### User Info

| Endpoint | Description |
|----------|-------------|
| `GET /v1/user` | List all users (returns your userID) |
| `GET /v1/user/{userID}` | Get user details |

### Monetary Accounts

| Endpoint | Description |
|----------|-------------|
| `GET /v1/user/{userID}/monetary-account` | List all accounts (may exclude primary bank accounts) |
| `GET /v1/user/{userID}/monetary-account-bank` | List bank accounts including Main (use this for checking accounts) |
| `GET /v1/user/{userID}/monetary-account-savings` | List savings accounts |
| `GET /v1/user/{userID}/monetary-account/{accountID}` | Get single account details + balance |

### Payments & Transactions

| Endpoint | Description |
|----------|-------------|
| `GET /v1/user/{userID}/monetary-account/{accountID}/payment` | List payments |
| `GET /v1/user/{userID}/monetary-account/{accountID}/payment/{paymentID}` | Get single payment |

### Cards

| Endpoint | Description |
|----------|-------------|
| `GET /v1/user/{userID}/card` | List all cards |
| `GET /v1/user/{userID}/card/{cardID}` | Get card details |

### Payment Requests

| Endpoint | Description |
|----------|-------------|
| `GET /v1/user/{userID}/monetary-account/{accountID}/request-inquiry` | Sent payment requests |
| `GET /v1/user/{userID}/monetary-account/{accountID}/request-response` | Received payment requests |

### Scheduled Payments

| Endpoint | Description |
|----------|-------------|
| `GET /v1/user/{userID}/monetary-account/{accountID}/schedule` | List recurring payments |
| `GET /v1/user/{userID}/monetary-account/{accountID}/schedule/{scheduleID}` | Get schedule details |

### Insights (Spending Analytics)

| Endpoint | Description |
|----------|-------------|
| `GET /v1/user/{userID}/insights` | Spending insights for user |
| `GET /v1/user/{userID}/monetary-account/{accountID}/insight` | Insights per account |

### Events (Activity Feed)

| Endpoint | Description |
|----------|-------------|
| `GET /v1/user/{userID}/event` | Activity feed (payments, requests, card events) |

### Exports & Statements

| Endpoint | Description |
|----------|-------------|
| `GET /v1/user/{userID}/monetary-account/{accountID}/customer-statement` | List statements |
| `GET /v1/user/{userID}/monetary-account/{accountID}/export-annual-overview` | Annual overviews |

### Invoices

| Endpoint | Description |
|----------|-------------|
| `GET /v1/user/{userID}/invoice` | List bunq invoices |

## Pagination

All list endpoints support pagination via query parameters:

| Parameter | Description |
|-----------|-------------|
| `count` | Number of items per page (default 10, max 200) |
| `older_id` | Fetch items older than this ID (for paging backwards) |
| `newer_id` | Fetch items newer than this ID (for paging forwards) |

```bash
# Get 50 most recent payments
curl -H "Authorization: Bearer $BUNQ_PROXY_TOKEN" \
  "$BUNQ_PROXY_URL/v1/user/{userID}/monetary-account/{accountID}/payment?count=50"

# Get next page (older items)
curl -H "Authorization: Bearer $BUNQ_PROXY_TOKEN" \
  "$BUNQ_PROXY_URL/v1/user/{userID}/monetary-account/{accountID}/payment?count=50&older_id=12345"
```

## Tips

- **Use `/monetary-account-bank`** as default for listing accounts — `/monetary-account` may exclude primary bank accounts
- **Filter on `status: ACTIVE`** — responses often include old cancelled accounts

## Typical Workflow

1. `GET /v1/user` → extract `userID` from response
2. `GET /v1/user/{userID}/monetary-account-bank` → list bank accounts (including Main), get `accountID`s
3. Filter accounts where `status === "ACTIVE"`
4. `GET /v1/user/{userID}/monetary-account/{accountID}/payment?count=50` → fetch transactions
