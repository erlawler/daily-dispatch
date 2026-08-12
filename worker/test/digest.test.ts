import { describe, it, expect } from 'vitest';
import { decideDigest } from '../src/digest';

const TZ = 'America/Chicago';

// Reference points, all verified against the timezone database:
//   2026-08-12 Wednesday, 2026-08-14 Friday, 2026-08-08 Saturday, 2026-08-09 Sunday  (CDT, UTC-5)
//   2026-01-16 Friday                                                                (CST, UTC-6)
const at = (iso: string) => new Date(iso);

describe('decideDigest — which days actually send', () => {
  // Regression guard. With `1-5` in the cron day-of-week field this digest ran
  // Sunday through Thursday for four straight weeks and never once on Friday.
  // The rule lives in code now, so these are assertions rather than assumptions.
  it('sends on Friday in summer (the day the cron field never delivered)', () => {
    const d = decideDigest(TZ, null, at('2026-08-14T12:00:00Z')); // 7am CDT, Friday
    expect(d.send).toBe(true);
    expect(d.date).toBe('2026-08-14');
  });

  it('sends on Friday in winter', () => {
    const d = decideDigest(TZ, null, at('2026-01-16T13:00:00Z')); // 7am CST, Friday
    expect(d.send).toBe(true);
    expect(d.date).toBe('2026-01-16');
  });

  it('never sends on Sunday (the day the cron field kept delivering)', () => {
    const d = decideDigest(TZ, null, at('2026-08-09T12:00:00Z')); // 7am CDT, Sunday
    expect(d.send).toBe(false);
    expect(d.reason).toContain('weekend');
  });

  it('never sends on Saturday', () => {
    const d = decideDigest(TZ, null, at('2026-08-08T12:00:00Z')); // 7am CDT, Saturday
    expect(d.send).toBe(false);
    expect(d.reason).toContain('weekend');
  });
});

describe('decideDigest — the 7am local target, across DST', () => {
  it('summer: 12:00 UTC is 7am CDT, so that run sends', () => {
    expect(decideDigest(TZ, null, at('2026-08-12T12:00:00Z')).send).toBe(true);
    expect(decideDigest(TZ, null, at('2026-08-12T12:00:00Z')).reason).toBe('on time');
  });

  it('summer: 11:00 UTC is 6am CDT, too early to send', () => {
    const d = decideDigest(TZ, null, at('2026-08-12T11:00:00Z'));
    expect(d.send).toBe(false);
    expect(d.reason).toContain('too early');
  });

  it('winter: 13:00 UTC is 7am CST, so that run sends', () => {
    // 2026-01-14 is a Wednesday.
    const d = decideDigest(TZ, null, at('2026-01-14T13:00:00Z'));
    expect(d.send).toBe(true);
    expect(d.reason).toBe('on time');
  });

  it('winter: 12:00 UTC is 6am CST, too early to send', () => {
    const d = decideDigest(TZ, null, at('2026-01-14T12:00:00Z'));
    expect(d.send).toBe(false);
    expect(d.reason).toContain('too early');
  });
});

describe('decideDigest — catch-up when the platform drops the 7am run', () => {
  it('still delivers at 8am local if nothing went out at 7am', () => {
    const d = decideDigest(TZ, null, at('2026-08-12T13:00:00Z')); // 8am CDT
    expect(d.send).toBe(true);
    expect(d.reason).toContain('catch-up');
  });

  it('still delivers at 9am local, the last chance of the morning', () => {
    const d = decideDigest(TZ, null, at('2026-08-12T14:00:00Z')); // 9am CDT
    expect(d.send).toBe(true);
    expect(d.reason).toContain('catch-up');
  });

  it('gives up after 9am rather than sending a stale briefing at lunch', () => {
    const d = decideDigest(TZ, null, at('2026-08-12T15:00:00Z')); // 10am CDT
    expect(d.send).toBe(false);
    expect(d.reason).toContain('past the catch-up window');
  });
});

describe('decideDigest — at most one digest per day', () => {
  it('does not resend when this morning already went out', () => {
    const d = decideDigest(TZ, '2026-08-12', at('2026-08-12T13:00:00Z'));
    expect(d.send).toBe(false);
    expect(d.reason).toBe('already sent today');
  });

  it("yesterday's marker does not suppress today", () => {
    const d = decideDigest(TZ, '2026-08-11', at('2026-08-12T12:00:00Z'));
    expect(d.send).toBe(true);
  });

  it('a marker from a dropped Friday does not suppress the next Monday', () => {
    const d = decideDigest(TZ, '2026-08-14', at('2026-08-17T12:00:00Z')); // Monday
    expect(d.send).toBe(true);
    expect(d.date).toBe('2026-08-17');
  });
});
