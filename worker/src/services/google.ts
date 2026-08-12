// Calendar (today + horizon), Gmail (recent threads), Drive (recent files).
import type { Env } from '../index';
import { getGoogleAccessToken } from '../auth';
import { dayBounds, formatTime, dayAndDate, shortDate, weekdayIndex } from '../time';

export interface CalendarItem {
  time: string;
  title: string;
  sub: string;
}
export interface HorizonItem {
  when: string;
  time: string;
  title: string;
  sub: string;
}
export interface EmailItem {
  from: string;
  subject: string;
  snippet: string;
}
export interface FileItem {
  title: string;
  sub: string;
  url: string;
}
export interface GoogleData {
  ok: boolean;
  calendar: CalendarItem[];
  horizon: HorizonItem[];
  emails: EmailItem[];
  files: FileItem[];
}

interface GEvent {
  summary?: string;
  location?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
}

async function gFetch(url: string, token: string): Promise<any> {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Google ${resp.status} for ${new URL(url).pathname}`);
  return resp.json();
}

function timedEvents(items: GEvent[]): GEvent[] {
  // Drop all-day events (no dateTime) and ones marked free/transparent.
  return items.filter((e) => e.start?.dateTime && e.transparency !== 'transparent');
}

async function fetchCalendar(token: string, tz: string): Promise<{
  calendar: CalendarItem[];
  horizon: HorizonItem[];
}> {
  const b = dayBounds(tz);
  const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  const todayUrl =
    `${base}?singleEvents=true&orderBy=startTime` +
    `&timeMin=${encodeURIComponent(b.todayStart)}&timeMax=${encodeURIComponent(b.todayEnd)}`;
  const horizonUrl =
    `${base}?singleEvents=true&orderBy=startTime&maxResults=10` +
    `&timeMin=${encodeURIComponent(b.horizonStart)}&timeMax=${encodeURIComponent(b.horizonEnd)}`;

  const [todayRes, horizonRes] = await Promise.all([
    gFetch(todayUrl, token),
    gFetch(horizonUrl, token),
  ]);

  const calendar = timedEvents(todayRes.items ?? []).map((e) => ({
    time: formatTime(e.start!.dateTime!, tz),
    title: e.summary ?? '(no title)',
    sub: e.location ?? '',
  }));

  const horizon = timedEvents(horizonRes.items ?? [])
    .slice(0, 5)
    .map((e) => ({
      when: dayAndDate(e.start!.dateTime!, tz),
      time: formatTime(e.start!.dateTime!, tz),
      title: e.summary ?? '(no title)',
      sub: e.location ?? '',
    }));

  return { calendar, horizon };
}

function header(headers: any[], name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function cleanFrom(raw: string): string {
  // "Jane Doe <jane@x.com>" -> "Jane Doe"; bare address -> address.
  const m = raw.match(/^\s*"?([^"<]+?)"?\s*<.*>$/);
  return (m ? m[1] : raw).trim();
}

// How far back Correspondence looks. A 1-day window read on a Monday morning
// starts at Sunday morning, so Friday evening and all of Saturday fall off the
// briefing entirely. Monday reaches back across the weekend instead, with a little
// more headroom for the extra days.
export function inboxWindow(
  tz: string,
  now = new Date()
): { days: number; maxResults: number } {
  return weekdayIndex(tz, now) === 1
    ? { days: 3, maxResults: 12 }
    : { days: 1, maxResults: 8 };
}

async function fetchEmails(token: string, tz: string): Promise<EmailItem[]> {
  const { days, maxResults } = inboxWindow(tz);
  // category:primary keeps marketing/newsletter mail out of Correspondence.
  const q = `in:inbox newer_than:${days}d category:primary`;
  const list = await gFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(q)}&maxResults=${maxResults}`,
    token
  );
  const threads: { id: string }[] = list.threads ?? [];

  const detailed = await Promise.all(
    threads.map((t) =>
      gFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        token
      ).catch(() => null)
    )
  );

  return detailed
    .filter((d): d is any => !!d?.messages?.length)
    .map((d) => {
      const last = d.messages[d.messages.length - 1];
      const headers = last.payload?.headers ?? [];
      return {
        from: cleanFrom(header(headers, 'From')),
        subject: header(headers, 'Subject') || '(no subject)',
        snippet: last.snippet ?? '',
      };
    });
}

async function fetchFiles(token: string, tz: string): Promise<FileItem[]> {
  const url =
    'https://www.googleapis.com/drive/v3/files?orderBy=modifiedByMeTime desc&pageSize=10' +
    '&fields=files(id,name,mimeType,modifiedTime,webViewLink)';
  const res = await gFetch(url, token);
  return (res.files ?? []).map((f: any) => ({
    title: f.name,
    sub: f.modifiedTime ? `Modified ${shortDate(f.modifiedTime, tz)}` : '',
    url: f.webViewLink ?? '',
  }));
}

const EMPTY: GoogleData = { ok: false, calendar: [], horizon: [], emails: [], files: [] };

export async function fetchGoogle(env: Env): Promise<GoogleData> {
  let token: string;
  try {
    token = await getGoogleAccessToken(env);
  } catch {
    return EMPTY; // Auth failure: report unhealthy instead of a fake quiet day.
  }
  const tz = env.TIMEZONE;

  let ok = true;
  const [cal, emails, files] = await Promise.all([
    fetchCalendar(token, tz).catch(() => {
      ok = false;
      return { calendar: [] as CalendarItem[], horizon: [] as HorizonItem[] };
    }),
    fetchEmails(token, tz).catch(() => {
      ok = false;
      return [] as EmailItem[];
    }),
    fetchFiles(token, tz).catch(() => {
      ok = false;
      return [] as FileItem[];
    }),
  ]);

  return { ok, calendar: cal.calendar, horizon: cal.horizon, emails, files };
}
