// Worker entry: /api/dashboard route + the morning digest cron.
import { buildDashboard } from './dashboard';
import type { DashboardData } from './dashboard';
import { decideDigest, sendDigest } from './digest';
import { readCache, writeCache } from './cache';

export interface Env {
  TOKENS: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  NOTION_TOKEN: string;
  TODOIST_TOKEN: string;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  SPOTIFY_REFRESH_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  DISPATCH_KEY: string;
  TIMEZONE: string;
  // Public URL of the dashboard, linked from the digest. Set in wrangler.toml.
  DASHBOARD_URL?: string;
  // Digest delivery — optional; each channel fires only if configured.
  RESEND_API_KEY?: string;
  DIGEST_TO?: string;
  DIGEST_FROM?: string;
  PUSHOVER_TOKEN?: string;
  PUSHOVER_USER?: string;
}

// Local date of the last digest that actually went out, so catch-up runs can tell
// "not sent yet" from "already handled this morning".
const DIGEST_STATE_KEY = 'digest_last_sent';

// Constant-time string comparison (Workers runtime extension), so the
// shared-secret check can't leak matching prefixes through response timing.
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return crypto.subtle.timingSafeEqual(ab, bb);
}

// Decide, build, claim the day, then send.
//
// Claiming after the build means a transient build failure leaves the day open for
// the next catch-up fire. Claiming before the send keeps delivery at-most-once, so
// a catch-up can never duplicate a digest that already landed.
async function runDigest(env: Env): Promise<void> {
  const lastSent = await env.TOKENS.get(DIGEST_STATE_KEY);
  const decision = decideDigest(env.TIMEZONE, lastSent);

  if (!decision.send) {
    console.log(`digest ${decision.date}: skipped, ${decision.reason}`);
    return;
  }

  let data: DashboardData;
  try {
    data = await buildDashboard(env);
  } catch (err) {
    console.error(
      `digest ${decision.date}: build failed, will retry on catch-up: ${String(err)}`
    );
    return;
  }

  await env.TOKENS.put(DIGEST_STATE_KEY, decision.date);
  const results = await sendDigest(env, data);
  console.log(`digest ${decision.date}: sent (${decision.reason}): ${results.join('; ')}`);

  // The push lands first, the dashboard gets opened second. Warm the cache off
  // this build so that first load of the morning is instant.
  await writeCache(env, data);
}

export default {
  // Only the Pages Function (which holds the shared secret) may call this —
  // the browser talks to its own origin, so no CORS surface is needed here.
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/api/dashboard') {
      const key = req.headers.get('X-Dispatch-Key') ?? '';
      if (!env.DISPATCH_KEY || !safeEqual(key, env.DISPATCH_KEY)) {
        return new Response('Forbidden', { status: 403 });
      }
      try {
        // The refresh control asks for a rebuild; ordinary loads take the cache.
        if (url.searchParams.get('refresh') !== '1') {
          const cached = await readCache(env);
          if (cached) return Response.json(cached);
        }
        const data = await buildDashboard(env);
        ctx.waitUntil(writeCache(env, data));
        return Response.json(data);
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    return new Response('Not found', { status: 404 });
  },

  // Cron fires hourly from 12:00 to 15:00 UTC every day. Which of those runs
  // actually sends is decided in code (see decideDigest): weekday, 7am local, and
  // not already sent. Day-of-week is deliberately not expressed in the cron —
  // that field ran the digest Sun-Thu and never on Friday.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDigest(env));
  },
} satisfies ExportedHandler<Env>;
