import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, QueryFailedError, Repository } from 'typeorm';
import { ChallengeService } from '../challenges/challenge.service';
import { Challenge } from '../challenges/types/challenge.interface';
import { ProgressionAwardService } from '../progression/services/progression-award.service';
import { User } from '../users/entities/user.entity';
import { CompleteDailyDto } from './dto/complete-daily.dto';
import { DailyResult } from './entities/daily-result.entity';
import { DAILY_COUNT, DAILY_DIFFICULTY, DAILY_XP_BONUS } from './daily.constants';
import { computeDailyStreak, dailyModeFor, dailySeed, utcDateString } from './daily.util';
import type { SoloXpSnapshot } from '../progression/services/progression-award.service';

export interface DailyResultView {
  score: number;
  correctCount: number;
  rank: number;
  totalPlayers: number;
  streak: number;
}

export interface DailyStateView {
  date: string;
  mode: string;
  difficulty: number;
  matchSeed: string;
  challenges: Challenge[];
  alreadyPlayed: boolean;
  result: DailyResultView | null;
}

export interface DailyCompleteView extends DailyResultView {
  alreadyPlayed: boolean;
  // Present on a first completion (for the XP-bar reveal); null on a replay.
  progression: SoloXpSnapshot | null;
}

export interface DailyLeaderboardView {
  date: string;
  entries: { rank: number; username: string; score: number }[];
  me: { rank: number; score: number } | null;
}

/**
 * Wordle-style Daily Challenge: one shared, seeded Speed Math set per UTC day,
 * one recorded run per user (one-shot), with a leaderboard and a
 * play-every-day streak. Reuses the deterministic ChallengeService engine — no
 * new generator — so scoring stays server-authoritative.
 */
@Injectable()
export class DailyService {
  private readonly logger = new Logger(DailyService.name);

  constructor(
    @InjectRepository(DailyResult)
    private readonly resultsRepo: Repository<DailyResult>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly challengeService: ChallengeService,
    private readonly progressionAward: ProgressionAwardService,
  ) {}

  /** Today's playable set plus (if the user already played) their result. */
  async getDaily(userId: string, now: Date = new Date()): Promise<DailyStateView> {
    const date = utcDateString(now);
    const matchSeed = dailySeed(date);
    const mode = dailyModeFor(date);

    const challenges = this.challengeService.generateSet({
      matchSeed,
      mode,
      count: DAILY_COUNT,
      difficulty: DAILY_DIFFICULTY,
    });

    const existing = await this.resultsRepo.findOne({ where: { userId, date } });

    return {
      date,
      mode,
      difficulty: DAILY_DIFFICULTY,
      matchSeed,
      challenges,
      alreadyPlayed: existing != null,
      result: existing ? await this.buildResultView(userId, date, existing) : null,
    };
  }

  /**
   * Record the user's single run for today. If they already have a result, the
   * existing one is returned unchanged (one-shot — never overwritten). Otherwise
   * every answer is validated server-side, the authoritative totals are stored,
   * a modest daily XP bonus is awarded (idempotent), and the fresh result is
   * returned.
   */
  async completeDaily(
    userId: string,
    dto: CompleteDailyDto,
    now: Date = new Date(),
  ): Promise<DailyCompleteView> {
    const date = utcDateString(now);
    const matchSeed = dailySeed(date);
    const mode = dailyModeFor(date);

    const existing = await this.resultsRepo.findOne({ where: { userId, date } });
    if (existing) {
      return { ...(await this.buildResultView(userId, date, existing)), alreadyPlayed: true, progression: null };
    }

    // Server-authoritative scoring: re-derive and validate EVERY answer. The
    // client-sent total is never trusted.
    let score = 0;
    let correctCount = 0;
    for (const a of dto.answers) {
      if (a.index < 0 || a.index >= DAILY_COUNT) {
        throw new BadRequestException(`index ${a.index} out of range`);
      }
      const validation = this.challengeService.validateSubmission({
        matchSeed,
        mode,
        difficulty: DAILY_DIFFICULTY,
        index: a.index,
        submitted: a.answer,
        elapsedMs: a.elapsedMs,
      });
      score += validation.score;
      if (validation.correct) correctCount++;
    }

    let saved: DailyResult;
    try {
      saved = await this.resultsRepo.save(
        this.resultsRepo.create({ userId, date, score, correctCount }),
      );
    } catch (err) {
      // A concurrent complete raced us to the unique (userId, date) row. Honour
      // the one-shot rule: return whatever landed first, don't overwrite.
      if (err instanceof QueryFailedError) {
        const raced = await this.resultsRepo.findOne({ where: { userId, date } });
        if (raced) {
          return { ...(await this.buildResultView(userId, date, raced)), alreadyPlayed: true, progression: null };
        }
      }
      throw err;
    }

    // Modest, idempotent daily XP (level ledger only), awaited so the response
    // can carry a before→after snapshot for the results XP bar. A progression
    // hiccup must never block recording the result → fall back to null.
    const progression = await this.progressionAward
      .awardSoloXpWithSnapshot(userId, `daily:${date}`, DAILY_XP_BONUS)
      .catch((e) => {
        this.logger.warn(`daily XP award failed: ${e}`);
        return null;
      });

    this.logger.log(`Daily result recorded: ${userId} ${date} score=${score} correct=${correctCount}`);

    return { ...(await this.buildResultView(userId, date, saved)), alreadyPlayed: false, progression };
  }

  /** Top-20 leaderboard for a day (default today) plus the caller's own line. */
  async getLeaderboard(
    userId: string,
    dateParam?: string,
    now: Date = new Date(),
  ): Promise<DailyLeaderboardView> {
    const date = this.normalizeDate(dateParam, now);

    const top = await this.resultsRepo.find({
      where: { date },
      order: { score: 'DESC', createdAt: 'ASC' },
      take: 20,
    });

    const usernames = await this.resolveUsernames(top.map((r) => r.userId));

    // All strictly-greater scores for any top-20 entry are themselves in the
    // top 20, so rank = (# entries with a greater score) + 1 is exact here.
    const entries = top.map((r) => ({
      rank: top.filter((o) => o.score > r.score).length + 1,
      username: usernames[r.userId] ?? 'unknown',
      score: r.score,
    }));

    const mine = await this.resultsRepo.findOne({ where: { userId, date } });
    const me = mine
      ? { rank: (await this.countAbove(date, mine.score)) + 1, score: mine.score }
      : null;

    return { date, entries, me };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** rank + totalPlayers + streak for a stored result. */
  private async buildResultView(
    userId: string,
    date: string,
    entity: DailyResult,
  ): Promise<DailyResultView> {
    const [above, totalPlayers, playedRows] = await Promise.all([
      this.countAbove(date, entity.score),
      this.resultsRepo.count({ where: { date } }),
      this.resultsRepo.find({ where: { userId }, select: { date: true } }),
    ]);

    return {
      score: entity.score,
      correctCount: entity.correctCount,
      rank: above + 1,
      totalPlayers,
      streak: computeDailyStreak(playedRows.map((r) => r.date), date),
    };
  }

  private countAbove(date: string, score: number): Promise<number> {
    return this.resultsRepo.count({ where: { date, score: MoreThan(score) } });
  }

  private async resolveUsernames(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const users = await this.usersRepo.find({
      where: { id: In(ids) },
      select: { id: true, username: true },
    });
    return Object.fromEntries(users.map((u) => [u.id, u.username]));
  }

  private normalizeDate(dateParam: string | undefined, now: Date): string {
    if (dateParam == null) return utcDateString(now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    return dateParam;
  }
}
