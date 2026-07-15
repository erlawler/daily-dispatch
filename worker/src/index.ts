// Worker entry: /api/dashboard route + 7am digest cron.
import { buildDashboard } from './dashboard';
import { sendDigest } from './digest';
import { currentHour } from './time';

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
  // Digest delivery — optional; each channel fires only if configured.
  RESEND_API_KEY?: string;
  DIGEST_TO?: string;
  DIGEST_FROM?: string;
  PUSHOVER_TOKEN?: string;
  PUSHOVER_USER?: string;
}

// Constant-time string comparison (Workers runtime extension), so the
// shared-secret check can't leak matching prefixes through response timing.
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return crypto.subtle.timingSafeEqual(ab, bb);
}

export default {
  // Only the Pages Function (which holds the shared secret) may call this —
  // the browser talks to its own origin, so no CORS surface is needed here.
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/api/dashboard') {
      const key = req.headers.get('X-Dispatch-Key') ?? '';
      if (!env.DISPATCH_KEY || !safeEqual(key, env.DISPATCH_KEY)) {
        return new Response('Forbidden', { status: 403 });
      }
      try {
        return Response.json(await buildDashboard(env));
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    return new Response('Not found', { status: 404 });
  },

  // Cron fires at 12:00 and 13:00 UTC on weekdays; we proceed only when it's
  // actually 7am in TIMEZONE, so the digest lands at 7am Central year-round (DST-safe).
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (currentHour(env.TIMEZONE) !== 7) return;
    const work = (async () => {
      const data = await buildDashboard(env);
      await sendDigest(env, data);
    })();
    ctx.waitUntil(work);
  },
} satisfies ExportedHandler<Env>;
