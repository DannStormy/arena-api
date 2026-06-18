import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Duel } from './entities/duel.entity';
import { levelFromXp } from '../progression/services/progression-projection.service';
import { rankFromSeasonPoints } from '../common/rank-tiers';
import { ProgressionAwardService } from '../progression/services/progression-award.service';
import { ProgressionConfigService } from '../progression/services/progression-config.service';
import { ProgressionSnapshot } from './duel-progression';

@Injectable()
export class DuelProgressionService {
  private readonly logger = new Logger(DuelProgressionService.name);

  constructor(
    @InjectRepository(Duel)
    private readonly duelsRepo: Repository<Duel>,
    private readonly progressionAwardService: ProgressionAwardService,
    private readonly progressionConfigService: ProgressionConfigService,
  ) {}

  /**
   * Award XP and season points to both players for a completed duel.
   * Idempotent: no-ops if `progressionAwarded` is already true.
   * Holds on flagged duels: no-ops if `isFlagged` is true.
   */
  async award(duel: Duel): Promise<void> {
    if (duel.progressionAwarded || duel.isFlagged || !duel.resolution || !duel.opponentId) {
      return;
    }

    const payload = await this.progressionAwardService.awardDuelResult(duel);
    if (!payload) return;

    const { values: cfg } = await this.progressionConfigService.getEffective();
    const cumulative: number[] = [];
    {
      let total = 0;
      cumulative.push(0);
      for (let l = 1; l < cfg.maxLevel; l++) {
        total += Math.round(cfg.levelBase * Math.pow(cfg.levelGrowth, l - 1));
        cumulative.push(total);
      }
    }

    const cSnapshot = this.buildSnapshot(payload.challenger, cumulative);
    const oSnapshot = this.buildSnapshot(payload.opponent, cumulative);

    await this.duelsRepo.update(duel.id, {
      progressionAwarded: true,
      challengerXpAwarded: payload.challenger.xpAwarded,
      challengerSpAwarded: payload.challenger.spAwarded,
      opponentXpAwarded: payload.opponent.xpAwarded,
      opponentSpAwarded: payload.opponent.spAwarded,
      challengerProgression: cSnapshot,
      opponentProgression: oSnapshot,
    });

    duel.progressionAwarded = true;
    duel.challengerXpAwarded = payload.challenger.xpAwarded;
    duel.challengerSpAwarded = payload.challenger.spAwarded;
    duel.opponentXpAwarded = payload.opponent.xpAwarded;
    duel.opponentSpAwarded = payload.opponent.spAwarded;
    duel.challengerProgression = cSnapshot;
    duel.opponentProgression = oSnapshot;

    this.logger.log(
      `Progression awarded: duel=${duel.id} ` +
        `challenger +${payload.challenger.xpAwarded}XP +${payload.challenger.spAwarded}SP, ` +
        `opponent +${payload.opponent.xpAwarded}XP +${payload.opponent.spAwarded}SP`,
    );
  }

  private buildSnapshot(
    p: {
      xpBefore: number; xpAfter: number; xpAwarded: number;
      levelBefore: number; levelAfter: number;
      intoLevelBefore: number; intoLevelAfter: number; nextLevelAt: number | null;
      spBefore: number; spAfter: number; spAwarded: number;
      rankBefore: string; rankAfter: string; rankFloor: number; nextRankAt: number | null;
      firstGameOfDayBonus: number;
    },
    _cumulative: number[],
  ): ProgressionSnapshot {
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
}
