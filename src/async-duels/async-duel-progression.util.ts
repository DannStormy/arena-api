import { ProgressionSnapshot } from '../duels/duel-progression';
import { PlayerAwardPayload } from '../progression/services/progression-award.service';

/**
 * Project a PlayerAwardPayload (from the shared award service) into the
 * ProgressionSnapshot shape stored on the match — identical mapping to the one
 * DuelProgressionService uses for live duels.
 */
export function buildSnapshotFromPayload(p: PlayerAwardPayload): ProgressionSnapshot {
  return {
    xpBefore: p.xpBefore,
    xpAfter: p.xpAfter,
    xpAwarded: p.xpAwarded,
    levelBefore: p.levelBefore,
    levelAfter: p.levelAfter,
    intoLevelBefore: p.intoLevelBefore,
    intoLevelAfter: p.intoLevelAfter,
    nextLevelAt: p.nextLevelAt,
    spBefore: p.spBefore,
    spAfter: p.spAfter,
    spAwarded: p.spAwarded,
    rankBefore: p.rankBefore,
    rankAfter: p.rankAfter,
    rankFloor: p.rankFloor,
    nextRankAt: p.nextRankAt,
    firstGameOfDayBonus: p.firstGameOfDayBonus,
  };
}
