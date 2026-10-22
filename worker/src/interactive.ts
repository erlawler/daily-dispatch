import type { Env } from './index';
import { buildDashboard, type DashboardData } from './dashboard';
import { readCache, writeCache } from './cache';

export const REFRESH_COOLDOWN_SECONDS = 60;
const COOLDOWN_KEY = 'dashboard_refresh_after';
type Result = { data: DashboardData; retryAfter?: number; cooldown?: boolean };
type State = { until: number; inFlight?: Promise<Result> };
const states = new WeakMap<KVNamespace, State>();

export class RefreshCooldown extends Error {
  constructor(readonly retryAfter: number) { super('Refresh is cooling down'); }
}

// Dedupe in each isolate and persist a cooldown before the paid rebuild starts.
// KV is eventually consistent, so this is a cost brake, not a global rate-limit
// guarantee. Gateway rate limits remain the distributed enforcement boundary.
// Scheduled digest builds use their existing path and are unaffected.
export async function interactiveDashboard(env: Env, force: boolean): Promise<Result> {
  let state = states.get(env.TOKENS);
  if (!state) { state = {until: 0}; states.set(env.TOKENS, state); }
  const cached = await readCache(env);
  if (!force && cached) return {data: cached};
  if (state.inFlight) return state.inFlight;
  const current = state;
  const build = (async (): Promise<Result> => {
    const stored = Number(await env.TOKENS.get(COOLDOWN_KEY));
    const now = Date.now();
    const until = Math.max(current.until, Number.isFinite(stored) ? stored : 0);
    if (until > now) {
      const retryAfter = Math.ceil((until - now) / 1000);
      if (cached) return {data: cached, retryAfter, cooldown: true};
      throw new RefreshCooldown(retryAfter);
    }
    current.until = now + REFRESH_COOLDOWN_SECONDS * 1000;
    // Fail closed if the cooldown cannot be persisted. Never spend on a build
    // when the shared abuse control is unavailable.
    await env.TOKENS.put(COOLDOWN_KEY, String(current.until), {expirationTtl: REFRESH_COOLDOWN_SECONDS});
    const data = await buildDashboard(env);
    await writeCache(env, data);
    return {data, retryAfter: Math.max(1, Math.ceil((current.until - Date.now()) / 1000))};
  })();
  current.inFlight = build;
  try { return await build; }
  finally { current.inFlight = undefined; }
}
