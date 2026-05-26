// Worker entry, /api/dashboard route.
import { fetchGoogle } from './services/google';
import { fetchNotion } from './services/notion';
import { fetchTodoist } from './services/todoist';
import { fetchSpotify } from './services/spotify';
import { synthesizeGlance } from './synthesize';

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
        const [google, notion, todoist, spotify] = await Promise.all([
          fetchGoogle(env),
          fetchNotion(env),
          fetchTodoist(env),
          fetchSpotify(env),
        ]);

        const data = {
          calendar: google.calendar,
          horizon: google.horizon,
          emails: google.emails,
          tasks: todoist,
          notion,
          files: google.files,
          spotify,
        };

        const glance = await synthesizeGlance(data, env);
        return Response.json(
          { glance, ...data, generated_at: new Date().toISOString() },
          { headers: corsHeaders }
        );
      } catch (err) {
        return Response.json(
          { error: String(err) },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  },
} satisfies ExportedHandler<Env>;
