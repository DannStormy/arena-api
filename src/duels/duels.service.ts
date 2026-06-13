import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Duel } from './entities/duel.entity';
import { DuelAnswer } from './entities/duel-answer.entity';
import { DuelMode } from './types/duel-mode.enum';
import { DuelStatus } from './types/duel-status.enum';
import { CreateDuelDto } from './dto/create-duel.dto';
import { MatchmakeDuelDto } from './dto/matchmake-duel.dto';
import { DuelResponseDto } from './dto/duel-response.dto';
import { DuelPublicPreviewDto } from './dto/duel-public-preview.dto';
import { DuelListItemDto } from './dto/duel-list-item.dto';
import { QuestionsService } from '../questions/questions.service';
import { QuestionResponseDto } from '../questions/dto/question-response.dto';
import { WalletService } from '../wallet/wallet.service';
import { TransactionType } from '../wallet/types/transaction-type.enum';
import { DuelConfigService } from './duel-config.service';
import { resolveDuel } from './duel-resolver';
import { DuelProgressionService } from './duel-progression.service';
import { TournamentEntry } from '../tournaments/entities/tournament-entry.entity';
import { TournamentArena } from '../tournaments/types/tournament-arena.enum';
import { QuestionCategory } from '../questions/types/question-category.enum';
import { User } from '../users/entities/user.entity';
import { PaginatedQueryDto } from '../common/dto/paginated-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const BLITZ_QUESTION_COUNT = 5;

export interface QuestionSummaryItem {
  questionIndex: number;
  challengerResult: 'correct' | 'wrong' | 'timeout' | 'pending';
  opponentResult: 'correct' | 'wrong' | 'timeout' | 'pending';
}

export interface ProcessAnswerResult {
  isCorrect: boolean;
  scoreAdded: number;
  updatedDuel: Duel;
  bothAnswered: boolean;
  nextQuestionReady: boolean;
  duelComplete: boolean;
  stealOpportunity: boolean;
  stealResult: { success: boolean } | null;
  suddenDeathStarted: boolean;
}

type SkillBracket = 'beginner' | 'intermediate' | 'advanced';

@Injectable()
export class DuelsService {
  private readonly logger = new Logger(DuelsService.name);

  constructor(
    @InjectRepository(Duel)
    private readonly duelsRepo: Repository<Duel>,
    @InjectRepository(DuelAnswer)
    private readonly answersRepo: Repository<DuelAnswer>,
    @InjectRepository(TournamentEntry)
    private readonly entriesRepo: Repository<TournamentEntry>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly questionsService: QuestionsService,
    private readonly walletService: WalletService,
    private readonly duelConfigService: DuelConfigService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly progressionService: DuelProgressionService,
  ) {}

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = Array.from(
        { length: 6 },
        () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
      ).join('');

      const existing = await this.duelsRepo.findOne({ where: { code } });

      if (!existing) return code;
    }

    throw new InternalServerErrorException('Failed to generate unique duel code');
  }

  private arenaToCategory(arena: TournamentArena): QuestionCategory {
    return arena as unknown as QuestionCategory;
  }

  private async getUserSkillBracket(userId: string): Promise<SkillBracket> {
    const row = await this.entriesRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.score), 0)::int', 'totalScore')
      .where('e.userId = :userId', { userId })
      .getRawOne<{ totalScore: string }>();

    const score = Number(row?.totalScore ?? 0);

    if (score <= 50) return 'beginner';
    if (score <= 200) return 'intermediate';
    return 'advanced';
  }

  private bracketScoreBounds(bracket: SkillBracket): { min: number; max: number } {
    if (bracket === 'beginner') return { min: 0, max: 50 };
    if (bracket === 'intermediate') return { min: 51, max: 200 };
    return { min: 201, max: 9_999_999 };
  }

  private async buildUsernameMap(duels: Duel[]): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        duels.flatMap((d) => [d.challengerId, d.opponentId].filter(Boolean) as string[]),
      ),
    ];

    if (ids.length === 0) return new Map();

    const users = await this.usersRepo.createQueryBuilder('u').whereInIds(ids).getMany();

    return new Map(users.map((u) => [u.id, u.username]));
  }

  // ─── Public service methods ──────────────────────────────────────────────────

  async getDuelById(duelId: string): Promise<Duel | null> {
    return this.duelsRepo.findOne({ where: { id: duelId } });
  }

  async getDuelPublicPreview(code: string): Promise<DuelPublicPreviewDto | null> {
    const duel = await this.duelsRepo.findOne({ where: { code } });

    if (!duel) return null;

    const challenger = await this.usersRepo.findOne({ where: { id: duel.challengerId } });

    return DuelPublicPreviewDto.fromEntity(duel, challenger?.username ?? '');
  }

  async getDuelResponse(duelId: string): Promise<DuelResponseDto | null> {
    const duel = await this.duelsRepo.findOne({ where: { id: duelId } });

    if (!duel) return null;

    const ids = [duel.challengerId, duel.opponentId].filter(Boolean) as string[];
    const users =
      ids.length > 0
        ? await this.usersRepo.createQueryBuilder('u').whereInIds(ids).getMany()
        : [];
    const userMap = new Map(users.map((u) => [u.id, u.username]));

    const answers = await this.answersRepo.find({
      where: { duelId: duel.id },
      order: { answeredAt: 'ASC' },
    });

    const challengerCorrect = answers.filter(
      (a) => a.userId === duel.challengerId && a.isCorrect && !a.isSteal,
    ).length;

    const opponentCorrect = answers.filter(
      (a) => a.userId === duel.opponentId && a.isCorrect && !a.isSteal,
    ).length;

    const playedIds = duel.questionIds.slice(0, duel.currentQuestionIndex + 1);

    const questionSummary: QuestionSummaryItem[] = playedIds.map((qId, index) => {
      const cAnswer = answers.find(
        (a) => a.questionId === qId && a.userId === duel.challengerId && !a.isSteal,
      );
      const oAnswer = answers.find(
        (a) => a.questionId === qId && a.userId === duel.opponentId && !a.isSteal,
      );

      return {
        questionIndex: index,
        challengerResult: !cAnswer
          ? 'pending'
          : cAnswer.selectedAnswer === -1
            ? 'timeout'
            : cAnswer.isCorrect
              ? 'correct'
              : 'wrong',
        opponentResult: !oAnswer
          ? 'pending'
          : oAnswer.selectedAnswer === -1
            ? 'timeout'
            : oAnswer.isCorrect
              ? 'correct'
              : 'wrong',
      };
    });

    return DuelResponseDto.fromEntity(duel, {
      challengerUsername: userMap.get(duel.challengerId) ?? '',
      opponentUsername: duel.opponentId ? (userMap.get(duel.opponentId) ?? null) : null,
      challengerCorrect,
      opponentCorrect,
      questionSummary,
    });
  }

  async getCurrentQuestion(duel: Duel): Promise<QuestionResponseDto> {
    const questionId = duel.questionIds[duel.currentQuestionIndex];
    const question = await this.questionsService.findById(questionId);

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return QuestionResponseDto.fromEntity(question);
  }

  async createDuel(userId: string, dto: CreateDuelDto): Promise<DuelResponseDto> {
    const config = await this.duelConfigService.getConfig();

    if (!config.stakeTiers.includes(dto.stake)) {
      throw new BadRequestException(
        `Invalid stake amount. Allowed tiers: ${config.stakeTiers.join(', ')}`,
      );
    }

    if (dto.stake > 0) {
      const wallet = await this.walletService.findByUserId(userId);
      const balance = await this.walletService.getBalance(wallet.id);

      if (parseFloat(balance) < dto.stake) {
        throw new BadRequestException('Insufficient balance');
      }
    }

    const questionCount = dto.mode === DuelMode.BLITZ ? BLITZ_QUESTION_COUNT : config.questionsPerDuel;
    const questions = await this.questionsService.selectQuestionsForSession(
      userId,
      this.arenaToCategory(dto.arena),
      questionCount,
    );

    if (questions.length === 0) {
      throw new BadRequestException('No questions available for this arena');
    }

    const code = await this.generateUniqueCode();
    const expiresAt = new Date(Date.now() + config.expiryMinutes * 60_000);

    const duel = this.duelsRepo.create({
      code,
      mode: dto.mode,
      arena: dto.arena,
      stake: dto.stake.toFixed(2),
      challengerId: userId,
      questionIds: questions.map((q) => q.id),
      expiresAt,
    });

    const saved = await this.duelsRepo.save(duel);

    this.logger.log(`Duel created: ${saved.id} code=${saved.code} by ${userId}`);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'https://arena.gg';
    const shareUrl = `${frontendUrl}/duels/${saved.code}`;

    return DuelResponseDto.fromEntity(saved, { shareUrl });
  }

  async acceptDuel(code: string, userId: string): Promise<DuelResponseDto> {
    const duel = await this.duelsRepo.findOne({ where: { code } });

    if (!duel) {
      throw new NotFoundException('Duel not found');
    }

    if (duel.status !== DuelStatus.PENDING) {
      throw new BadRequestException('Duel is not pending');
    }

    if (duel.challengerId === userId) {
      throw new BadRequestException('Cannot accept your own duel');
    }

    if (duel.expiresAt && duel.expiresAt < new Date()) {
      throw new BadRequestException('Duel has expired');
    }

    const stake = parseFloat(duel.stake);

    if (stake > 0) {
      const [cWallet, oWallet] = await Promise.all([
        this.walletService.findByUserId(duel.challengerId),
        this.walletService.findByUserId(userId),
      ]);

      await Promise.all([
        this.walletService.debit(cWallet.id, stake, TransactionType.ENTRY_FEE, {
          description: `Duel stake: ${duel.id}`,
          extra: { duelId: duel.id },
        }),
        this.walletService.debit(oWallet.id, stake, TransactionType.ENTRY_FEE, {
          description: `Duel stake: ${duel.id}`,
          extra: { duelId: duel.id },
        }),
      ]);
    }

    duel.opponentId = userId;
    duel.status = DuelStatus.ACTIVE;
    duel.startedAt = new Date();

    const saved = await this.duelsRepo.save(duel);

    this.logger.log(`Duel accepted: ${saved.id} challenger=${saved.challengerId} opponent=${userId}`);

    this.eventEmitter.emit('duel.accepted', { duelId: saved.id });

    return DuelResponseDto.fromEntity(saved);
  }

  async matchmakeDuel(userId: string, dto: MatchmakeDuelDto): Promise<DuelResponseDto> {
    const config = await this.duelConfigService.getConfig();

    if (!config.stakeTiers.includes(dto.stake)) {
      throw new BadRequestException(
        `Invalid stake amount. Allowed tiers: ${config.stakeTiers.join(', ')}`,
      );
    }

    const bracket = await this.getUserSkillBracket(userId);
    const { min, max } = this.bracketScoreBounds(bracket);

    const match = await this.duelsRepo
      .createQueryBuilder('d')
      .innerJoin(
        (qb) =>
          qb
            .from(TournamentEntry, 'e')
            .select('e.userId', 'userId')
            .addSelect('COALESCE(SUM(e.score), 0)::int', 'totalScore')
            .groupBy('e.userId'),
        'scores',
        'd.challengerId = scores."userId"',
      )
      .where('d.mode = :mode', { mode: dto.mode })
      .andWhere('d.arena = :arena', { arena: dto.arena })
      .andWhere('d.stake = :stake', { stake: dto.stake.toFixed(2) })
      .andWhere('d.status = :status', { status: DuelStatus.PENDING })
      .andWhere('(d.expiresAt IS NULL OR d.expiresAt > NOW())')
      .andWhere('d.challengerId != :userId', { userId })
      .andWhere('scores."totalScore" BETWEEN :min AND :max', { min, max })
      .orderBy('d.createdAt', 'ASC')
      .limit(1)
      .getOne();

    if (match) {
      return this.acceptDuelById(match.id, userId);
    }

    return this.createDuel(userId, dto);
  }

  private async acceptDuelById(duelId: string, userId: string): Promise<DuelResponseDto> {
    const duel = await this.duelsRepo.findOne({ where: { id: duelId } });

    if (!duel || duel.status !== DuelStatus.PENDING) {
      throw new BadRequestException('Duel no longer available');
    }

    const stake = parseFloat(duel.stake);

    if (stake > 0) {
      const [cWallet, oWallet] = await Promise.all([
        this.walletService.findByUserId(duel.challengerId),
        this.walletService.findByUserId(userId),
      ]);

      await Promise.all([
        this.walletService.debit(cWallet.id, stake, TransactionType.ENTRY_FEE, {
          description: `Duel stake: ${duel.id}`,
          extra: { duelId: duel.id },
        }),
        this.walletService.debit(oWallet.id, stake, TransactionType.ENTRY_FEE, {
          description: `Duel stake: ${duel.id}`,
          extra: { duelId: duel.id },
        }),
      ]);
    }

    duel.opponentId = userId;
    duel.status = DuelStatus.ACTIVE;
    duel.startedAt = new Date();

    const saved = await this.duelsRepo.save(duel);

    this.logger.log(`Duel matched: ${saved.id} challenger=${saved.challengerId} opponent=${userId}`);

    this.eventEmitter.emit('duel.accepted', { duelId: saved.id });

    return DuelResponseDto.fromEntity(saved);
  }

  async getDuelHistory(
    userId: string,
    query: PaginatedQueryDto,
    status?: DuelStatus,
  ): Promise<PaginatedResponseDto<DuelListItemDto>> {
    const qb = this.duelsRepo
      .createQueryBuilder('d')
      .where('(d.challengerId = :userId OR d.opponentId = :userId)', { userId });

    if (status) {
      qb.andWhere('d.status = :status', { status });
    }

    qb.orderBy('d.createdAt', query.order.toUpperCase() as 'ASC' | 'DESC');
    qb.skip((query.page - 1) * query.limit);
    qb.take(query.limit);

    const [duels, total] = await qb.getManyAndCount();

    const userMap = await this.buildUsernameMap(duels);

    return new PaginatedResponseDto(
      duels.map((d) =>
        DuelListItemDto.fromEntity(d, {
          challengerUsername: userMap.get(d.challengerId),
          opponentUsername: d.opponentId ? (userMap.get(d.opponentId) ?? null) : null,
        }),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  async listAllDuels(query: PaginatedQueryDto): Promise<PaginatedResponseDto<DuelListItemDto>> {
    const qb = this.duelsRepo.createQueryBuilder('d');

    qb.orderBy('d.createdAt', query.order.toUpperCase() as 'ASC' | 'DESC');
    qb.skip((query.page - 1) * query.limit);
    qb.take(query.limit);

    const [duels, total] = await qb.getManyAndCount();

    const userMap = await this.buildUsernameMap(duels);

    return new PaginatedResponseDto(
      duels.map((d) =>
        DuelListItemDto.fromEntity(d, {
          challengerUsername: userMap.get(d.challengerId),
          opponentUsername: d.opponentId ? (userMap.get(d.opponentId) ?? null) : null,
        }),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  async expirePendingDuels(): Promise<void> {
    const result = await this.duelsRepo
      .createQueryBuilder()
      .update(Duel)
      .set({ status: DuelStatus.CANCELLED })
      .where('status = :status', { status: DuelStatus.PENDING })
      .andWhere('expiresAt IS NOT NULL')
      .andWhere('expiresAt < NOW()')
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`Expired ${result.affected} pending duel(s)`);
    }
  }

  async flagDuel(duelId: string): Promise<void> {
    const duel = await this.duelsRepo.findOne({ where: { id: duelId } });

    if (!duel) {
      throw new NotFoundException('Duel not found');
    }

    duel.isFlagged = true;
    await this.duelsRepo.save(duel);

    this.logger.log(`Duel flagged for review: ${duelId}`);
  }

  async releaseFlaggedDuel(duelId: string): Promise<void> {
    const duel = await this.duelsRepo.findOne({ where: { id: duelId } });

    if (!duel || !duel.isFlagged) return;

    duel.isFlagged = false;
    await this.duelsRepo.save(duel);

    // Release both wallet payout and progression that were held on flagging
    await this.handleCompletionPrize(duel);
    await this.progressionService.award(duel);

    this.logger.log(`Flagged duel released: ${duelId}`);
  }

  async cancelAndRefund(duelId: string): Promise<void> {
    const duel = await this.duelsRepo.findOne({ where: { id: duelId } });

    if (!duel || (duel.status !== DuelStatus.ACTIVE && duel.status !== DuelStatus.SUDDEN_DEATH)) {
      return;
    }

    duel.status = DuelStatus.CANCELLED;
    duel.completedAt = new Date();

    await this.duelsRepo.save(duel);

    const stake = parseFloat(duel.stake);

    if (stake > 0 && duel.opponentId) {
      const [cWallet, oWallet] = await Promise.all([
        this.walletService.findByUserId(duel.challengerId),
        this.walletService.findByUserId(duel.opponentId),
      ]);

      await Promise.all([
        this.walletService.credit(cWallet.id, stake, TransactionType.REFUND, {
          description: `Early disconnect refund: duel ${duelId}`,
          extra: { duelId, reason: 'early_disconnect' },
        }),
        this.walletService.credit(oWallet.id, stake, TransactionType.REFUND, {
          description: `Early disconnect refund: duel ${duelId}`,
          extra: { duelId, reason: 'early_disconnect' },
        }),
      ]);
    }

    this.logger.log(`Duel cancelled (early disconnect, stakes refunded): ${duelId}`);
  }

  async forfeit(duelId: string, forfeitingUserId: string): Promise<void> {
    const duel = await this.duelsRepo.findOne({ where: { id: duelId } });

    if (!duel || (duel.status !== DuelStatus.ACTIVE && duel.status !== DuelStatus.SUDDEN_DEATH)) {
      return;
    }

    const winnerId =
      duel.challengerId === forfeitingUserId ? duel.opponentId : duel.challengerId;

    if (!winnerId) return;

    duel.status = DuelStatus.CANCELLED;
    duel.winnerId = winnerId;
    duel.resolution = 'forfeit';
    duel.tiebreakDeltaMs = 0;
    duel.completedAt = new Date();

    await this.duelsRepo.save(duel);

    const stake = parseFloat(duel.stake);

    if (stake > 0 && !duel.isFlagged) {
      const winnerWallet = await this.walletService.findByUserId(winnerId);
      const prize = stake * 2 * 0.75;

      await this.walletService.credit(winnerWallet.id, prize, TransactionType.PRIZE_PAYOUT, {
        description: `Forfeit winnings: duel ${duelId}`,
        extra: { duelId, reason: 'forfeit' },
      });
    }

    await this.progressionService.award(duel);

    this.logger.log(`Duel forfeited: ${duelId} by ${forfeitingUserId} winner=${winnerId}`);

    this.eventEmitter.emit('duel.forfeited', { duelId, winnerId, forfeitingUserId });
  }

  async processAnswer(
    duel: Duel,
    userId: string,
    selectedAnswer: number,
    timeTakenMs: number | null,
  ): Promise<ProcessAnswerResult> {
    // Always re-fetch for concurrency safety
    const freshDuel = await this.duelsRepo.findOne({ where: { id: duel.id } });

    if (
      !freshDuel ||
      (freshDuel.status !== DuelStatus.ACTIVE && freshDuel.status !== DuelStatus.SUDDEN_DEATH)
    ) {
      throw new BadRequestException('Duel is not in a playable state');
    }

    const questionId = freshDuel.questionIds[freshDuel.currentQuestionIndex];
    const question = await this.questionsService.findById(questionId);

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    // Detect steal attempt
    const isStealAttempt =
      freshDuel.mode === DuelMode.STEAL &&
      freshDuel.stealOpportunityUserId === userId &&
      freshDuel.stealQuestionId === questionId;

    // Validate not already answered
    const alreadyAnswered = await this.answersRepo.count({
      where: { duelId: freshDuel.id, questionId, userId, isSteal: isStealAttempt },
    });

    if (alreadyAnswered > 0) {
      // Both players may have answered simultaneously and completion wasn't triggered yet.
      // Check and complete the duel before re-throwing so the gateway's silent-ignore path
      // doesn't leave the game stuck.
      if (
        freshDuel.currentQuestionIndex >= freshDuel.questionIds.length - 1 &&
        freshDuel.status === DuelStatus.ACTIVE
      ) {
        const totalForQuestion = await this.answersRepo.count({
          where: { duelId: freshDuel.id, questionId, isSteal: false },
        });

        if (totalForQuestion >= 2) {
          await this.completeDuelLogic(freshDuel);
        }
      }

      throw new BadRequestException('Already answered this question');
    }

    const isCorrect = question.correctAnswer === selectedAnswer;
    const isChallenger = userId === freshDuel.challengerId;

    // Save the answer
    const answerEntity = this.answersRepo.create({
      duelId: freshDuel.id,
      userId,
      questionId,
      selectedAnswer,
      isCorrect,
      isSteal: isStealAttempt,
      stealSuccess: isStealAttempt ? isCorrect : null,
      timeTakenMs,
    });

    await this.answersRepo.save(answerEntity);

    // Mode-specific scoring
    let scoreAdded = 0;
    let stealOpportunity = false;
    let stealResult: { success: boolean } | null = null;
    let immediateComplete = false;

    if (isStealAttempt) {
      // Resolve steal
      stealResult = { success: isCorrect };

      if (isCorrect) {
        scoreAdded = 1;

        if (isChallenger) {
          freshDuel.challengerScore += 1;
        } else {
          freshDuel.opponentScore += 1;
        }
      }

      freshDuel.stealOpportunityUserId = null;
      freshDuel.stealQuestionId = null;
    } else {
      switch (freshDuel.mode) {
        case DuelMode.TRIVIA:
        case DuelMode.BLITZ: {
          if (isCorrect) {
            scoreAdded = 1;

            if (isChallenger) {
              freshDuel.challengerScore += 1;
            } else {
              freshDuel.opponentScore += 1;
            }
          }
          break;
        }

        case DuelMode.STREAK: {
          if (isCorrect) {
            const currentStreak = isChallenger ? freshDuel.challengerStreak : freshDuel.opponentStreak;
            const newStreak = currentStreak + 1;

            scoreAdded = newStreak;

            if (isChallenger) {
              freshDuel.challengerScore += newStreak;
              freshDuel.challengerStreak = newStreak;
              freshDuel.challengerMaxStreak = Math.max(freshDuel.challengerMaxStreak, newStreak);
            } else {
              freshDuel.opponentScore += newStreak;
              freshDuel.opponentStreak = newStreak;
              freshDuel.opponentMaxStreak = Math.max(freshDuel.opponentMaxStreak, newStreak);
            }
          } else {
            if (isChallenger) {
              freshDuel.challengerStreak = 0;
            } else {
              freshDuel.opponentStreak = 0;
            }
          }
          break;
        }

        case DuelMode.SUDDEN_DEATH: {
          // Only score — elimination is deferred until both players have answered
          if (isCorrect) {
            scoreAdded = 1;

            if (isChallenger) {
              freshDuel.challengerScore += 1;
            } else {
              freshDuel.opponentScore += 1;
            }
          }
          break;
        }

        case DuelMode.STEAL: {
          if (isCorrect) {
            scoreAdded = 1;

            if (isChallenger) {
              freshDuel.challengerScore += 1;
            } else {
              freshDuel.opponentScore += 1;
            }
          } else if (!freshDuel.stealOpportunityUserId) {
            // Give opponent a steal opportunity
            const opponentId = isChallenger ? freshDuel.opponentId : freshDuel.challengerId;

            if (opponentId) {
              freshDuel.stealOpportunityUserId = opponentId;
              freshDuel.stealQuestionId = questionId;
              stealOpportunity = true;
            }
          }
          break;
        }
      }
    }

    await this.duelsRepo.save(freshDuel);

    // ── Sudden Death: defer elimination until both players have answered ────────
    if (freshDuel.mode === DuelMode.SUDDEN_DEATH && !isStealAttempt) {
      const answersForQuestion = await this.answersRepo.count({
        where: { duelId: freshDuel.id, questionId, isSteal: false },
      });

      if (answersForQuestion < 2) {
        // Other player hasn't answered yet — nothing to resolve
        return {
          isCorrect,
          scoreAdded,
          updatedDuel: freshDuel,
          bothAnswered: false,
          nextQuestionReady: false,
          duelComplete: false,
          stealOpportunity: false,
          stealResult: null,
          suddenDeathStarted: false,
        };
      }

      const wrongAnswers = await this.answersRepo.count({
        where: { duelId: freshDuel.id, questionId, isCorrect: false, isSteal: false },
      });

      if (wrongAnswers === 2) {
        // Both wrong — advance to next question (or complete if pool exhausted)
        const isLastQuestion = freshDuel.currentQuestionIndex + 1 >= freshDuel.questionIds.length;

        if (!isLastQuestion) {
          freshDuel.currentQuestionIndex += 1;
          await this.duelsRepo.save(freshDuel);

          return {
            isCorrect,
            scoreAdded,
            updatedDuel: freshDuel,
            bothAnswered: true,
            nextQuestionReady: true,
            duelComplete: false,
            stealOpportunity: false,
            stealResult: null,
            suddenDeathStarted: false,
          };
        }

        const result = await this.completeDuelLogic(freshDuel);

        return {
          isCorrect,
          scoreAdded,
          updatedDuel: freshDuel,
          bothAnswered: true,
          nextQuestionReady: false,
          duelComplete: result.duelComplete,
          stealOpportunity: false,
          stealResult: null,
          suddenDeathStarted: result.suddenDeathStarted,
        };
      }

      // One correct, one wrong — eliminate the wrong answer's player via SD resolution.
      // Both correct — advance to next question or resolve via speed tiebreak on last.
      const loserAnswer = await this.answersRepo.findOne({
        where: { duelId: freshDuel.id, questionId, isCorrect: false, isSteal: false },
      });

      if (loserAnswer) {
        await this.finalizeWithResolver(freshDuel, { suddenDeathLoserId: loserAnswer.userId });

        return {
          isCorrect,
          scoreAdded,
          updatedDuel: freshDuel,
          bothAnswered: true,
          nextQuestionReady: false,
          duelComplete: true,
          stealOpportunity: false,
          stealResult: null,
          suddenDeathStarted: false,
        };
      }

      // Both correct — advance to the next question or finalize with speed tiebreak
      const isLastSdQuestion =
        freshDuel.currentQuestionIndex + 1 >= freshDuel.questionIds.length;

      if (!isLastSdQuestion) {
        freshDuel.currentQuestionIndex += 1;
        await this.duelsRepo.save(freshDuel);

        return {
          isCorrect,
          scoreAdded,
          updatedDuel: freshDuel,
          bothAnswered: true,
          nextQuestionReady: true,
          duelComplete: false,
          stealOpportunity: false,
          stealResult: null,
          suddenDeathStarted: false,
        };
      }

      const sdResult = await this.completeDuelLogic(freshDuel);

      return {
        isCorrect,
        scoreAdded,
        updatedDuel: freshDuel,
        bothAnswered: true,
        nextQuestionReady: false,
        duelComplete: sdResult.duelComplete,
        stealOpportunity: false,
        stealResult: null,
        suddenDeathStarted: sdResult.suddenDeathStarted,
      };
    }
    // ── End Sudden Death ────────────────────────────────────────────────────────

    // Count both-answered (non-steal answers for current question)
    const answerCount = await this.answersRepo.count({
      where: { duelId: freshDuel.id, questionId, isSteal: false },
    });

    const bothAnswered =
      answerCount >= 2 && !freshDuel.stealOpportunityUserId && !stealOpportunity;

    let nextQuestionReady = false;
    let duelComplete = immediateComplete;
    let suddenDeathStarted = false;

    if ((bothAnswered || immediateComplete) && !duelComplete) {
      const isLastQuestion =
        freshDuel.currentQuestionIndex + 1 >= freshDuel.questionIds.length;

      if (isLastQuestion) {
        const result = await this.completeDuelLogic(freshDuel);

        duelComplete = result.duelComplete;
        suddenDeathStarted = result.suddenDeathStarted;
      } else {
        freshDuel.currentQuestionIndex += 1;

        await this.duelsRepo.save(freshDuel);

        nextQuestionReady = true;
      }
    }

    if (immediateComplete) {
      await this.handleCompletionPrize(freshDuel);
      const immediateStats = await this.buildCompletionStats(freshDuel);
      this.eventEmitter.emit('duel.completed', { duel: freshDuel, ...immediateStats });
    }

    return {
      isCorrect,
      scoreAdded,
      updatedDuel: freshDuel,
      bothAnswered,
      nextQuestionReady,
      duelComplete,
      stealOpportunity,
      stealResult,
      suddenDeathStarted,
    };
  }

  private async buildCompletionStats(duel: Duel): Promise<{
    questionSummary: QuestionSummaryItem[];
    challengerCorrect: number;
    opponentCorrect: number;
  }> {
    const answers = await this.answersRepo.find({
      where: { duelId: duel.id, isSteal: false },
    });

    const answerMap = new Map<string, Map<string, DuelAnswer>>();

    for (const answer of answers) {
      if (!answerMap.has(answer.questionId)) {
        answerMap.set(answer.questionId, new Map());
      }
      answerMap.get(answer.questionId)!.set(answer.userId, answer);
    }

    const toResult = (a: DuelAnswer | undefined): 'correct' | 'wrong' | 'timeout' => {
      if (!a || a.selectedAnswer === -1) return 'timeout';
      return a.isCorrect ? 'correct' : 'wrong';
    };

    let challengerCorrect = 0;
    let opponentCorrect = 0;

    const playedIds = duel.questionIds.slice(0, duel.currentQuestionIndex + 1);

    const questionSummary: QuestionSummaryItem[] = playedIds.map((questionId, index) => {
      const qMap = answerMap.get(questionId);
      const challengerResult = toResult(qMap?.get(duel.challengerId));
      const opponentResult = toResult(duel.opponentId ? qMap?.get(duel.opponentId) : undefined);

      if (challengerResult === 'correct') challengerCorrect++;
      if (opponentResult === 'correct') opponentCorrect++;

      return { questionIndex: index, challengerResult, opponentResult };
    });

    return { questionSummary, challengerCorrect, opponentCorrect };
  }

  private async finalizeWithResolver(
    duel: Duel,
    opts: { suddenDeathLoserId?: string | null } = {},
  ): Promise<{ duelComplete: boolean; suddenDeathStarted: boolean }> {
    const allAnswers = await this.answersRepo.find({
      where: { duelId: duel.id, isSteal: false },
    });

    const resolved = resolveDuel({
      challengerId: duel.challengerId,
      opponentId: duel.opponentId!,
      challengerScore: duel.challengerScore,
      opponentScore: duel.opponentScore,
      answers: allAnswers,
      suddenDeathLoserId: opts.suddenDeathLoserId ?? null,
    });

    duel.winnerId = resolved.winnerId;
    duel.resolution = resolved.resolution;
    duel.tiebreakDeltaMs = resolved.tiebreakDeltaMs;
    if (resolved.resolution === 'draw') duel.isTie = true;

    duel.status = DuelStatus.COMPLETED;
    duel.completedAt = new Date();

    await this.duelsRepo.save(duel);
    await this.handleCompletionPrize(duel);
    await this.progressionService.award(duel);

    const stats = await this.buildCompletionStats(duel);
    this.eventEmitter.emit('duel.completed', { duel, ...stats });

    return { duelComplete: true, suddenDeathStarted: false };
  }

  private async completeDuelLogic(
    duel: Duel,
  ): Promise<{ duelComplete: boolean; suddenDeathStarted: boolean }> {
    // TRIVIA / SD-status: handle ties with sudden death rounds
    if (
      (duel.mode === DuelMode.TRIVIA || duel.status === DuelStatus.SUDDEN_DEATH) &&
      duel.challengerScore === duel.opponentScore
    ) {
      // In a sudden death round with both players correct, resolve via speed tiebreak
      // rather than spawning another round.
      if (duel.status === DuelStatus.SUDDEN_DEATH) {
        const sdQuestionId = duel.questionIds[duel.currentQuestionIndex];
        const sdAnswers = await this.answersRepo.find({
          where: { duelId: duel.id, questionId: sdQuestionId, isSteal: false },
        });

        const cCorrect = sdAnswers.some((a) => a.userId === duel.challengerId && a.isCorrect);
        const oCorrect = sdAnswers.some((a) => a.userId === duel.opponentId && a.isCorrect);

        if (cCorrect && oCorrect) {
          return this.finalizeWithResolver(duel);
        }
      }

      // Attempt to fetch one more question for a new SD round
      const questions = await this.questionsService.selectQuestionsForSession(
        duel.challengerId,
        this.arenaToCategory(duel.arena),
        1,
      );

      if (questions.length === 0) {
        // Pool exhausted — resolver decides (speed tiebreak or draw)
        return this.finalizeWithResolver(duel);
      }

      // Append sudden death question and continue
      duel.questionIds = [...duel.questionIds, questions[0].id];
      duel.currentQuestionIndex = duel.questionIds.length - 1;
      duel.suddenDeathRound += 1;
      duel.status = DuelStatus.SUDDEN_DEATH;

      await this.duelsRepo.save(duel);

      return { duelComplete: false, suddenDeathStarted: true };
    }

    // All other cases: unified resolver handles score, speed tiebreak, or draw
    return this.finalizeWithResolver(duel);
  }

  private async handleCompletionPrize(duel: Duel): Promise<void> {
    const stake = parseFloat(duel.stake);

    if (stake <= 0 || duel.isFlagged) return;

    const isDraw = duel.resolution === 'draw' || (duel.resolution === null && duel.isTie);

    if (isDraw) {
      const [cWallet, oWallet] = await Promise.all([
        this.walletService.findByUserId(duel.challengerId),
        this.walletService.findByUserId(duel.opponentId!),
      ]);

      await Promise.all([
        this.walletService.credit(cWallet.id, stake, TransactionType.REFUND, {
          description: `Duel draw refund: ${duel.id}`,
          extra: { duelId: duel.id },
        }),
        this.walletService.credit(oWallet.id, stake, TransactionType.REFUND, {
          description: `Duel draw refund: ${duel.id}`,
          extra: { duelId: duel.id },
        }),
      ]);

      return;
    }

    if (!duel.winnerId) return;

    const winnerWallet = await this.walletService.findByUserId(duel.winnerId);
    const prize = stake * 2 * 0.75;

    await this.walletService.credit(winnerWallet.id, prize, TransactionType.PRIZE_PAYOUT, {
      description: `Duel prize: ${duel.id}`,
      extra: { duelId: duel.id },
    });
  }

  async resolveExpiredSteal(duelId: string): Promise<{
    updatedDuel: Duel;
    nextQuestionReady: boolean;
    duelComplete: boolean;
    suddenDeathStarted: boolean;
  }> {
    const duel = await this.duelsRepo.findOne({ where: { id: duelId } });

    if (!duel || !duel.stealOpportunityUserId) {
      const fallback = duel ?? ({ id: duelId } as Duel);
      return {
        updatedDuel: fallback,
        nextQuestionReady: false,
        duelComplete: false,
        suddenDeathStarted: false,
      };
    }

    const questionId = duel.stealQuestionId!;

    duel.stealOpportunityUserId = null;
    duel.stealQuestionId = null;

    await this.duelsRepo.save(duel);

    // Check if both players have submitted non-steal answers
    const answerCount = await this.answersRepo.count({
      where: { duelId, questionId, isSteal: false },
    });

    let nextQuestionReady = false;
    let duelComplete = false;
    let suddenDeathStarted = false;

    if (answerCount >= 2) {
      const isLastQuestion = duel.currentQuestionIndex + 1 >= duel.questionIds.length;

      if (isLastQuestion) {
        const result = await this.completeDuelLogic(duel);

        duelComplete = result.duelComplete;
        suddenDeathStarted = result.suddenDeathStarted;
      } else {
        duel.currentQuestionIndex += 1;

        await this.duelsRepo.save(duel);

        nextQuestionReady = true;
      }
    }

    return { updatedDuel: duel, nextQuestionReady, duelComplete, suddenDeathStarted };
  }
}
