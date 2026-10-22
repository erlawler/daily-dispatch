// Credentials are sent only to the fixed providers used by this application.
// Redirects are never followed with OAuth tokens, API keys, or delivery secrets.
const PROVIDER_ORIGINS = new Set([
  'https://oauth2.googleapis.com', 'https://www.googleapis.com', 'https://gmail.googleapis.com',
  'https://accounts.spotify.com', 'https://api.spotify.com', 'https://api.notion.com',
  'https://api.todoist.com', 'https://api.anthropic.com', 'https://api.resend.com',
  'https://api.pushover.net',
]);
export const UPSTREAM_TIMEOUT_MS = 15_000;

export async function providerFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input);
  if (!PROVIDER_ORIGINS.has(url.origin) || url.username || url.password || url.hash) {
    throw new Error('Unapproved provider URL');
  }
  const response = await fetch(url.toString(), {
    ...init, redirect: 'manual', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error('Provider redirect rejected');
  }
  return response;
}

export function apiResponse(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return Response.json(body, {status, headers: {
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000',
    ...Object.fromEntries(new Headers(extra)),
  }});
}
