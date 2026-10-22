import { providerFetch } from './http';
// OAuth token refresh for Google and Spotify, with KV-cached access tokens.
import type { Env } from './index';

interface TokenCache {
  access_token: string;
  expires_at: number;
}

export async function getGoogleAccessToken(env: Env): Promise<string> {
  const cached = await env.TOKENS.get<TokenCache>('google_access', 'json');
  if (cached && cached.expires_at > Date.now() + 60_000) {
    return cached.access_token;
  }

  const resp = await providerFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) throw new Error(`Google token refresh failed: ${resp.status}`);

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  const expires_at = Date.now() + (data.expires_in - 60) * 1000;

  await env.TOKENS.put(
    'google_access',
    JSON.stringify({ access_token: data.access_token, expires_at }),
    { expirationTtl: data.expires_in }
  );

  return data.access_token;
}

export async function getSpotifyAccessToken(env: Env): Promise<string> {
  const cached = await env.TOKENS.get<TokenCache>('spotify_access', 'json');
  if (cached && cached.expires_at > Date.now() + 60_000) {
    return cached.access_token;
  }

  // Spotify refresh tokens can rotate — prefer a rotated one stashed in KV.
  const storedRefresh = await env.TOKENS.get('spotify_refresh');
  const refreshToken = storedRefresh || env.SPOTIFY_REFRESH_TOKEN;

  const basic = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
  const resp = await providerFetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!resp.ok) throw new Error(`Spotify token refresh failed: ${resp.status}`);

  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await env.TOKENS.put('spotify_refresh', data.refresh_token);
  }

  const expires_at = Date.now() + (data.expires_in - 60) * 1000;
  await env.TOKENS.put(
    'spotify_access',
    JSON.stringify({ access_token: data.access_token, expires_at }),
    { expirationTtl: data.expires_in }
  );

  return data.access_token;
}
