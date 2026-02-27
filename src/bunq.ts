const BUNQ_API_HOST = "https://api.bunq.com";
const BUNQ_API_BASE = `${BUNQ_API_HOST}/v1`;
const SESSION_TTL_SECONDS = 25 * 60;
const KV_KEY_KEYPAIR = "bunq:keypair";
const KV_KEY_INSTALLATION = "bunq:installation";
const KV_KEY_DEVICE = "bunq:device";
const KV_KEY_SESSION = "bunq:session";

interface StoredKeyPair {
  readonly publicKeyPem: string;
  readonly privateKeyJwk: JsonWebKey;
}

interface InstallationData {
  readonly token: string;
  readonly serverPublicKey: string;
}

interface SessionData {
  readonly token: string;
  readonly expiresAt: number;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function generateKeyPair(): Promise<{
  publicKeyPem: string;
  privateKey: CryptoKey;
  privateKeyJwk: JsonWebKey;
}> {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;

  const publicKeyBuffer = await crypto.subtle.exportKey(
    "spki",
    keyPair.publicKey
  ) as ArrayBuffer;
  const publicKeyBase64 = arrayBufferToBase64(publicKeyBuffer);
  const publicKeyPem = [
    "-----BEGIN PUBLIC KEY-----",
    ...publicKeyBase64.match(/.{1,64}/g)!,
    "-----END PUBLIC KEY-----",
  ].join("\n");

  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey) as JsonWebKey;

  return { publicKeyPem, privateKey: keyPair.privateKey, privateKeyJwk };
}

async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function signBody(
  privateKey: CryptoKey,
  body: string
): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    encoder.encode(body)
  );
  return arrayBufferToBase64(signature);
}

async function getOrCreateKeyPair(
  kv: KVNamespace
): Promise<{ publicKeyPem: string; privateKey: CryptoKey }> {
  const stored = await kv.get<StoredKeyPair>(KV_KEY_KEYPAIR, "json");

  if (stored) {
    const privateKey = await importPrivateKey(stored.privateKeyJwk);
    return { publicKeyPem: stored.publicKeyPem, privateKey };
  }

  const { publicKeyPem, privateKey, privateKeyJwk } = await generateKeyPair();

  await kv.put(
    KV_KEY_KEYPAIR,
    JSON.stringify({ publicKeyPem, privateKeyJwk } satisfies StoredKeyPair)
  );

  return { publicKeyPem, privateKey };
}

async function bunqPost(
  endpoint: string,
  body: Record<string, unknown>,
  authToken: string,
  privateKey: CryptoKey | null
): Promise<Response> {
  const bodyString = JSON.stringify(body);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "User-Agent": "bunq-proxy/1.0",
    "X-Bunq-Client-Request-Id": crypto.randomUUID(),
    "X-Bunq-Geolocation": "0 0 0 0 000",
    "X-Bunq-Language": "en_US",
    "X-Bunq-Region": "nl_NL",
  };

  if (authToken) {
    headers["X-Bunq-Client-Authentication"] = authToken;
  }

  if (privateKey) {
    headers["X-Bunq-Client-Signature"] = await signBody(privateKey, bodyString);
  }

  return fetch(`${BUNQ_API_BASE}${endpoint}`, {
    method: "POST",
    headers,
    body: bodyString,
  });
}

async function createInstallation(
  kv: KVNamespace,
  publicKeyPem: string
): Promise<InstallationData> {
  const cached = await kv.get<InstallationData>(KV_KEY_INSTALLATION, "json");
  if (cached) {
    return cached;
  }

  const response = await bunqPost(
    "/installation",
    { client_public_key: publicKeyPem },
    "",
    null
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Installation failed (${response.status}): ${text}`);
  }

  interface InstallationResponse {
    Response: Array<
      | { Id: { id: number } }
      | { Token: { token: string } }
      | { ServerPublicKey: { server_public_key: string } }
    >;
  }

  const json = (await response.json()) as InstallationResponse;
  const entries = json.Response;

  const tokenEntry = entries.find(
    (e): e is { Token: { token: string } } => "Token" in e
  );
  const keyEntry = entries.find(
    (e): e is { ServerPublicKey: { server_public_key: string } } =>
      "ServerPublicKey" in e
  );

  if (!tokenEntry || !keyEntry) {
    throw new Error("Unexpected installation response structure");
  }

  const data: InstallationData = {
    token: tokenEntry.Token.token,
    serverPublicKey: keyEntry.ServerPublicKey.server_public_key,
  };

  await kv.put(KV_KEY_INSTALLATION, JSON.stringify(data));

  return data;
}

async function ensureDeviceServer(
  kv: KVNamespace,
  apiKey: string,
  installationToken: string,
  privateKey: CryptoKey
): Promise<void> {
  const cached = await kv.get(KV_KEY_DEVICE);
  if (cached) return;

  const response = await bunqPost(
    "/device-server",
    { description: "BunqProxy Cloudflare Worker", secret: apiKey, permitted_ips: ["*"] },
    installationToken,
    privateKey
  );

  if (response.ok) {
    await kv.put(KV_KEY_DEVICE, "registered");
    return;
  }

  const text = await response.text();
  const alreadyExists =
    text.includes("already") || text.includes("Device") || response.status === 409;

  if (alreadyExists) {
    await kv.put(KV_KEY_DEVICE, "registered");
    return;
  }

  throw new Error(`Device-server failed (${response.status}): ${text}`);
}

async function createSessionServer(
  apiKey: string,
  installationToken: string,
  privateKey: CryptoKey
): Promise<string> {
  const response = await bunqPost(
    "/session-server",
    { secret: apiKey },
    installationToken,
    privateKey
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Session-server failed (${response.status}): ${text}`);
  }

  interface SessionResponse {
    Response: Array<
      | { Id: { id: number } }
      | { Token: { token: string } }
      | { UserPerson?: unknown; UserCompany?: unknown; UserApiKey?: unknown }
    >;
  }

  const json = (await response.json()) as SessionResponse;
  const tokenEntry = json.Response.find(
    (e): e is { Token: { token: string } } => "Token" in e
  );

  if (!tokenEntry) {
    throw new Error("Unexpected session-server response structure");
  }

  return tokenEntry.Token.token;
}

export async function getSessionToken(
  kv: KVNamespace,
  apiKey: string
): Promise<string> {
  const cached = await kv.get<SessionData>(KV_KEY_SESSION, "json");

  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const { publicKeyPem, privateKey } = await getOrCreateKeyPair(kv);

  const installation = await createInstallation(kv, publicKeyPem);

  await ensureDeviceServer(kv, apiKey, installation.token, privateKey);

  const sessionToken = await createSessionServer(
    apiKey,
    installation.token,
    privateKey
  );

  const sessionData: SessionData = {
    token: sessionToken,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };

  await kv.put(KV_KEY_SESSION, JSON.stringify(sessionData), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  return sessionToken;
}

export async function forwardRequest(
  request: Request,
  sessionToken: string
): Promise<Response> {
  const url = new URL(request.url);
  const bunqUrl = `${BUNQ_API_HOST}${url.pathname}${url.search}`;

  const headers = new Headers({
    "Cache-Control": "no-cache",
    "User-Agent": "bunq-proxy/1.0",
    "X-Bunq-Client-Authentication": sessionToken,
    "X-Bunq-Client-Request-Id": crypto.randomUUID(),
    "X-Bunq-Geolocation": "0 0 0 0 000",
    "X-Bunq-Language": "en_US",
    "X-Bunq-Region": "nl_NL",
  });

  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.headers.get("content-type")
  ) {
    headers.set("Content-Type", request.headers.get("content-type")!);
  }

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.text()
      : null;

  const response = await fetch(bunqUrl, {
    method: request.method,
    headers,
    body,
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
