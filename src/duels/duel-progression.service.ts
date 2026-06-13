import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Duel } from './entities/duel.entity';
import { DuelResolution } from './duel-resolver';
import { awardFor, levelFromXp, currentSeasonId, FIRST_DUEL_DAY_XP } from './duel-progression';

@Injectable()
export class DuelProgressionService {
  private readonly logger = new Logger(DuelProgressionService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Duel)
    private readonly duelsRepo: Repository<Duel>,
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

    const [challenger, opponent] = await Promise.all([
      this.usersRepo.findOne({ where: { id: duel.challengerId } }),
      this.usersRepo.findOne({ where: { id: duel.opponentId } }),
    ]);

    if (!challenger || !opponent) return;

    const staked = parseFloat(duel.stake) > 0;
    const seasonId = currentSeasonId();

    const [cContext, oContext] = await Promise.all([
      this.buildContext(challenger, duel),
      this.buildContext(opponent, duel),
    ]);

    const cAward = awardFor({
      isWinner: duel.winnerId === challenger.id,
      resolution: duel.resolution as DuelResolution,
      forfeited: duel.resolution === 'forfeit' && duel.winnerId !== challenger.id,
      staked,
      consecutiveWinsAfterThis: cContext.streakAfter,
      freeWinsToday: cContext.freeWinsToday,
    });

    const oAward = awardFor({
      isWinner: duel.winnerId === opponent.id,
      resolution: duel.resolution as DuelResolution,
      forfeited: duel.resolution === 'forfeit' && duel.winnerId !== opponent.id,
      staked,
      consecutiveWinsAfterThis: oContext.streakAfter,
      freeWinsToday: oContext.freeWinsToday,
    });

    // First-duel-of-day bonus: +50 XP each, once per user per UTC day
    const [cFirst, oFirst] = await Promise.all([
      this.isFirstDuelToday(challenger.id, duel.id),
      this.isFirstDuelToday(opponent.id, duel.id),
    ]);

    if (cFirst) cAward.xp += FIRST_DUEL_DAY_XP;
    if (oFirst) oAward.xp += FIRST_DUEL_DAY_XP;

    await Promise.all([
      this.applyAward(challenger, cAward, seasonId, cContext.updatedStreak),
      this.applyAward(opponent, oAward, seasonId, oContext.updatedStreak),
    ]);

    // Persist award amounts and mark idempotency guard
    await this.duelsRepo.update(duel.id, {
      progressionAwarded: true,
      challengerXpAwarded: cAward.xp,
      challengerSpAwarded: cAward.seasonPoints,
      opponentXpAwarded: oAward.xp,
      opponentSpAwarded: oAward.seasonPoints,
    });

    // Keep in-memory copy in sync so callers see updated values
    duel.progressionAwarded = true;
    duel.challengerXpAwarded = cAward.xp;
    duel.challengerSpAwarded = cAward.seasonPoints;
    duel.opponentXpAwarded = oAward.xp;
    duel.opponentSpAwarded = oAward.seasonPoints;

    this.logger.log(
      `Progression awarded: duel=${duel.id} ` +
        `challenger +${cAward.xp}XP +${cAward.seasonPoints}SP, ` +
        `opponent +${oAward.xp}XP +${oAward.seasonPoints}SP`,
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async buildContext(
    user: User,
    duel: Duel,
  ): Promise<{ streakAfter: number; freeWinsToday: number; updatedStreak: number }> {
    const userId = user.id;
    const isWinner = duel.winnerId === userId;
    const resolution = duel.resolution!;

    // Streak after this duel
    let streakAfter: number;
    let updatedStreak: number;
    if (!isWinner || resolution === 'draw') {
      streakAfter = 0;
      updatedStreak = 0;
    } else if (resolution === 'forfeit') {
      // Forfeit win keeps streak alive; no increment for bonus calculation
      streakAfter = user.duelWinStreak;
      updatedStreak = user.duelWinStreak;
    } else {
      streakAfter = user.duelWinStreak + 1;
      updatedStreak = user.duelWinStreak + 1;
    }

    // Free wins today (excluding this duel)
    const todayStart = startOfUtcDay();
    const freeWinsToday = await this.duelsRepo
      .createQueryBuilder('d')
      .where('(d.challengerId = :uid OR d.opponentId = :uid)', { uid: userId })
      .andWhere('d.winnerId = :uid', { uid: userId })
      .andWhere("d.stake = '0.00'")
      .andWhere('d.progressionAwarded = true')
      .andWhere('d.completedAt >= :start', { start: todayStart })
      .andWhere('d.id != :did', { did: duel.id })
      .getCount();

    return { streakAfter, freeWinsToday, updatedStreak };
  }

  private async applyAward(
    user: User,
    award: { seasonPoints: number; xp: number },
    seasonId: string,
    updatedStreak: number,
  ): Promise<void> {
    // Inline season reset: if user's points belong to a previous month, start fresh
    const currentSp =
      user.seasonId === seasonId ? user.seasonPoints : 0;

    await this.usersRepo.update(user.id, {
      lifetimeXp: Number(user.lifetimeXp) + award.xp,
      seasonPoints: currentSp + award.seasonPoints,
      seasonId,
      duelWinStreak: updatedStreak,
    });
  }

  private async isFirstDuelToday(userId: string, duelId: string): Promise<boolean> {
    const todayStart = startOfUtcDay();
    const priorCount = await this.duelsRepo
      .createQueryBuilder('d')
      .where('(d.challengerId = :uid OR d.opponentId = :uid)', { uid: userId })
      .andWhere("d.status IN ('completed', 'cancelled')")
      .andWhere('d.completedAt >= :start', { start: todayStart })
      .andWhere('d.id != :did', { did: duelId })
      .getCount();

    return priorCount === 0;
  }
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
