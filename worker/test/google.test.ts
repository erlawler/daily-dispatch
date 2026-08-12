import { describe, it, expect } from 'vitest';
import { inboxWindow } from '../src/services/google';

const TZ = 'America/Chicago';

// 2026-08-10 Monday, 2026-08-11 Tuesday, 2026-08-14 Friday, 2026-08-09 Sunday.
describe('inboxWindow — Correspondence reaches back over the weekend', () => {
  it('looks back three days on Monday, so Saturday mail still appears', () => {
    expect(inboxWindow(TZ, new Date('2026-08-10T12:00:00Z'))).toEqual({
      days: 3,
      maxResults: 12,
    });
  });

  it('looks back one day on an ordinary weekday', () => {
    expect(inboxWindow(TZ, new Date('2026-08-11T12:00:00Z'))).toEqual({
      days: 1,
      maxResults: 8,
    });
    expect(inboxWindow(TZ, new Date('2026-08-14T12:00:00Z'))).toEqual({
      days: 1,
      maxResults: 8,
    });
  });

  it('reads the local day, so a late Sunday view is not treated as Monday', () => {
    // 11:00pm CDT Sunday is already Monday in UTC.
    expect(inboxWindow(TZ, new Date('2026-08-10T04:00:00Z'))).toEqual({
      days: 1,
      maxResults: 8,
    });
  });
});
