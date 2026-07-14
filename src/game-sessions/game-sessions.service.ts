import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameSession } from './entities/game-session.entity';
import { GameAnswer } from './entities/game-answer.entity';
import { SessionStatus } from './types/session-status.enum';
import { QuestionsService } from '../questions/questions.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { QuestionResponseDto } from '../questions/dto/question-response.dto';
import { StartSessionResponseDto } from './dto/start-session-response.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { SubmitAnswerResponseDto } from './dto/submit-answer-response.dto';
import { SessionResultDto } from './dto/session-result.dto';
import { TournamentArena } from '../tournaments/types/tournament-arena.enum';
import { QuestionCategory } from '../questions/types/question-category.enum';
import { GameType } from './types/game-type.enum';
import {
  ProgressionAwardService,
  soloTriviaXp,
} from '../progression/services/progression-award.service';
import { User } from '../users/entities/user.entity';
import { Duel } from '../duels/entities/duel.entity';
import { DuelStatus } from '../duels/types/duel-status.enum';
import {
  levelFromXp,
  currentSeasonId,
  FIRST_DUEL_DAY_XP,
  tournamentAwardXp,
  ProgressionSnapshot,
} from '../duels/duel-progression';
import { rankFromSeasonPoints } from '../common/rank-tiers';

const QUESTIONS_PER_SESSION = 10;
const FLAG_AVG_MS_THRESHOLD = 2000;
const FLAG_MIN_ANSWERS = 5;
const FLAG_PERFECT_TOTAL_MS = 30000;

@Injectable()
export class GameSessionsService {
  private readonly logger = new Logger(GameSessionsService.name);

  constructor(
    @InjectRepository(GameSession)
    private readonly sessionsRepo: Repository<GameSession>,
    @InjectRepository(GameAnswer)
    private readonly answersRepo: Repository<GameAnswer>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Duel)
    private readonly duelsRepo: Repository<Duel>,
    private readonly questionsService: QuestionsService,
    private readonly tournamentsService: TournamentsService,
    private readonly progressionAward: ProgressionAwardService,
  ) {}

  private arenaToCategory(arena: TournamentArena): QuestionCategory {
    return arena as unknown as QuestionCategory;
  }

  async startSession(userId: string, tournamentId: string): Promise<StartSessionResponseDto> {
    const tournament = await this.tournamentsService.findOne(tournamentId);

    const category = this.arenaToCategory(tournament.arena);
    const questions = await this.questionsService.selectQuestionsForSession(
      userId,
      category,
      QUESTIONS_PER_SESSION,
    );

    if (questions.length === 0) {
      throw new BadRequestException('No questions available for this tournament arena');
    }

    const session = this.sessionsRepo.create({
      tournamentId,
      userId,
      gameType: tournament.gameType,
      questionIds: questions.map((q) => q.id),
      status: SessionStatus.ACTIVE,
    });

    const saved = await this.sessionsRepo.save(session);

    this.logger.log(`Session started: ${saved.id} user=${userId} tournament=${tournamentId}`);

    const dto = new StartSessionResponseDto();
    dto.id = saved.id;
    dto.tournamentId = saved.tournamentId;
    dto.userId = saved.userId;
    dto.gameType = saved.gameType;
    dto.status = saved.status;
    dto.totalQuestions = saved.questionIds.length;
    dto.startedAt = saved.startedAt;

    return dto;
  }

  /**
   * Start a SOLO (tournament-less) trivia session. Selects N random active
   * questions — optionally filtered to a category, else mixed — and returns the
   * same shape as the tournament start. There is no prize/entry logic; a modest
   * solo XP is granted on completion (see completeSession).
   */
  async startSoloSession(
    userId: string,
    category?: QuestionCategory,
  ): Promise<StartSessionResponseDto> {
    const questions = await this.questionsService.selectSoloQuestions(
      userId,
      QUESTIONS_PER_SESSION,
      category,
    );

    if (questions.length === 0) {
      throw new BadRequestException('No questions available yet — please try again shortly');
    }

    const session = this.sessionsRepo.create({
      tournamentId: null,
      userId,
      gameType: GameType.LIGHTNING_TRIVIA,
      questionIds: questions.map((q) => q.id),
      status: SessionStatus.ACTIVE,
    });

    const saved = await this.sessionsRepo.save(session);

    this.logger.log(`Solo session started: ${saved.id} user=${userId} category=${category ?? 'mixed'}`);

    const dto = new StartSessionResponseDto();
    dto.id = saved.id;
    dto.tournamentId = saved.tournamentId;
    dto.userId = saved.userId;
    dto.gameType = saved.gameType;
    dto.status = saved.status;
    dto.totalQuestions = saved.questionIds.length;
    dto.startedAt = saved.startedAt;

    return dto;
  }

  /**
   * Returns the current question, or null if the session is no longer active.
   * Never throws a 400 — callers should treat null as "session is done, show results".
   */
  async getCurrentQuestion(sessionId: string, userId: string): Promise<QuestionResponseDto | null> {
    const session = await this.sessionsRepo.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) throw new NotFoundException('Session not found');

    if (session.status !== SessionStatus.ACTIVE) return null;

    if (session.currentIndex >= session.questionIds.length) return null;

    const questionId = session.questionIds[session.currentIndex];
    const question = await this.questionsService.findById(questionId);

    if (!question) throw new NotFoundException('Question not found');

    return QuestionResponseDto.fromEntity(question);
  }

  async getNextQuestion(sessionId: string, userId: string): Promise<QuestionResponseDto> {
    const session = await this.sessionsRepo
      .createQueryBuilder('s')
      .where('s.id = :sessionId AND s.userId = :userId', { sessionId, userId })
      .getOne();

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Session is not active');
    }

    if (session.totalAnswered < session.currentIndex) {
      throw new BadRequestException('Answer the current question before fetching the next one');
    }

    if (session.currentIndex >= session.questionIds.length) {
      throw new BadRequestException('No more questions in this session');
    }

    const questionId = session.questionIds[session.currentIndex];
    const question = await this.questionsService.findById(questionId);

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return QuestionResponseDto.fromEntity(question);
  }

  async submitAnswer(
    sessionId: string,
    userId: string,
    dto: SubmitAnswerDto,
  ): Promise<SubmitAnswerResponseDto> {
    const session = await this.sessionsRepo
      .createQueryBuilder('s')
      .where('s.id = :sessionId AND s.userId = :userId', { sessionId, userId })
      .getOne();

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Session is not active');
    }

    const expectedQuestionId = session.questionIds[session.currentIndex];

    if (dto.questionId !== expectedQuestionId) {
      throw new BadRequestException('Question ID does not match current question');
    }

    const question = await this.questionsService.findById(dto.questionId);

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const isCorrect = question.correctAnswer === dto.selectedAnswer;
    const serverTimestamp = Date.now().toString();

    const answer = this.answersRepo.create({
      sessionId,
      questionId: dto.questionId,
      selectedAnswer: dto.selectedAnswer,
      isCorrect,
      clientTimestamp: dto.clientTimestamp?.toString(),
      serverTimestamp,
      timeTakenMs: dto.timeTakenMs,
    });

    await this.answersRepo.save(answer);

    const newScore = session.score + (isCorrect ? 1 : 0);
    const newCorrect = session.correctAnswers + (isCorrect ? 1 : 0);
    const newTotal = session.totalAnswered + 1;
    const newIndex = session.currentIndex + 1;

    let isFlagged = session.isFlagged;
    let flagReason = session.flagReason;

    if (!isFlagged && newTotal >= FLAG_MIN_ANSWERS) {
      const answers = await this.answersRepo.find({ where: { sessionId } });
      const validTimes = answers.filter((a) => a.timeTakenMs != null).map((a) => a.timeTakenMs!);

      if (validTimes.length >= FLAG_MIN_ANSWERS) {
        const avgMs = validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length;

        if (avgMs < FLAG_AVG_MS_THRESHOLD) {
          isFlagged = true;
          flagReason = `Average answer time ${avgMs.toFixed(0)}ms below threshold`;
        }
      }

      if (!isFlagged && newCorrect === newTotal) {
        const totalElapsed = validTimes.reduce((sum, t) => sum + t, 0);

        if (totalElapsed < FLAG_PERFECT_TOTAL_MS) {
          isFlagged = true;
          flagReason = `Perfect score in ${totalElapsed}ms (under 30s)`;
        }
      }
    }

    await this.sessionsRepo.update(sessionId, {
      score: newScore,
      correctAnswers: newCorrect,
      totalAnswered: newTotal,
      currentIndex: newIndex,
      isFlagged,
      flagReason,
    });

    const response = new SubmitAnswerResponseDto();
    response.isCorrect = isCorrect;
    response.correctAnswer = question.correctAnswer;
    response.score = newScore;
    response.totalAnswered = newTotal;
    response.isFlagged = isFlagged;
    response.completed = false;

    if (newTotal === session.questionIds.length) {
      // Reflect updated state so completeSession sees correct counts
      session.score = newScore;
      session.correctAnswers = newCorrect;
      session.totalAnswered = newTotal;
      session.isFlagged = isFlagged;

      const result = await this.completeSession(sessionId, userId, session);

      response.completed = true;
      response.finalScore = newScore;
      response.myProgression = result.myProgression;
    }

    return response;
  }

  async completeSession(
    sessionId: string,
    userId: string,
    // Pass pre-fetched session to avoid an extra DB round-trip from submitAnswer
    existingSession?: GameSession,
  ): Promise<SessionResultDto> {
    const session =
      existingSession ??
      (await this.sessionsRepo
        .createQueryBuilder('s')
        .where('s.id = :sessionId AND s.userId = :userId', { sessionId, userId })
        .getOne());

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Session is not active');
    }

    const completedAt = new Date();
    const finalStatus = session.isFlagged ? SessionStatus.FLAGGED : SessionStatus.COMPLETED;

    await this.sessionsRepo.update(sessionId, {
      status: finalStatus,
      completedAt,
    });

    // Solo sessions have no tournament — skip entry-score/prize bookkeeping.
    if (session.tournamentId) {
      await this.tournamentsService.updateEntryScore(
        session.tournamentId,
        session.userId,
        session.score,
      );
    }

    const answers = await this.answersRepo.find({ where: { sessionId } });

    for (const answer of answers) {
      await this.questionsService.upsertHistory(
        session.userId,
        answer.questionId,
        answer.isCorrect,
      );
    }

    // Award XP and build progression snapshot (idempotent, honours flagged-session hold).
    // Tournament sessions run the tournament XP path; solo sessions get modest solo XP.
    const snapshot = session.tournamentId
      ? await this.awardTournamentProgression(session)
      : await this.awardSoloProgression(session);

    this.logger.log(
      `Session completed: ${sessionId} score=${session.score} flagged=${session.isFlagged}`,
    );

    const dto = new SessionResultDto();
    dto.id = session.id;
    dto.tournamentId = session.tournamentId;
    dto.score = session.score;
    dto.correctAnswers = session.correctAnswers;
    dto.totalAnswered = session.totalAnswered;
    dto.status = finalStatus;
    dto.isFlagged = session.isFlagged;
    dto.startedAt = session.startedAt;
    dto.completedAt = completedAt;
    dto.myProgression = snapshot;

    return dto;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async awardTournamentProgression(session: GameSession): Promise<ProgressionSnapshot | null> {
    // Idempotency guard
    if (session.progressionAwarded) {
      return session.sessionProgression;
    }
    // Flagged-session hold: same pattern as duels
    if (session.isFlagged) {
      return null;
    }

    const user = await this.usersRepo.findOne({ where: { id: session.userId } });
    if (!user) return null;

    const isFirst = await this.isFirstGameOfDay(session.userId, session.id);
    const firstGameBonus = isFirst ? FIRST_DUEL_DAY_XP : 0;

    const xpAwarded = tournamentAwardXp({
      correctAnswers: session.correctAnswers,
      totalAnswered: session.totalAnswered,
      firstGameOfDayBonus: firstGameBonus,
    });

    const seasonId = currentSeasonId();
    const xpBefore = Number(user.lifetimeXp);
    const spBefore = user.seasonId === seasonId ? user.seasonPoints : 0;

    // Update user XP — no SP for tournaments
    await this.usersRepo.update(user.id, {
      lifetimeXp: xpBefore + xpAwarded,
    });

    // Build snapshot — SP fields stay at spBefore (tournaments don't move rank)
    const xpAfter = xpBefore + xpAwarded;
    const { level: levelBefore, intoLevel: intoLevelBefore } = levelFromXp(xpBefore);
    const { level: levelAfter, intoLevel: intoLevelAfter, nextLevelAt } = levelFromXp(xpAfter);
    const { rank: rankBefore, rankFloor, nextRankAt } = rankFromSeasonPoints(spBefore);

    const snapshot: ProgressionSnapshot = {
      xpBefore,
      xpAfter,
      xpAwarded,
      levelBefore,
      levelAfter,
      intoLevelBefore,
      intoLevelAfter,
      nextLevelAt,
      spBefore,
      spAfter: spBefore, // no change
      spAwarded: 0,
      rankBefore,
      rankAfter: rankBefore, // no change
      rankFloor,
      nextRankAt,
      firstGameOfDayBonus: firstGameBonus,
    };

    await this.sessionsRepo.update(session.id, {
      progressionAwarded: true,
      sessionProgression: snapshot,
    });

    this.logger.log(
      `Tournament progression awarded: session=${session.id} user=${session.userId} +${xpAwarded}XP`,
    );

    return snapshot;
  }

  /**
   * Solo-session progression: modest XP into the LEVEL ledger (same mechanism as
   * solo Speed Math), so a solo trivia run moves the player's rank. No season
   * points, no prize logic, no reveal snapshot. Idempotent per session; never
   * throws into the completion path.
   */
  private async awardSoloProgression(session: GameSession): Promise<ProgressionSnapshot | null> {
    if (session.progressionAwarded) return session.sessionProgression;
    if (session.isFlagged) return null;

    try {
      await this.progressionAward.awardSoloXp(
        session.userId,
        `session:${session.id}`,
        soloTriviaXp(session.correctAnswers),
      );
      await this.sessionsRepo.update(session.id, { progressionAwarded: true });
      this.logger.log(`Solo progression awarded: session=${session.id} user=${session.userId}`);
    } catch (err) {
      this.logger.warn(`Solo XP award failed for session=${session.id}: ${err}`);
    }

    return null;
  }

  private async isFirstGameOfDay(userId: string, sessionId: string): Promise<boolean> {
    const todayStart = startOfUtcDay();

    const [priorSessions, priorDuels] = await Promise.all([
      this.sessionsRepo
        .createQueryBuilder('s')
        .where('s.userId = :uid', { uid: userId })
        .andWhere("s.status IN ('completed', 'flagged')")
        .andWhere('s.startedAt >= :start', { start: todayStart })
        .andWhere('s.id != :sid', { sid: sessionId })
        .getCount(),

      this.duelsRepo
        .createQueryBuilder('d')
        .where('(d.challengerId = :uid OR d.opponentId = :uid)', { uid: userId })
        .andWhere("d.status = 'completed'")
        .andWhere('d.completedAt >= :start', { start: todayStart })
        .getCount(),
    ]);

    return priorSessions === 0 && priorDuels === 0;
  }
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
