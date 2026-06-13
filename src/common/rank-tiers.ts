export type RankTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Legend';

interface TierDef {
  name: RankTier;
  floor: number;      // season points required to reach this tier (inclusive)
  ceiling: number;    // exclusive upper bound (Infinity for top tier)
}

const TIERS: TierDef[] = [
  { name: 'Bronze',   floor: 0,    ceiling: 200  },
  { name: 'Silver',   floor: 200,  ceiling: 500  },
  { name: 'Gold',     floor: 500,  ceiling: 1000 },
  { name: 'Platinum', floor: 1000, ceiling: 2000 },
  { name: 'Diamond',  floor: 2000, ceiling: 5000 },
  { name: 'Legend',   floor: 5000, ceiling: Infinity },
];

// Numeric index for high-water comparisons — higher is better.
const TIER_RANK: Record<RankTier, number> = {
  Bronze:   0,
  Silver:   1,
  Gold:     2,
  Platinum: 3,
  Diamond:  4,
  Legend:   5,
};

export function rankFromSeasonPoints(sp: number): {
  rank: RankTier;
  rankFloor: number;
  nextRankAt: number | null;
} {
  const def = [...TIERS].reverse().find((t) => sp >= t.floor) ?? TIERS[0];
  return {
    rank: def.name,
    rankFloor: def.floor,
    nextRankAt: def.ceiling === Infinity ? null : def.ceiling,
  };
}

/** Returns true if `candidate` is a strictly higher tier than `current`. */
export function isHigherRank(candidate: RankTier, current: RankTier | null): boolean {
  if (!current) return true;
  return TIER_RANK[candidate] > TIER_RANK[current];
}
