import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChallengeService } from '../challenges/challenge.service';
import { ChallengeMode } from '../challenges/types/challenge-mode.enum';
import { ProgressionAwardService } from '../progression/services/progression-award.service';
import { ProgressionConfigService } from '../progression/services/progression-config.service';
import { StreakService } from '../streak/streak.service';
import { AsyncDuel } from './entities/async-duel.entity';
import { AsyncDuelAnswer } from './entities/async-duel-answer.entity';
import { AsyncDuelMatchType } from './types/async-duel-match-type.enum';
import { AsyncDuelStatus } from './types/async-duel-status.enum';
import { CreateAsyncDuelDto } from './dto/create-async-duel.dto';
import { MatchmakeAsyncDuelDto } from './dto/matchmake-async-duel.dto';
import { SubmitAsyncDuelDto } from './dto/submit-async-duel.dto';
import { AsyncDuelSetResponseDto } from './dto/async-duel-set-response.dto';
import { AsyncDuelResultDto } from './dto/async-duel-result.dto';
import {
  MIN_PLAUSIBLE_ELAPSED_MS,
  resolveAsyncDuel,
  sumRun,
} from './async-duel-resolver';
import { buildSnapshotFromPayload } from './async-duel-progression.util';

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

@Injectable()
export class AsyncDuelsService {
  private readonly logger = new Logger(AsyncDuelsService.name);

  constructor(
    @InjectRepository(AsyncDuel)
    private readonly duelsRepo: Repository<AsyncDuel>,
    @InjectRepository(AsyncDuelAnswer)
    private readonly answersRepo: Repository<AsyncDuelAnswer>,
    private readonly challengeService: ChallengeService,
    private readonly progressionAwardService: ProgressionAwardService,
    private readonly progressionConfigService: ProgressionConfigService,
    private readonly streakService: StreakService,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = Array.from(
        { length: 6 },
        () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
      ).join('');
      const existing = await this.duelsRepo.findOne({ where: { code } });
      if (!existing) return code;
    }
    throw new InternalServerErrorException('Failed to generate unique async duel code');
  }

  private toClientSet(duel: AsyncDuel): AsyncDuelSetResponseDto['challenges'] {
    return this.challengeService.generateSet({
      matchSeed: duel.matchSeed,
      mode: duel.mode,
      count: duel.challengeCount,
      difficulty: duel.difficulty,
    });
  }

  /** Whether `userId` is a live player who plays this match (not the ghost). */
  private isLivePlayer(duel: AsyncDuel, userId: string): boolean {
    if (duel.creatorId === userId) return true;
    if (duel.matchType === AsyncDuelMatchType.CHALLENGE_LINK) {
      return duel.opponentId === userId || duel.opponentId === null;
    }
    return false; // ghost matches: only the creator is live
  }

  // ── Create (challenge-a-friend link) ─────────────────────────────────────────

  async create(userId: string, dto: CreateAsyncDuelDto): Promise<AsyncDuelSetResponseDto> {
    const matchSeed = randomUUID();
    const code = await this.generateUniqueCode();

    const duel = this.duelsRepo.create({
      code,
      matchSeed,
      mode: dto.mode,
      difficulty: dto.difficulty,
      challengeCount: dto.count,
      matchType: AsyncDuelMatchType.CHALLENGE_LINK,
      status: AsyncDuelStatus.AWAITING_OPPONENT,
      creatorId: userId,
    });

    const saved = await this.duelsRepo.save(duel);
    this.logger.log(`Async duel created: ${saved.id} code=${saved.code} by ${userId}`);

    return {
      id: saved.id,
      code: saved.code,
      matchSeed: saved.matchSeed,
      mode: saved.mode,
      difficulty: saved.difficulty,
      matchType: saved.matchType,
      challenges: this.toClientSet(saved),
      opponent: { score: null },
    };
  }

  // ── Get playable set by code ─────────────────────────────────────────────────

  async getByCode(code: string, userId: string): Promise<AsyncDuelSetResponseDto> {
    const duel = await this.duelsRepo.findOne({ where: { code } });
    if (!duel) throw new NotFoundException('Async duel not found');

    if (duel.matchType === AsyncDuelMatchType.GHOST && duel.creatorId !== userId) {
      throw new BadRequestException('Ghost matches are private to their creator');
    }

    const requesterCompleted = await this.hasCompleted(duel, userId);

    // Only reveal the opponent's score once the requester has finished their run.
    let opponent: { score: number | null } | null = null;
    if (duel.opponentId != null || duel.matchType === AsyncDuelMatchType.GHOST) {
      opponent = { score: requesterCompleted ? this.opponentScoreFor(duel, userId) : null };
    }

    return {
      id: duel.id,
      code: duel.code,
      matchSeed: duel.matchSeed,
      mode: duel.mode,
      difficulty: duel.difficulty,
      matchType: duel.matchType,
      challenges: this.toClientSet(duel),
      opponent,
      alreadyCompleted: requesterCompleted,
    };
  }

  private opponentScoreFor(duel: AsyncDuel, userId: string): number {
    return duel.creatorId === userId ? duel.opponentScore : duel.creatorScore;
  }

  private async hasCompleted(duel: AsyncDuel, userId: string): Promise<boolean> {
    if (duel.creatorId === userId) return duel.creatorCompletedAt != null;
    if (duel.opponentId === userId) return duel.opponentCompletedAt != null;
    return false;
  }

  // ── Submit a run ─────────────────────────────────────────────────────────────

  async submit(
    code: string,
    userId: string,
    dto: SubmitAsyncDuelDto,
  ): Promise<AsyncDuelResultDto> {
    const duel = await this.duelsRepo.findOne({ where: { code } });
    if (!duel) throw new NotFoundException('Async duel not found');

    if (duel.status === AsyncDuelStatus.CANCELLED) {
      throw new BadRequestException('Async duel is cancelled');
    }

    // Determine which side the submitter is. First non-creator submitter on a
    // challenge-link match claims the opponent slot.
    const isCreator = duel.creatorId === userId;
    if (!isCreator) {
      if (duel.matchType === AsyncDuelMatchType.GHOST) {
        throw new BadRequestException('Cannot submit to a ghost match you did not create');
      }
      if (duel.opponentId != null && duel.opponentId !== userId) {
        throw new ConflictException('This match already has an opponent');
      }
    }

    // One completed run per user per match — reject double-submits.
    const already = await this.answersRepo.count({
      where: { asyncDuelId: duel.id, userId },
    });
    if (already > 0) {
      throw new ConflictException('You have already submitted a run for this match');
    }

    // Server-authoritative validation of EVERY answer.
    const expectedCount = duel.challengeCount;
    const answerRows: AsyncDuelAnswer[] = [];
    for (const a of dto.answers) {
      if (a.index < 0 || a.index >= expectedCount) {
        throw new BadRequestException(`index ${a.index} out of range`);
      }

      // Too-fast guard: implausibly quick answers score 0 and are marked wrong.
      const tooFast = a.elapsedMs < MIN_PLAUSIBLE_ELAPSED_MS;

      const validation = tooFast
        ? { index: a.index, correct: false, score: 0 }
        : this.challengeService.validateSubmission({
            matchSeed: duel.matchSeed,
            mode: duel.mode,
            difficulty: duel.difficulty,
            index: a.index,
            submitted: a.answer,
            elapsedMs: a.elapsedMs,
          });

      answerRows.push(
        this.answersRepo.create({
          asyncDuelId: duel.id,
          userId,
          index: a.index,
          submitted: a.answer,
          isCorrect: validation.correct,
          score: validation.score,
          elapsedMs: a.elapsedMs,
        }),
      );
    }

    await this.answersRepo.save(answerRows);

    const totals = sumRun(
      answerRows.map((r) => ({
        index: r.index,
        isCorrect: r.isCorrect,
        score: r.score,
        elapsedMs: r.elapsedMs,
      })),
    );

    const completedAt = new Date();

    if (isCreator) {
      duel.creatorScore = totals.score;
      duel.creatorCorrect = totals.correct;
      duel.creatorElapsedMs = totals.elapsedMs;
      duel.creatorCompletedAt = completedAt;
      // A completed creator run becomes an eligible ghost for others.
      if (duel.matchType === AsyncDuelMatchType.CHALLENGE_LINK) {
        duel.ghostEligible = true;
      }
    } else {
      duel.opponentId = userId;
      duel.opponentScore = totals.score;
      duel.opponentCorrect = totals.correct;
      duel.opponentElapsedMs = totals.elapsedMs;
      duel.opponentCompletedAt = completedAt;
    }

    await this.duelsRepo.save(duel);

    // Submitting a run counts toward the daily streak. Fire-and-forget so a
    // streak hiccup never blocks match resolution; the UI reads GET /streak.
    void this.streakService
      .recordActivity(userId)
      .catch((err) => this.logger.warn(`streak recordActivity failed: ${err}`));

    // Resolve + award when BOTH sides are done. For ghost matches the opponent
    // (ghost) side is prefilled, so the creator's submission completes it.
    if (this.bothSidesComplete(duel)) {
      await this.resolveAndAward(duel);
    }

    return AsyncDuelResultDto.fromEntity(duel);
  }

  private bothSidesComplete(duel: AsyncDuel): boolean {
    if (duel.matchType === AsyncDuelMatchType.GHOST) {
      return duel.creatorCompletedAt != null; // opponent (ghost) is prefilled
    }
    return duel.creatorCompletedAt != null && duel.opponentCompletedAt != null;
  }

  // ── Matchmake against a ghost ────────────────────────────────────────────────

  async matchmake(userId: string, dto: MatchmakeAsyncDuelDto): Promise<AsyncDuelSetResponseDto> {
    const ghost = await this.findGhost(userId, dto.mode, dto.difficulty);
    if (!ghost) {
      throw new NotFoundException('No suitable ghost available for this mode/difficulty');
    }

    const code = await this.generateUniqueCode();
    const duel = this.duelsRepo.create({
      code,
      matchSeed: ghost.matchSeed,
      mode: ghost.mode,
      difficulty: ghost.difficulty,
      challengeCount: ghost.challengeCount,
      matchType: AsyncDuelMatchType.GHOST,
      status: AsyncDuelStatus.AWAITING_OPPONENT,
      creatorId: userId,
      // The ghost run's original player and their recorded score are prefilled.
      opponentId: ghost.creatorId,
      opponentScore: ghost.creatorScore,
      opponentCorrect: ghost.creatorCorrect,
      opponentElapsedMs: ghost.creatorElapsedMs,
      opponentCompletedAt: ghost.creatorCompletedAt,
    });

    const saved = await this.duelsRepo.save(duel);
    this.logger.log(
      `Ghost match created: ${saved.id} code=${saved.code} live=${userId} ghost=${ghost.creatorId}`,
    );

    return {
      id: saved.id,
      code: saved.code,
      matchSeed: saved.matchSeed,
      mode: saved.mode,
      difficulty: saved.difficulty,
      matchType: saved.matchType,
      challenges: this.toClientSet(saved),
      opponent: { score: null }, // hidden until the live player finishes
    };
  }

  /**
   * Find a completed, ghost-eligible run near the requested mode/difficulty that
   * does NOT belong to the requester (a player can never race their own ghost).
   */
  private async findGhost(
    userId: string,
    mode: ChallengeMode,
    difficulty: number,
  ): Promise<AsyncDuel | null> {
    return this.duelsRepo
      .createQueryBuilder('d')
      .where('d.ghostEligible = true')
      .andWhere('d.status = :completed', { completed: AsyncDuelStatus.COMPLETED })
      .andWhere('d.matchType = :link', { link: AsyncDuelMatchType.CHALLENGE_LINK })
      .andWhere('d.mode = :mode', { mode })
      .andWhere('ABS(d.difficulty - :difficulty) <= 1', { difficulty })
      .andWhere('d.creatorId != :userId', { userId })
      .andWhere('d.creatorCompletedAt IS NOT NULL')
      .orderBy('ABS(d.difficulty - :difficulty)', 'ASC')
      .addOrderBy('RANDOM()')
      .limit(1)
      .getOne();
  }

  // ── Resolution + progression ─────────────────────────────────────────────────

  private async resolveAndAward(duel: AsyncDuel): Promise<void> {
    if (duel.opponentId == null) return;

    const resolved = resolveAsyncDuel({
      creatorId: duel.creatorId,
      opponentId: duel.opponentId,
      creatorScore: duel.creatorScore,
      opponentScore: duel.opponentScore,
      creatorElapsedMs: duel.creatorElapsedMs,
      opponentElapsedMs: duel.opponentElapsedMs,
    });

    const completedAt = new Date();
    duel.status = AsyncDuelStatus.COMPLETED;
    duel.winnerId = resolved.winnerId;
    duel.resolution = resolved.resolution;
    duel.tiebreakDeltaMs = resolved.tiebreakDeltaMs;
    duel.isTie = resolved.isTie;
    duel.completedAt = completedAt;
    await this.duelsRepo.save(duel);

    await this.awardProgression(duel, completedAt);
  }

  /**
   * Feed the resolved outcome into the SHARED award path. For a challenge-link
   * match both players are awarded; for a ghost match only the live creator is
   * (the ghost's original run is never re-awarded). Idempotent via
   * `progressionAwarded` + the ledger's ON CONFLICT.
   */
  private async awardProgression(duel: AsyncDuel, completedAt: Date): Promise<void> {
    if (duel.progressionAwarded || !duel.resolution || duel.opponentId == null) return;

    const sides =
      duel.matchType === AsyncDuelMatchType.GHOST
        ? [{ userId: duel.creatorId }]
        : [{ userId: duel.creatorId }, { userId: duel.opponentId }];

    const payloads = await this.progressionAwardService.awardAsyncDuelResult({
      asyncDuelId: duel.id,
      resolution: duel.resolution,
      winnerId: duel.winnerId,
      completedAt,
      sides,
    });

    const { values: cfg } = await this.progressionConfigService.getEffective();

    const creatorPayload = payloads[duel.creatorId];
    if (creatorPayload) {
      duel.creatorXpAwarded = creatorPayload.xpAwarded;
      duel.creatorSpAwarded = creatorPayload.spAwarded;
      duel.creatorProgression = buildSnapshotFromPayload(creatorPayload);
    }
    const opponentPayload = payloads[duel.opponentId];
    if (opponentPayload) {
      duel.opponentXpAwarded = opponentPayload.xpAwarded;
      duel.opponentSpAwarded = opponentPayload.spAwarded;
      duel.opponentProgression = buildSnapshotFromPayload(opponentPayload);
    }

    duel.progressionAwarded = true;
    await this.duelsRepo.save(duel);

    void cfg; // config already applied inside the award service; kept for parity
    this.logger.log(
      `Async duel progression awarded: ${duel.id} ` +
        `creator +${duel.creatorXpAwarded ?? 0}XP +${duel.creatorSpAwarded ?? 0}SP` +
        (opponentPayload
          ? `, opponent +${duel.opponentXpAwarded ?? 0}XP +${duel.opponentSpAwarded ?? 0}SP`
          : ' (ghost opponent not re-awarded)'),
    );
  }

  // ── Result ───────────────────────────────────────────────────────────────────

  async getResult(id: string, userId: string): Promise<AsyncDuelResultDto> {
    const duel = await this.duelsRepo.findOne({ where: { id } });
    if (!duel) throw new NotFoundException('Async duel not found');

    const isParticipant =
      duel.creatorId === userId ||
      (duel.opponentId === userId && duel.matchType === AsyncDuelMatchType.CHALLENGE_LINK);
    if (!isParticipant) {
      throw new BadRequestException('You are not a participant in this match');
    }

    return AsyncDuelResultDto.fromEntity(duel);
  }
}
