import { BadRequestException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ProgressionConfigVersion } from '../entities/progression-config-version.entity';
import {
  ProgressionConfigValues,
  DEFAULT_PROGRESSION_CONFIG,
} from '../types/progression-config.types';
import { PaginatedQueryDto } from '../../common/dto/paginated-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ProgressionConfigVersionResponseDto } from '../dto/progression-config-version-response.dto';

interface CachedConfig {
  values: ProgressionConfigValues;
  versionId: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;

// Tier floors — must stay in sync with rank-tiers.ts
const TIER_FLOORS: Record<string, number> = {
  Spectator: 0,
  Challenger: 500,
  Gladiator: 1500,
  Champion: 4000,
  Legend: 10000,
};
const TIER_ORDER = ['Spectator', 'Challenger', 'Gladiator', 'Champion', 'Legend'] as const;

@Injectable()
export class ProgressionConfigService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProgressionConfigService.name);
  private cache: CachedConfig | null = null;

  constructor(
    @InjectRepository(ProgressionConfigVersion)
    private readonly repo: Repository<ProgressionConfigVersion>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const count = await this.repo.count();
    if (count > 0) return;

    const version = this.repo.create({
      values: DEFAULT_PROGRESSION_CONFIG,
      effectiveFrom: new Date(),
      changedBy: 'system',
      notes: 'Initial defaults',
    });
    await this.repo.save(version);
    this.logger.log(`Progression config bootstrapped with initial defaults (id=${version.id})`);
  }

  /**
   * Returns config values effective at `at` (defaults to now). Caches current-time lookups.
   */
  async getEffective(
    at?: Date,
  ): Promise<{ values: ProgressionConfigValues; versionId: string }> {
    const now = Date.now();

    if (!at && this.cache && this.cache.expiresAt > now) {
      return { values: this.cache.values, versionId: this.cache.versionId };
    }

    const version = await this.findVersionAt(at ?? new Date());
    if (!version) {
      this.logger.warn('No progression config in DB — using hardcoded defaults');
      return { values: DEFAULT_PROGRESSION_CONFIG, versionId: 'default' };
    }

    const result = { values: version.values, versionId: version.id };
    if (!at) {
      this.cache = { ...result, expiresAt: now + CACHE_TTL_MS };
    }
    return result;
  }

  /** Returns the full entity effective at `at` (for admin read endpoints). */
  async getEffectiveVersion(at?: Date): Promise<ProgressionConfigVersion | null> {
    return this.findVersionAt(at ?? new Date());
  }

  /** Validates `values`, then writes a new effective-dated config version. Cache is invalidated. */
  async createVersion(
    values: ProgressionConfigValues,
    changedBy: string,
    notes?: string,
    effectiveFrom: Date = new Date(),
  ): Promise<ProgressionConfigVersion> {
    const errors = this.validateConfig(values);
    if (errors.length) {
      throw new BadRequestException({ message: 'Invalid progression config', errors });
    }

    const version = this.repo.create({ values, effectiveFrom, changedBy, notes: notes ?? null });
    const saved = await this.repo.save(version);
    this.cache = null;
    this.logger.log(`Progression config version created: ${saved.id} by ${changedBy}`);
    return saved;
  }

  /** Paginated audit history of config versions, newest first. */
  async listVersionsPaginated(
    query: PaginatedQueryDto,
  ): Promise<PaginatedResponseDto<ProgressionConfigVersionResponseDto>> {
    const [versions, total] = await this.repo.findAndCount({
      order: { effectiveFrom: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return new PaginatedResponseDto(
      versions.map((v) => ProgressionConfigVersionResponseDto.fromEntity(v)),
      total,
      query.page,
      query.limit,
    );
  }

  /** Non-paginated list (kept for internal use). */
  async listVersions(): Promise<ProgressionConfigVersion[]> {
    return this.repo.find({ order: { effectiveFrom: 'DESC' } });
  }

  /**
   * Domain-level validation of a full config. Returns an array of human-readable
   * error messages; empty array means valid. Class-validator handles scalar type/range
   * checks; this covers cross-field invariants.
   */
  validateConfig(values: ProgressionConfigValues): string[] {
    const errors: string[] = [];

    // ── Season reset map ─────────────────────────────────────────────────────
    const resetMap = values.seasonResetPoints as Record<string, number>;
    const missingTiers = TIER_ORDER.filter((t) => typeof resetMap[t] !== 'number');
    if (missingTiers.length) {
      errors.push(`seasonResetPoints is missing entries for: ${missingTiers.join(', ')}`);
    } else {
      // Each reset value must be ≤ that tier's floor (can't reset into the same tier)
      // and ≥ the tier below's floor (can't drop more than one tier)
      for (let i = 1; i < TIER_ORDER.length; i++) {
        const tier = TIER_ORDER[i];
        const tierFloor = TIER_FLOORS[tier];
        const tierBelowFloor = TIER_FLOORS[TIER_ORDER[i - 1]];
        const resetValue = resetMap[tier];

        if (resetValue > tierFloor) {
          errors.push(
            `seasonResetPoints.${tier}: reset value ${resetValue} exceeds ${tier} floor ${tierFloor} — would reset up (not a demotion)`,
          );
        }
        if (resetValue < tierBelowFloor) {
          errors.push(
            `seasonResetPoints.${tier}: reset value ${resetValue} is below ${TIER_ORDER[i - 1]} floor ${tierBelowFloor} — would drop more than one tier`,
          );
        }
      }

      // Reset values must be monotonically non-decreasing (higher tier → higher reset)
      for (let i = 1; i < TIER_ORDER.length; i++) {
        const a = TIER_ORDER[i - 1];
        const b = TIER_ORDER[i];
        if (resetMap[b] < resetMap[a]) {
          errors.push(
            `seasonResetPoints: ${b} reset (${resetMap[b]}) must be ≥ ${a} reset (${resetMap[a]}) — lower tiers cannot reset higher than higher tiers`,
          );
        }
      }
    }

    // ── Demotion shield ──────────────────────────────────────────────────────
    const smallestTierGap = Math.min(
      ...TIER_ORDER.slice(1).map((t, i) => TIER_FLOORS[t] - TIER_FLOORS[TIER_ORDER[i]]),
    ); // 500 (Challenger − Spectator)
    if (values.demotionShieldBuffer >= smallestTierGap) {
      errors.push(
        `demotionShieldBuffer (${values.demotionShieldBuffer}) must be < the smallest tier gap (${smallestTierGap}). ` +
          `A buffer ≥ the tier gap would let a player skip an entire tier's grace period.`,
      );
    }

    // ── Tournament decay ─────────────────────────────────────────────────────
    if (values.tournamentRankTopAward <= values.tournamentRankParticipationFloor) {
      errors.push(
        `tournamentRankTopAward (${values.tournamentRankTopAward}) must be > tournamentRankParticipationFloor (${values.tournamentRankParticipationFloor})`,
      );
    }

    // ── Streak bonus cap ≥ per-win bonus (otherwise cap is unreachable) ──────
    if (values.duelRankStreakBonusPerWin > values.duelRankStreakBonusCap) {
      errors.push(
        `duelRankStreakBonusPerWin (${values.duelRankStreakBonusPerWin}) should not exceed duelRankStreakBonusCap (${values.duelRankStreakBonusCap}) — the cap would never be applied`,
      );
    }

    // ── Level milestones sorted and unique ───────────────────────────────────
    const sorted = [...values.levelMilestones].sort((a, b) => a - b);
    const unique = [...new Set(sorted)];
    if (unique.length !== values.levelMilestones.length) {
      errors.push('levelMilestones must not contain duplicate values');
    }

    return errors;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async findVersionAt(at: Date): Promise<ProgressionConfigVersion | null> {
    return this.repo.findOne({
      where: { effectiveFrom: LessThanOrEqual(at) },
      order: { effectiveFrom: 'DESC' },
    });
  }
}
