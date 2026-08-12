// Short-lived KV cache for the assembled dashboard payload.
// A cold build fans out to eight upstream APIs plus one model call. Without this,
// every page load and every tap of the refresh control pays that cost again.
import type { Env } from './index';
import type { DashboardData } from './dashboard';

const CACHE_KEY = 'dashboard_payload';

// Long enough that reloads are instant, short enough that the briefing still
// reflects a calendar change made a few minutes ago.
export const CACHE_TTL_SECONDS = 300;

export async function readCache(env: Env): Promise<DashboardData | null> {
  try {
    return await env.TOKENS.get<DashboardData>(CACHE_KEY, 'json');
  } catch {
    return null; // A cache miss and a cache fault are the same thing to the caller.
  }
}

export async function writeCache(env: Env, data: DashboardData): Promise<void> {
  try {
    await env.TOKENS.put(CACHE_KEY, JSON.stringify(data), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch {
    // A failed cache write must never fail the request that produced the data.
  }
}
