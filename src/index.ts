import { isAllowed } from "./permissions";
import { logRequest, type RequestLogEntry } from "./logger";
import { getSessionToken, forwardRequest } from "./bunq";

export interface Env {
  PROXY_TOKEN: string;
  BUNQ_API_KEY: string;
  BUNQ_SESSION: KVNamespace;
  ALLOWED_IPS?: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function validateAuth(request: Request, proxyToken: string): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return false;

  const [scheme, token] = authHeader.split(" ");
  return scheme === "Bearer" && token === proxyToken;
}

function validateIP(request: Request, allowedIPs?: string): boolean {
  if (!allowedIPs) return true;

  const clientIP = request.headers.get("CF-Connecting-IP");
  if (!clientIP) return false;

  const allowlist = allowedIPs.split(",").map((ip) => ip.trim());
  return allowlist.includes(clientIP);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!validateAuth(request, env.PROXY_TOKEN)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (!validateIP(request, env.ALLOWED_IPS)) {
      return jsonResponse({ error: "Forbidden", reason: "IP not allowed" }, 403);
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const permission = isAllowed(method, path);

    const logEntry: RequestLogEntry = {
      timestamp: new Date().toISOString(),
      method,
      path,
      allowed: permission.allowed,
      reason: permission.reason,
    };

    if (!permission.allowed) {
      logRequest(logEntry);
      return jsonResponse(
        { error: "Forbidden", reason: permission.reason },
        403
      );
    }

    try {
      const sessionToken = await getSessionToken(
        env.BUNQ_SESSION,
        env.BUNQ_API_KEY
      );

      const response = await forwardRequest(request, sessionToken);

      logRequest({ ...logEntry, bunqStatus: response.status });

      const responseHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        responseHeaders.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";

      logRequest({ ...logEntry, bunqStatus: 500 });

      return jsonResponse({ error: message }, 502);
    }
  },
} satisfies ExportedHandler<Env>;
