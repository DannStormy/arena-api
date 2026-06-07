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
import { TournamentResponseDto } from '../tournaments/dto/tournament-response.dto';
import { QuestionResponseDto } from '../questions/dto/question-response.dto';
import { StartSessionResponseDto } from './dto/start-session-response.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { SubmitAnswerResponseDto } from './dto/submit-answer-response.dto';
import { SessionResultDto } from './dto/session-result.dto';
import { TournamentArena } from '../tournaments/types/tournament-arena.enum';
import { QuestionCategory } from '../questions/types/question-category.enum';

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
    private readonly questionsService: QuestionsService,
    private readonly tournamentsService: TournamentsService,
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
      await this.completeSession(sessionId, userId);

      response.completed = true;
      response.finalScore = newScore;
    }

    return response;
  }

  async completeSession(sessionId: string, userId: string): Promise<SessionResultDto> {
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

    const completedAt = new Date();

    await this.sessionsRepo.update(sessionId, {
      status: session.isFlagged ? SessionStatus.FLAGGED : SessionStatus.COMPLETED,
      completedAt,
    });

    await this.tournamentsService.updateEntryScore(
      session.tournamentId,
      session.userId,
      session.score,
    );

    const answers = await this.answersRepo.find({ where: { sessionId } });

    for (const answer of answers) {
      await this.questionsService.upsertHistory(
        session.userId,
        answer.questionId,
        answer.isCorrect,
      );
    }

    this.logger.log(
      `Session completed: ${sessionId} score=${session.score} flagged=${session.isFlagged}`,
    );

    const dto = new SessionResultDto();
    dto.id = session.id;
    dto.tournamentId = session.tournamentId;
    dto.score = session.score;
    dto.correctAnswers = session.correctAnswers;
    dto.totalAnswered = session.totalAnswered;
    dto.status = session.isFlagged ? SessionStatus.FLAGGED : SessionStatus.COMPLETED;
    dto.isFlagged = session.isFlagged;
    dto.startedAt = session.startedAt;
    dto.completedAt = completedAt;

    return dto;
  }
}
