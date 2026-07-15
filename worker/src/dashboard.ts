// Shared data builder used by both the /api/dashboard route and the cron digest.
import type { Env } from './index';
import { fetchGoogle } from './services/google';
import { fetchNotion } from './services/notion';
import { fetchTodoist } from './services/todoist';
import { fetchSpotify } from './services/spotify';
import { synthesizeGlance } from './synthesize';

export type SourceStatus = 'ok' | 'error';
export interface Sources {
  google: SourceStatus;
  notion: SourceStatus;
  todoist: SourceStatus;
  spotify: SourceStatus;
}

export async function buildDashboard(env: Env) {
  const [google, notion, todoist, spotify] = await Promise.all([
    fetchGoogle(env),
    fetchNotion(env),
    fetchTodoist(env),
    fetchSpotify(env),
  ]);

  // Per-source health, so a dead token renders as "needs attention" instead of
  // being indistinguishable from a genuinely quiet day.
  const sources: Sources = {
    google: google.ok ? 'ok' : 'error',
    notion: notion.ok ? 'ok' : 'error',
    todoist: todoist.ok ? 'ok' : 'error',
    spotify: spotify.ok ? 'ok' : 'error',
  };

  const data = {
    calendar: google.calendar,
    horizon: google.horizon,
    emails: google.emails,
    tasks: todoist.items,
    notion: notion.items,
    files: google.files,
    spotify: { playing: spotify.playing, recent: spotify.recent },
  };

  const glance = await synthesizeGlance(data, env);
  return { glance, ...data, sources, generated_at: new Date().toISOString() };
}

export type DashboardData = Awaited<ReturnType<typeof buildDashboard>>;
