import {
  awardFor,
  levelFromXp,
  levelCost,
  CUMULATIVE,
  MAX_LEVEL,
  LEVEL_BASE,
  FIRST_DUEL_DAY_XP,
} from './duel-progression';

// ─── Rate table ───────────────────────────────────────────────────────────────

describe('awardFor — rate table', () => {
  const base = {
    resolution: 'score' as const,
    forfeited: false,
    consecutiveWinsAfterThis: 1,
    freeWinsToday: 0,
  };

  it('free win → 40 SP, 60 XP', () => {
    expect(awardFor({ ...base, isWinner: true, staked: false })).toEqual({ seasonPoints: 40, xp: 60 });
  });

  it('staked win → 60 SP, 60 XP', () => {
    expect(awardFor({ ...base, isWinner: true, staked: true })).toEqual({ seasonPoints: 60, xp: 60 });
  });

  it('free loss → 5 SP, 25 XP', () => {
    expect(awardFor({ ...base, isWinner: false, staked: false })).toEqual({ seasonPoints: 5, xp: 25 });
  });

  it('staked loss → 8 SP, 25 XP', () => {
    expect(awardFor({ ...base, isWinner: false, staked: true })).toEqual({ seasonPoints: 8, xp: 25 });
  });

  it('free draw → 10 SP, 40 XP', () => {
    expect(awardFor({ ...base, isWinner: false, resolution: 'draw', staked: false })).toEqual({ seasonPoints: 10, xp: 40 });
  });

  it('staked draw → 15 SP, 40 XP', () => {
    expect(awardFor({ ...base, isWinner: false, resolution: 'draw', staked: true })).toEqual({ seasonPoints: 15, xp: 40 });
  });

  it('free forfeit win → 20 SP, 30 XP', () => {
    expect(awardFor({ ...base, isWinner: true, resolution: 'forfeit', staked: false })).toEqual({ seasonPoints: 20, xp: 30 });
  });

  it('staked forfeit win → 30 SP, 30 XP', () => {
    expect(awardFor({ ...base, isWinner: true, resolution: 'forfeit', staked: true })).toEqual({ seasonPoints: 30, xp: 30 });
  });

  it('free forfeit loss → 0 SP, 5 XP', () => {
    expect(awardFor({ ...base, isWinner: false, resolution: 'forfeit', forfeited: true, staked: false })).toEqual({ seasonPoints: 0, xp: 5 });
  });

  it('staked forfeit loss → 0 SP, 5 XP', () => {
    expect(awardFor({ ...base, isWinner: false, resolution: 'forfeit', forfeited: true, staked: true })).toEqual({ seasonPoints: 0, xp: 5 });
  });
});

// ─── Win-streak bonus ────────────────────────────────────────────────────────

describe('awardFor — win-streak bonus (SP only)', () => {
  const win = { resolution: 'score' as const, isWinner: true, staked: false, forfeited: false, freeWinsToday: 0 };

  it('streak=1 (first win) → no bonus', () => {
    const { seasonPoints } = awardFor({ ...win, consecutiveWinsAfterThis: 1 });
    expect(seasonPoints).toBe(40); // base only
  });

  it('streak=2 → no bonus', () => {
    const { seasonPoints } = awardFor({ ...win, consecutiveWinsAfterThis: 2 });
    expect(seasonPoints).toBe(40);
  });

  it('streak=3 → +5 bonus', () => {
    const { seasonPoints } = awardFor({ ...win, consecutiveWinsAfterThis: 3 });
    expect(seasonPoints).toBe(45); // 40 + (3-2)*5
  });

  it('streak=7 → +25 bonus (cap)', () => {
    const { seasonPoints } = awardFor({ ...win, consecutiveWinsAfterThis: 7 });
    expect(seasonPoints).toBe(65); // 40 + min((7-2)*5, 25) = 40 + 25
  });

  it('streak=100 → still capped at +25', () => {
    const { seasonPoints } = awardFor({ ...win, consecutiveWinsAfterThis: 100 });
    expect(seasonPoints).toBe(65);
  });

  it('forfeit win with streak=5 → no streak bonus', () => {
    const { seasonPoints } = awardFor({ ...win, resolution: 'forfeit', consecutiveWinsAfterThis: 5 });
    expect(seasonPoints).toBe(20); // forfeit win base, no bonus
  });
});

// ─── Free-duel soft cap ──────────────────────────────────────────────────────

describe('awardFor — free-duel soft cap', () => {
  const win = { resolution: 'score' as const, isWinner: true, staked: false, forfeited: false, consecutiveWinsAfterThis: 1 };

  it('14 free wins today → full SP', () => {
    const { seasonPoints } = awardFor({ ...win, freeWinsToday: 14 });
    expect(seasonPoints).toBe(40);
  });

  it('15 free wins today → halved SP', () => {
    const { seasonPoints } = awardFor({ ...win, freeWinsToday: 15 });
    expect(seasonPoints).toBe(20); // round(40/2)
  });

  it('staked win is never capped regardless of free win count', () => {
    const { seasonPoints } = awardFor({ ...win, staked: true, freeWinsToday: 100 });
    expect(seasonPoints).toBe(60);
  });

  it('soft cap applies on top of streak bonus — both halved', () => {
    // streak=3 → 40+5=45 → round(45/2)=23
    const { seasonPoints } = awardFor({ ...win, consecutiveWinsAfterThis: 3, freeWinsToday: 15 });
    expect(seasonPoints).toBe(23);
  });
});

// ─── Level curve ─────────────────────────────────────────────────────────────

describe('levelFromXp', () => {
  it('0 XP → level 1, intoLevel 0', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, intoLevel: 0, nextLevelAt: LEVEL_BASE });
  });

  it('exactly LEVEL_BASE XP → level 2, intoLevel 0', () => {
    const { level, intoLevel } = levelFromXp(LEVEL_BASE);
    expect(level).toBe(2);
    expect(intoLevel).toBe(0);
  });

  it('level 100 — XP overflow clamps at max level, nextLevelAt null', () => {
    const totalMax = CUMULATIVE[MAX_LEVEL - 1];
    const overflow = levelFromXp(totalMax + 99_999);
    expect(overflow.level).toBe(MAX_LEVEL);
    expect(overflow.nextLevelAt).toBeNull();
    expect(overflow.intoLevel).toBe(99_999);
  });

  it('CUMULATIVE thresholds are strictly increasing', () => {
    for (let i = 1; i < CUMULATIVE.length; i++) {
      expect(CUMULATIVE[i]).toBeGreaterThan(CUMULATIVE[i - 1]);
    }
  });

  it('level 1 cost is exactly LEVEL_BASE', () => {
    expect(levelCost(1)).toBe(LEVEL_BASE);
  });
});

// ─── First-duel-of-day XP constant ───────────────────────────────────────────

describe('FIRST_DUEL_DAY_XP', () => {
  it('is 50', () => expect(FIRST_DUEL_DAY_XP).toBe(50));
});
