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

// Calendar date (YYYY-MM-DD) as seen in `tz`. Also the key the digest uses to
// record "already sent today", so a catch-up run can tell days apart correctly.
export function localDate(tz: string, date = new Date()): string {
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
  const today = localDate(tz, now);
  const tomorrow = localDate(tz, new Date(now.getTime() + 24 * 3600 * 1000));
  const weekOut = localDate(tz, new Date(now.getTime() + 8 * 24 * 3600 * 1000));
  return {
    todayStart: `${today}T00:00:00${off}`,
    todayEnd: `${tomorrow}T00:00:00${off}`,
    horizonStart: `${tomorrow}T00:00:00${off}`,
    horizonEnd: `${weekOut}T00:00:00${off}`,
  };
}

// Current hour (0-23) in `tz`. Used to fire the 7am digest correctly across DST.
export function currentHour(tz: string, now = new Date()): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return parseInt(h, 10);
}

// Long weekday name in `tz`, e.g. "Monday".
export function weekdayName(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(now);
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// Day of week in `tz` as 0 (Sunday) through 6 (Saturday).
export function weekdayIndex(tz: string, now = new Date()): number {
  return WEEKDAY_NAMES.indexOf(weekdayName(tz, now));
}

// Monday through Friday in `tz`. The digest gates on this in code rather than in
// the cron expression: cron day-of-week is evaluated by the platform in UTC and
// proved unreliable in practice (the digest ran Sun-Thu, never on Friday), so the
// rule lives here where it is explicit and unit-testable.
export function isWeekday(tz: string, now = new Date()): boolean {
  const d = weekdayIndex(tz, now);
  return d >= 1 && d <= 5;
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
  const target = localDate(tz, new Date(iso));
  const tomorrow = localDate(tz, new Date(now.getTime() + 24 * 3600 * 1000));
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
