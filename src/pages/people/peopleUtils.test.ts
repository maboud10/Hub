import { describe, expect, it } from 'vitest';
import {
  dayPhase,
  formatBirthday,
  isBirthdayToday,
  localHour,
  matchesTokens,
  offsetLabel,
  offsetSentence,
  searchTokens,
  tenure,
  tzOffsetMinutes,
} from './peopleUtils';
import type { User } from '@/types';

const JAN = Date.UTC(2026, 0, 15, 12, 0, 0);
const JUL = Date.UTC(2026, 6, 15, 12, 0, 0);

describe('tzOffsetMinutes', () => {
  it('handles fixed and fractional offsets', () => {
    expect(tzOffsetMinutes('Asia/Dubai', JAN)).toBe(240);
    expect(tzOffsetMinutes('Asia/Kolkata', JAN)).toBe(330);
    expect(tzOffsetMinutes('UTC', JAN)).toBe(0);
  });
  it('is DST-aware', () => {
    expect(tzOffsetMinutes('America/New_York', JAN)).toBe(-300);
    expect(tzOffsetMinutes('America/New_York', JUL)).toBe(-240);
    expect(tzOffsetMinutes('Europe/London', JUL)).toBe(60);
  });
  it('ignores sub-second noise', () => {
    expect(tzOffsetMinutes('Asia/Singapore', JAN + 999)).toBe(480);
  });
});

describe('offset labels', () => {
  it('formats signed hour/minute offsets', () => {
    expect(offsetLabel(0)).toBe('same time');
    expect(offsetLabel(-240)).toBe('−4h');
    expect(offsetLabel(90)).toBe('+1h 30m');
    expect(offsetLabel(30)).toBe('+30m');
    expect(offsetSentence(-240)).toBe('4h behind you');
    expect(offsetSentence(90)).toBe('1h 30m ahead of you');
  });
});

describe('local time helpers', () => {
  it('computes local hour and day phase', () => {
    expect(localHour('Asia/Dubai', JAN)).toBe(16);
    expect(dayPhase(10)).toBe('work');
    expect(dayPhase(19)).toBe('off');
    expect(dayPhase(2)).toBe('night');
  });
});

describe('search', () => {
  const user = {
    name: 'Mateo García',
    title: 'Workplace Operations Manager',
    department: 'Operations',
    location: 'Dubai',
    email: 'mateo.garcia@helix.co',
    skills: ['Facilities', 'Vendor Management'],
  } as unknown as User;

  it('is accent-insensitive and requires every token', () => {
    expect(searchTokens('  García   dubai ')).toEqual(['garcia', 'dubai']);
    expect(matchesTokens(user, searchTokens('garcia'))).toBe(true);
    expect(matchesTokens(user, searchTokens('vendor dubai'))).toBe(true);
    expect(matchesTokens(user, searchTokens('vendor london'))).toBe(false);
    expect(matchesTokens(user, [])).toBe(true);
  });
});

describe('dates', () => {
  it('computes tenure', () => {
    const now = new Date(2026, 10, 3).getTime();
    expect(tenure('2020-06-01', now)).toBe('6y 5m');
    expect(tenure('2026-08-18', now)).toBe('2m');
    expect(tenure('2026-11-01', now)).toBe('Joined this month');
    expect(tenure('2027-01-01', now)).toBe('Starts soon');
  });
  it('formats birthdays', () => {
    expect(formatBirthday('04-17')).toMatch(/17/);
    expect(isBirthdayToday('11-03', new Date(2026, 10, 3, 9).getTime())).toBe(true);
    expect(isBirthdayToday(undefined, Date.now())).toBe(false);
  });
});
