import { computeNextStreak, streakStatus, toDateKey } from './streak.util';

const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe('streak.util', () => {
  describe('computeNextStreak', () => {
    it('first-ever play starts the streak at 1', () => {
      const r = computeNextStreak(
        { currentDailyStreak: 0, longestDailyStreak: 0, lastPlayedOn: null },
        at('2026-07-12'),
      );
      expect(r.changed).toBe(true);
      expect(r.currentDailyStreak).toBe(1);
      expect(r.longestDailyStreak).toBe(1);
      expect(r.lastPlayedOn).toBe('2026-07-12');
    });

    it('a second play the same day is a no-op', () => {
      const r = computeNextStreak(
        { currentDailyStreak: 3, longestDailyStreak: 5, lastPlayedOn: '2026-07-12' },
        at('2026-07-12'),
      );
      expect(r.changed).toBe(false);
      expect(r.alreadyPlayedToday).toBe(true);
      expect(r.currentDailyStreak).toBe(3);
    });

    it('playing on consecutive days extends the streak', () => {
      const r = computeNextStreak(
        { currentDailyStreak: 3, longestDailyStreak: 3, lastPlayedOn: '2026-07-11' },
        at('2026-07-12'),
      );
      expect(r.currentDailyStreak).toBe(4);
      expect(r.longestDailyStreak).toBe(4);
    });

    it('a gap of more than one day resets the streak to 1', () => {
      const r = computeNextStreak(
        { currentDailyStreak: 9, longestDailyStreak: 9, lastPlayedOn: '2026-07-09' },
        at('2026-07-12'),
      );
      expect(r.currentDailyStreak).toBe(1);
      expect(r.longestDailyStreak).toBe(9); // longest is preserved
    });

    it('handles month boundaries', () => {
      const r = computeNextStreak(
        { currentDailyStreak: 2, longestDailyStreak: 2, lastPlayedOn: '2026-06-30' },
        at('2026-07-01'),
      );
      expect(r.currentDailyStreak).toBe(3);
    });
  });

  describe('streakStatus', () => {
    it('flags at-risk when last play was yesterday and not yet today', () => {
      const s = streakStatus(
        { currentDailyStreak: 4, longestDailyStreak: 6, lastPlayedOn: '2026-07-11' },
        at('2026-07-12'),
      );
      expect(s.playedToday).toBe(false);
      expect(s.atRisk).toBe(true);
      expect(s.currentDailyStreak).toBe(4);
    });

    it('shows a broken streak as 0 once more than a day has lapsed', () => {
      const s = streakStatus(
        { currentDailyStreak: 4, longestDailyStreak: 6, lastPlayedOn: '2026-07-09' },
        at('2026-07-12'),
      );
      expect(s.currentDailyStreak).toBe(0);
      expect(s.atRisk).toBe(false);
      expect(s.longestDailyStreak).toBe(6);
    });

    it('reports playedToday true when already active today', () => {
      const s = streakStatus(
        { currentDailyStreak: 4, longestDailyStreak: 6, lastPlayedOn: '2026-07-12' },
        at('2026-07-12'),
      );
      expect(s.playedToday).toBe(true);
      expect(s.atRisk).toBe(false);
    });
  });

  it('toDateKey uses the UTC calendar day', () => {
    expect(toDateKey(new Date('2026-07-12T23:30:00.000Z'))).toBe('2026-07-12');
  });
});
