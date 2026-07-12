import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { computeNextStreak, streakStatus } from './streak.util';

export interface StreakStatus {
  currentDailyStreak: number;
  longestDailyStreak: number;
  lastPlayedOn: string | null;
  playedToday: boolean;
  atRisk: boolean;
}

@Injectable()
export class StreakService {
  private readonly logger = new Logger(StreakService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  /**
   * Record that `userId` played today and return their up-to-date streak.
   * Idempotent within a day: repeated calls the same day touch nothing.
   * Safe to call from any gameplay path (Speed Math, async duels, …).
   */
  async recordActivity(userId: string, now: Date = new Date()): Promise<StreakStatus> {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      select: { id: true, currentDailyStreak: true, longestDailyStreak: true, lastPlayedOn: true },
    });
    if (!user) {
      // Never let a streak update break gameplay — just report an empty streak.
      this.logger.warn(`recordActivity: user ${userId} not found`);
      return { currentDailyStreak: 0, longestDailyStreak: 0, lastPlayedOn: null, playedToday: false, atRisk: false };
    }

    const next = computeNextStreak(
      {
        currentDailyStreak: user.currentDailyStreak,
        longestDailyStreak: user.longestDailyStreak,
        lastPlayedOn: user.lastPlayedOn,
      },
      now,
    );

    if (next.changed) {
      await this.usersRepo.update(
        { id: userId },
        {
          currentDailyStreak: next.currentDailyStreak,
          longestDailyStreak: next.longestDailyStreak,
          lastPlayedOn: next.lastPlayedOn,
        },
      );
      this.logger.log(`Streak for ${userId}: ${next.currentDailyStreak} day(s)`);
    }

    return streakStatus(
      {
        currentDailyStreak: next.currentDailyStreak,
        longestDailyStreak: next.longestDailyStreak,
        lastPlayedOn: next.lastPlayedOn,
      },
      now,
    );
  }

  /** Read-only streak status (used by the "don't break the chain" UI). */
  async getStatus(userId: string, now: Date = new Date()): Promise<StreakStatus> {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      select: { id: true, currentDailyStreak: true, longestDailyStreak: true, lastPlayedOn: true },
    });
    if (!user) {
      return { currentDailyStreak: 0, longestDailyStreak: 0, lastPlayedOn: null, playedToday: false, atRisk: false };
    }
    return streakStatus(
      {
        currentDailyStreak: user.currentDailyStreak,
        longestDailyStreak: user.longestDailyStreak,
        lastPlayedOn: user.lastPlayedOn,
      },
      now,
    );
  }
}
