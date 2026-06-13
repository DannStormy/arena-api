export type RankTier = 'Spectator' | 'Challenger' | 'Gladiator' | 'Champion' | 'Legend';

const RANK_TIERS = [
  { name: 'Spectator',  floor: 0     },
  { name: 'Challenger', floor: 500   },
  { name: 'Gladiator',  floor: 1500  },
  { name: 'Champion',   floor: 4000  },
  { name: 'Legend',     floor: 10000 },
] as const;

// Numeric index for high-water comparisons — higher is better.
const TIER_RANK: Record<RankTier, number> = {
  Spectator:  0,
  Challenger: 1,
  Gladiator:  2,
  Champion:   3,
  Legend:     4,
};

export function rankFromSeasonPoints(sp: number): {
  rank: RankTier;
  rankFloor: number;
  nextRankAt: number | null;
} {
  let idx = 0;
  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (sp >= RANK_TIERS[i].floor) idx = i;
  }
  const tier = RANK_TIERS[idx];
  const next = RANK_TIERS[idx + 1] ?? null;
  return {
    rank: tier.name,
    rankFloor: tier.floor,
    nextRankAt: next ? next.floor : null,
  };
}

/** Returns true if `candidate` is a strictly higher tier than `current`. */
export function isHigherRank(candidate: RankTier, current: RankTier | null): boolean {
  if (!current) return true;
  return TIER_RANK[candidate] > TIER_RANK[current];
}
