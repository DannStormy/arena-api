import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ProgressionProjection } from '../entities/progression-projection.entity';
import { ProgressionEvent } from '../entities/progression-event.entity';
import { Ledger } from '../types/ledger.enum';
import { ProgressionConfigValues } from '../types/progression-config.types';
import { rankFromSeasonPoints, isHigherRank, RankTier } from '../../common/rank-tiers';

// ── Level math ───────────────────────────────────────────────────────────────

function buildCumulative(base: number, growth: number, maxLevel: number): number[] {
  const arr = [0];
  let total = 0;
  for (let l = 1; l < maxLevel; l++) {
    total += Math.round(base * Math.pow(growth, l - 1));
    arr.push(total);
  }
  return arr;
}

export function levelFromXp(
  totalXp: number,
  cumulative: number[],
): { level: number; intoLevel: number; nextLevelAt: number | null } {
  const maxLevel = cumulative.length;
  let level = 1;
  for (let l = 0; l < cumulative.length; l++) {
    if (totalXp >= cumulative[l]) level = l + 1;
    else break;
  }
  level = Math.min(level, maxLevel);
  const floor = cumulative[level - 1];
  const nextLevelAt = level >= maxLevel ? null : cumulative[level];
  return { level, intoLevel: totalXp - floor, nextLevelAt };
}

// ── Shield logic ─────────────────────────────────────────────────────────────

function applyShield(
  total: number,
  existingPeakTier: string | null,
  shieldBuffer: number,
): { effectiveTier: string; shieldActive: boolean; newPeakTier: string } {
  const raw = rankFromSeasonPoints(total);
  const rawTier = raw.rank;

  // Promote season peak if current raw tier is higher
  const peakTier =
    existingPeakTier && isHigherRank(existingPeakTier as RankTier, rawTier)
      ? existingPeakTier
      : rawTier;

  const peakFloor = rankFromSeasonPoints(
    // get the floor of peakTier by passing the floor value for that tier
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    TIER_ENTRY_POINTS[peakTier] ?? 0,
  ).rankFloor;

  if (total >= peakFloor) {
    return { effectiveTier: rawTier, shieldActive: false, newPeakTier: peakTier };
  }

  if (total >= peakFloor - shieldBuffer) {
    return { effectiveTier: peakTier, shieldActive: true, newPeakTier: peakTier };
  }

  // Shield exhausted — re-anchor peak to current raw tier
  return { effectiveTier: rawTier, shieldActive: false, newPeakTier: rawTier };
}

// Tier name → canonical entry points (must match rank-tiers.ts)
const TIER_ENTRY_POINTS: Record<string, number> = {
  Spectator: 0,
  Challenger: 500,
  Gladiator: 1500,
  Champion: 4000,
  Legend: 10000,
};

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ProgressionProjectionService {
  constructor(
    @InjectRepository(ProgressionProjection)
    private readonly projectionRepo: Repository<ProgressionProjection>,
    @InjectRepository(ProgressionEvent)
    private readonly eventsRepo: Repository<ProgressionEvent>,
  ) {}

  async getOrInit(
    userId: string,
    ledger: Ledger,
    seasonId: string | null,
  ): Promise<ProgressionProjection> {
    const existing = await this.projectionRepo.findOne({
      where: { userId, ledger, seasonId: seasonId === null ? IsNull() : seasonId },
    });
    if (existing) return existing;

    const blank = this.projectionRepo.create({
      userId,
      ledger,
      seasonId,
      total: 0,
      levelNumber: ledger === Ledger.LEVEL ? 1 : null,
      tier: ledger !== Ledger.LEVEL ? 'Spectator' : null,
      seasonPeakTier: ledger !== Ledger.LEVEL ? 'Spectator' : null,
      allTimePeakTier: ledger !== Ledger.LEVEL ? 'Spectator' : null,
      demotionShieldActive: false,
    });
    return blank;
  }

  /**
   * Re-derive the projection for (userId, ledger, seasonId) from the event log,
   * then persist. Called after every award and by the re-projection endpoint.
   */
  async updateForUser(
    userId: string,
    ledger: Ledger,
    seasonId: string | null,
    cfg: ProgressionConfigValues,
  ): Promise<ProgressionProjection> {
    const row = await this.eventsRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.points), 0)', 'sum')
      .where('e.userId = :userId AND e.ledger = :ledger', { userId, ledger })
      .andWhere(seasonId ? 'e.seasonId = :seasonId' : 'e.seasonId IS NULL', { seasonId })
      .getRawOne<{ sum: string }>();

    const raw = Math.max(0, Number(row?.sum ?? 0));

    const projection = await this.getOrInit(userId, ledger, seasonId);
    projection.total = raw;

    if (ledger === Ledger.LEVEL) {
      const cumulative = buildCumulative(cfg.levelBase, cfg.levelGrowth, cfg.maxLevel);
      const { level } = levelFromXp(raw, cumulative);
      projection.levelNumber = level;
      projection.tier = null;
      projection.demotionShieldActive = false;
    } else {
      const { effectiveTier, shieldActive, newPeakTier } = applyShield(
        raw,
        projection.seasonPeakTier,
        cfg.demotionShieldBuffer,
      );
      projection.tier = effectiveTier;
      projection.demotionShieldActive = shieldActive;
      projection.seasonPeakTier = newPeakTier;

      if (
        !projection.allTimePeakTier ||
        isHigherRank(effectiveTier as RankTier, projection.allTimePeakTier as RankTier)
      ) {
        projection.allTimePeakTier = effectiveTier;
      }
    }

    return this.projectionRepo.save(projection);
  }

  /** Wipe and rebuild all projections for a user from their event log. */
  async rebuildForUser(userId: string, cfg: ProgressionConfigValues): Promise<void> {
    await this.projectionRepo.delete({ userId });

    // Collect distinct (ledger, seasonId) pairs from events
    const pairs = await this.eventsRepo
      .createQueryBuilder('e')
      .select('e.ledger', 'ledger')
      .addSelect('e.seasonId', 'seasonId')
      .where('e.userId = :userId', { userId })
      .groupBy('e.ledger')
      .addGroupBy('e.seasonId')
      .getRawMany<{ ledger: Ledger; seasonId: string | null }>();

    await Promise.all(pairs.map((p) => this.updateForUser(userId, p.ledger, p.seasonId, cfg)));
  }

  buildLevelDto(
    projection: ProgressionProjection,
    cfg: ProgressionConfigValues,
  ): {
    number: number;
    xp: number;
    xpToNext: number | null;
    milestonesUnlocked: number[];
    intoLevel: number;
    nextLevelAt: number | null;
  } {
    const cumulative = buildCumulative(cfg.levelBase, cfg.levelGrowth, cfg.maxLevel);
    const { level, intoLevel, nextLevelAt } = levelFromXp(projection.total, cumulative);
    const milestonesUnlocked = cfg.levelMilestones.filter((m) => level >= m);
    return {
      number: level,
      xp: projection.total,
      xpToNext: nextLevelAt !== null ? nextLevelAt - projection.total : null,
      milestonesUnlocked,
      intoLevel,
      nextLevelAt,
    };
  }

  buildRankDto(
    projection: ProgressionProjection,
    seasonId: string,
  ): { tier: string; points: number; pointsToNext: number | null; demotionShielded: boolean; seasonId: string } {
    const { nextRankAt } = rankFromSeasonPoints(projection.total);
    return {
      tier: projection.tier ?? 'Spectator',
      points: projection.total,
      pointsToNext: nextRankAt !== null ? nextRankAt - projection.total : null,
      demotionShielded: projection.demotionShieldActive,
      seasonId,
    };
  }
}
