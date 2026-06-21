// 7am digest delivery: an HTML email via Resend and a phone push via Pushover.
// Each channel is independent and only fires if its secrets are configured.
import type { Env } from './index';
import type { DashboardData } from './dashboard';
import { weekdayName } from './time';

const DASHBOARD_URL = 'https://dispatch.eric-lawler.com';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}

// ---- Email (Resend) ----

function emailHTML(d: DashboardData, weekday: string): string {
  const section = (title: string, rows: string[]) =>
    rows.length
      ? `<h2 style="font:600 13px/1.4 -apple-system,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5E7158;margin:28px 0 10px">${esc(
          title
        )}</h2>${rows.join('')}`
      : '';

  const row = (title: string, sub: string, lead = '') =>
    `<div style="padding:8px 0;border-bottom:1px solid #E0D7C4">
      ${lead ? `<span style="font:600 12px/1.5 -apple-system,sans-serif;color:#7A6F60;margin-right:8px">${esc(lead)}</span>` : ''}
      <span style="font:500 16px/1.4 Georgia,serif;color:#221E18">${esc(title)}</span>
      ${sub ? `<div style="font:13px/1.5 -apple-system,sans-serif;color:#7A6F60">${esc(sub)}</div>` : ''}
    </div>`;

  const cal = d.calendar.map((e) => row(e.title, e.sub, e.time));
  const hor = d.horizon.map((e) => row(e.title, e.sub, `${e.when} · ${e.time}`));
  const mail = d.emails.map((e) => row(e.subject, e.snippet, e.from));
  const tasks = d.tasks.map((t) => row(t.title, t.sub));
  const notes = d.notion.map((n) => row(n.title, n.sub));
  const files = d.files.map((f) => row(f.title, f.sub));
  const music = d.spotify.playing
    ? [row(d.spotify.playing.track, d.spotify.playing.artist, 'Now')]
    : d.spotify.recent.map((t) => row(t.track, t.artist));

  return `<div style="max-width:600px;margin:0 auto;padding:24px;background:#F4EFE6">
    <h1 style="font:400 italic 40px/1 Georgia,serif;color:#221E18;letter-spacing:-.03em;margin:0 0 4px">${esc(
      weekday
    )}</h1>
    <div style="font:600 11px/1.4 -apple-system,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#7A6F60;border-bottom:2px solid #221E18;padding-bottom:14px;margin-bottom:18px">The Daily Dispatch · Eric Lawler</div>
    ${
      d.glance
        ? `<p style="font:italic 17px/1.5 Georgia,serif;color:#4A4339;margin:0 0 8px">${esc(d.glance)}</p>`
        : ''
    }
    ${section('The Schedule', cal)}
    ${section('The Horizon', hor)}
    ${section('Correspondence', mail)}
    ${section('Work Docket', tasks)}
    ${section('Field Notes', notes)}
    ${section('The Archive', files)}
    ${section('In the Background', music)}
    <a href="${DASHBOARD_URL}" style="display:inline-block;margin-top:28px;font:600 12px/1 -apple-system,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#5E7158;text-decoration:none">Open the full dispatch →</a>
  </div>`;
}

async function sendEmail(env: Env, d: DashboardData, weekday: string): Promise<string> {
  if (!env.RESEND_API_KEY || !env.DIGEST_TO) return 'email skipped (not configured)';
  const from = env.DIGEST_FROM || 'Daily Dispatch <onboarding@resend.dev>';
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [env.DIGEST_TO],
      subject: `The Daily Dispatch — ${weekday}`,
      html: emailHTML(d, weekday),
    }),
  });
  return resp.ok ? 'email sent' : `email failed: ${resp.status}`;
}

// ---- Push (Pushover) ----

function pushText(d: DashboardData): string {
  const counts = [
    `${d.calendar.length} today`,
    `${d.horizon.length} ahead`,
    `${d.emails.length} emails`,
    `${d.tasks.length} tasks`,
  ].join(' · ');
  const first = d.calendar[0] ? `\nFirst: ${d.calendar[0].time} ${d.calendar[0].title}` : '';
  const glance = d.glance ? `${d.glance}\n` : '';
  return `${glance}${counts}${first}`.slice(0, 1000);
}

async function sendPush(env: Env, d: DashboardData, weekday: string): Promise<string> {
  if (!env.PUSHOVER_TOKEN || !env.PUSHOVER_USER) return 'push skipped (not configured)';
  const resp = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: env.PUSHOVER_TOKEN,
      user: env.PUSHOVER_USER,
      title: `The Daily Dispatch — ${weekday}`,
      message: pushText(d),
      url: DASHBOARD_URL,
      url_title: 'Open dispatch',
    }),
  });
  return resp.ok ? 'push sent' : `push failed: ${resp.status}`;
}

// Fire both channels; neither blocks the other.
export async function sendDigest(env: Env, d: DashboardData): Promise<string[]> {
  const weekday = weekdayName(env.TIMEZONE);
  const results = await Promise.allSettled([
    sendEmail(env, d, weekday),
    sendPush(env, d, weekday),
  ]);
  return results.map((r) => (r.status === 'fulfilled' ? r.value : `error: ${r.reason}`));
}
