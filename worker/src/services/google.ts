// Calendar (today + horizon), Gmail (recent threads), Drive (recent files).
import type { Env } from '../index';
import { getGoogleAccessToken } from '../auth';
import { dayBounds, formatTime, dayAndDate, shortDate } from '../time';

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

async function fetchEmails(token: string): Promise<EmailItem[]> {
  const q = 'in:inbox newer_than:1d -category:promotions -category:social -category:updates';
  const list = await gFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(q)}&maxResults=8`,
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

const EMPTY: GoogleData = { calendar: [], horizon: [], emails: [], files: [] };

export async function fetchGoogle(env: Env): Promise<GoogleData> {
  let token: string;
  try {
    token = await getGoogleAccessToken(env);
  } catch {
    return EMPTY; // Auth failure shouldn't blank the whole dashboard.
  }
  const tz = env.TIMEZONE;

  const [cal, emails, files] = await Promise.all([
    fetchCalendar(token, tz).catch(() => ({ calendar: [], horizon: [] })),
    fetchEmails(token).catch(() => [] as EmailItem[]),
    fetchFiles(token, tz).catch(() => [] as FileItem[]),
  ]);

  return { calendar: cal.calendar, horizon: cal.horizon, emails, files };
}
