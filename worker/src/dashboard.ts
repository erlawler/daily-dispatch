// Shared data builder used by both the /api/dashboard route and the cron digest.
import type { Env } from './index';
import { fetchGoogle } from './services/google';
import { fetchNotion } from './services/notion';
import { fetchTodoist } from './services/todoist';
import { fetchSpotify } from './services/spotify';
import { synthesizeGlance } from './synthesize';

export async function buildDashboard(env: Env) {
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
  return { glance, ...data, generated_at: new Date().toISOString() };
}

export type DashboardData = Awaited<ReturnType<typeof buildDashboard>>;
