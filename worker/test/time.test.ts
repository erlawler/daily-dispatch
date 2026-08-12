import { describe, it, expect } from 'vitest';
import {
  currentHour,
  dayBounds,
  dayAndDate,
  isWeekday,
  localDate,
  shortDate,
  formatTime,
  weekdayName,
  weekdayIndex,
} from '../src/time';

const TZ = 'America/Chicago';

describe('currentHour — DST-safe cron gating', () => {
  // The digest cron fires at 12:00 and 13:00 UTC; exactly one must be 7am local.
  it('winter (CST, UTC-6): 13:00 UTC is 7am — digest sends', () => {
    expect(currentHour(TZ, new Date('2026-01-15T13:00:00Z'))).toBe(7);
  });
  it('winter: 12:00 UTC is 6am — cron no-ops', () => {
    expect(currentHour(TZ, new Date('2026-01-15T12:00:00Z'))).toBe(6);
  });
  it('summer (CDT, UTC-5): 12:00 UTC is 7am — digest sends', () => {
    expect(currentHour(TZ, new Date('2026-07-15T12:00:00Z'))).toBe(7);
  });
  it('summer: 13:00 UTC is 8am — cron no-ops', () => {
    expect(currentHour(TZ, new Date('2026-07-15T13:00:00Z'))).toBe(8);
  });
});

describe('weekday helpers — resolved in the local zone, not UTC', () => {
  it('indexes days from Sunday (0) through Saturday (6)', () => {
    expect(weekdayIndex(TZ, new Date('2026-08-09T12:00:00Z'))).toBe(0); // Sunday
    expect(weekdayIndex(TZ, new Date('2026-08-14T12:00:00Z'))).toBe(5); // Friday
    expect(weekdayIndex(TZ, new Date('2026-08-08T12:00:00Z'))).toBe(6); // Saturday
  });

  it('counts Monday through Friday as weekdays', () => {
    expect(isWeekday(TZ, new Date('2026-08-10T12:00:00Z'))).toBe(true); // Monday
    expect(isWeekday(TZ, new Date('2026-08-14T12:00:00Z'))).toBe(true); // Friday
    expect(isWeekday(TZ, new Date('2026-08-08T12:00:00Z'))).toBe(false); // Saturday
    expect(isWeekday(TZ, new Date('2026-08-09T12:00:00Z'))).toBe(false); // Sunday
  });

  it('uses the local day, not the UTC one, near midnight', () => {
    // 11:30pm CDT Friday is already Saturday in UTC. The digest must read Friday.
    const lateFriday = new Date('2026-08-15T04:30:00Z');
    expect(weekdayName(TZ, lateFriday)).toBe('Friday');
    expect(isWeekday(TZ, lateFriday)).toBe(true);
  });
});

describe('localDate', () => {
  it('returns the local calendar day', () => {
    expect(localDate(TZ, new Date('2026-08-12T12:00:00Z'))).toBe('2026-08-12');
  });

  it('does not roll over early just because UTC has', () => {
    // 11:00pm CDT on the 12th is 04:00 UTC on the 13th.
    expect(localDate(TZ, new Date('2026-08-13T04:00:00Z'))).toBe('2026-08-12');
  });
});

describe('dayBounds', () => {
  it('anchors today and the 7-day horizon to the local calendar day', () => {
    const b = dayBounds(TZ, new Date('2026-05-25T21:00:00Z')); // 4:00pm CDT, Mon May 25
    expect(b.todayStart).toBe('2026-05-25T00:00:00-05:00');
    expect(b.todayEnd).toBe('2026-05-26T00:00:00-05:00');
    expect(b.horizonStart).toBe('2026-05-26T00:00:00-05:00');
    expect(b.horizonEnd).toBe('2026-06-02T00:00:00-05:00');
  });
  it('handles late-night UTC rollover (9:30pm CDT is still the same local day)', () => {
    const b = dayBounds(TZ, new Date('2026-05-26T02:30:00Z')); // 9:30pm CDT, Mon May 25
    expect(b.todayStart).toBe('2026-05-25T00:00:00-05:00');
  });
});

describe('dayAndDate', () => {
  const now = new Date('2026-05-25T21:00:00Z'); // Mon May 25, afternoon
  it('labels the next local day "Tomorrow"', () => {
    expect(dayAndDate('2026-05-26T15:00:00Z', TZ, now)).toBe('Tomorrow');
  });
  it('labels later days like "Thu · May 28"', () => {
    expect(dayAndDate('2026-05-28T15:00:00Z', TZ, now)).toBe('Thu · May 28');
  });
});

describe('formatters', () => {
  it('shortDate renders the local month + day', () => {
    expect(shortDate('2026-05-24T18:00:00Z', TZ)).toBe('May 24');
  });
  it('formatTime renders local 12-hour time', () => {
    expect(formatTime('2026-05-25T14:30:00-05:00', TZ)).toBe('2:30 PM');
  });
  it('weekdayName renders the local weekday', () => {
    expect(weekdayName(TZ, new Date('2026-05-25T21:00:00Z'))).toBe('Monday');
  });
});
