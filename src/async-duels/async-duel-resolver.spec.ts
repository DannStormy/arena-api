import {
  MIN_PLAUSIBLE_ELAPSED_MS,
  resolveAsyncDuel,
  sumRun,
} from './async-duel-resolver';

describe('async-duel-resolver', () => {
  describe('sumRun', () => {
    it('sums score, correct-count, and total elapsed time', () => {
      const totals = sumRun([
        { index: 0, isCorrect: true, score: 10, elapsedMs: 400 },
        { index: 1, isCorrect: false, score: 0, elapsedMs: 500 },
        { index: 2, isCorrect: true, score: 7, elapsedMs: 300 },
      ]);
      expect(totals).toEqual({ score: 17, correct: 2, elapsedMs: 1200 });
    });

    it('returns zeros for an empty run', () => {
      expect(sumRun([])).toEqual({ score: 0, correct: 0, elapsedMs: 0 });
    });
  });

  describe('resolveAsyncDuel', () => {
    const base = {
      creatorId: 'creator',
      opponentId: 'opponent',
      creatorElapsedMs: 1000,
      opponentElapsedMs: 1000,
    };

    it('higher score wins (creator)', () => {
      const r = resolveAsyncDuel({ ...base, creatorScore: 20, opponentScore: 10 });
      expect(r.winnerId).toBe('creator');
      expect(r.resolution).toBe('score');
      expect(r.isTie).toBe(false);
    });

    it('higher score wins (opponent)', () => {
      const r = resolveAsyncDuel({ ...base, creatorScore: 5, opponentScore: 30 });
      expect(r.winnerId).toBe('opponent');
      expect(r.resolution).toBe('score');
    });

    it('tied score → faster total time wins (speed tiebreak)', () => {
      const r = resolveAsyncDuel({
        ...base,
        creatorScore: 15,
        opponentScore: 15,
        creatorElapsedMs: 800,
        opponentElapsedMs: 1200,
      });
      expect(r.winnerId).toBe('creator');
      expect(r.resolution).toBe('speed_tiebreak');
      expect(r.tiebreakDeltaMs).toBe(400);
    });

    it('identical score and identical time → draw', () => {
      const r = resolveAsyncDuel({
        ...base,
        creatorScore: 15,
        opponentScore: 15,
        creatorElapsedMs: 900,
        opponentElapsedMs: 900,
      });
      expect(r.winnerId).toBeNull();
      expect(r.resolution).toBe('draw');
      expect(r.isTie).toBe(true);
    });
  });

  it('exposes a sane too-fast floor', () => {
    expect(MIN_PLAUSIBLE_ELAPSED_MS).toBe(250);
  });
});
