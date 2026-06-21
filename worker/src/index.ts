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
  NOTION_DISPATCH_PAGE_ID: string;
  TODOIST_TOKEN: string;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  SPOTIFY_REFRESH_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  DISPATCH_KEY: string;
  TIMEZONE: string;
  // Digest delivery (optional — each channel fires only if configured):
  RESEND_API_KEY: string;
  DIGEST_TO: string;
  DIGEST_FROM: string;
  PUSHOVER_TOKEN: string;
  PUSHOVER_USER: string;
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/api/dashboard') {
      // Only the Pages Function (which holds the shared secret) may call this.
      if (req.headers.get('X-Dispatch-Key') !== env.DISPATCH_KEY) {
        return new Response('Forbidden', { status: 403, headers: corsHeaders });
      }
      try {
        const payload = await buildDashboard(env);
        return Response.json(payload, { headers: corsHeaders });
      } catch (err) {
        return Response.json(
          { error: String(err) },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
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
