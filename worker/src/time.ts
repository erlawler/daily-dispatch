// Timezone-aware helpers. Cloudflare Workers ship the full ICU/Intl data.

function offsetFor(tz: string, date: Date): string {
  // e.g. "GMT-05:00" -> "-05:00"
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const m = name.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : '+00:00';
}

function ymdFor(tz: string, date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export interface DayBounds {
  todayStart: string;
  todayEnd: string;
  horizonStart: string;
  horizonEnd: string;
}

// RFC3339 boundaries for "today" and the next 7 days, anchored in `tz`.
export function dayBounds(tz: string, now = new Date()): DayBounds {
  const off = offsetFor(tz, now);
  const today = ymdFor(tz, now);
  const tomorrow = ymdFor(tz, new Date(now.getTime() + 24 * 3600 * 1000));
  const weekOut = ymdFor(tz, new Date(now.getTime() + 8 * 24 * 3600 * 1000));
  return {
    todayStart: `${today}T00:00:00${off}`,
    todayEnd: `${tomorrow}T00:00:00${off}`,
    horizonStart: `${tomorrow}T00:00:00${off}`,
    horizonEnd: `${weekOut}T00:00:00${off}`,
  };
}

export function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

// "Tomorrow" or short day + date like "Tue · May 26", anchored in `tz`.
export function dayAndDate(iso: string, tz: string, now = new Date()): string {
  const target = ymdFor(tz, new Date(iso));
  const tomorrow = ymdFor(tz, new Date(now.getTime() + 24 * 3600 * 1000));
  if (target === tomorrow) return 'Tomorrow';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} · ${get('month')} ${get('day')}`;
}

// Short date like "May 24", anchored in `tz`. Used for "Edited"/"Modified" subs.
export function shortDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}
