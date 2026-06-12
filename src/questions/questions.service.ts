import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Question } from './entities/question.entity';
import { UserQuestionHistory } from './entities/user-question-history.entity';
import { QuestionReport } from './entities/question-report.entity';
import { QuestionCategory } from './types/question-category.enum';
import { QuestionDifficulty } from './types/question-difficulty.enum';
import { ReportReason } from './types/report-reason.enum';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QuestionListItemDto } from './dto/question-list-item.dto';
import { PaginatedQueryDto } from '../common/dto/paginated-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    @InjectRepository(Question)
    private readonly questionsRepo: Repository<Question>,
    @InjectRepository(UserQuestionHistory)
    private readonly historyRepo: Repository<UserQuestionHistory>,
    @InjectRepository(QuestionReport)
    private readonly reportRepo: Repository<QuestionReport>,
  ) {}

  async bulkCreate(questions: CreateQuestionDto[]): Promise<{ created: number; skipped: number }> {
    const normalize = (s: string) => s.toLowerCase().trim();

    const existing = await this.questionsRepo.find({
      where: questions.map((q) => ({ content: q.content, category: q.category })),
      select: { content: true, category: true },
    });

    const existingSet = new Set(existing.map((e) => `${e.category}::${normalize(e.content)}`));

    const toInsert = questions.filter(
      (q) => !existingSet.has(`${q.category}::${normalize(q.content)}`),
    );

    if (toInsert.length === 0) {
      return { created: 0, skipped: questions.length };
    }

    try {
      await this.questionsRepo.insert(toInsert.map((q) => this.questionsRepo.create(q)));
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === '23505'
      ) {
        this.logger.warn(`Bulk create unique violation — treating all as skipped`);
        return { created: 0, skipped: questions.length };
      }
      throw err;
    }

    this.logger.log(`Bulk create: inserted=${toInsert.length} skipped=${questions.length - toInsert.length}`);

    return { created: toInsert.length, skipped: questions.length - toInsert.length };
  }

  async list(params: {
    query: PaginatedQueryDto;
    category?: QuestionCategory;
    difficulty?: QuestionDifficulty;
  }): Promise<PaginatedResponseDto<QuestionListItemDto>> {
    const { query, category, difficulty } = params;
    const qb = this.questionsRepo.createQueryBuilder('q');

    if (category) {
      qb.andWhere('q.category = :category', { category });
    }

    if (difficulty) {
      qb.andWhere('q.difficulty = :difficulty', { difficulty });
    }

    qb.orderBy('q.createdAt', query.order.toUpperCase() as 'ASC' | 'DESC');
    qb.skip((query.page - 1) * query.limit);
    qb.take(query.limit);

    const [questions, total] = await qb.getManyAndCount();

    return new PaginatedResponseDto(
      questions.map(QuestionListItemDto.fromEntity),
      total,
      query.page,
      query.limit,
    );
  }

  async findById(id: string): Promise<Question | null> {
    return this.questionsRepo.findOne({ where: { id, isActive: true } });
  }

  async selectQuestionsForSession(
    userId: string,
    category: QuestionCategory,
    count: number,
  ): Promise<Question[]> {
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

    const recentlySeenIds = await this.historyRepo
      .createQueryBuilder('h')
      .select('h.questionId')
      .where('h.userId = :userId', { userId })
      .andWhere('h.shownAt > :cutoff', { cutoff })
      .getMany()
      .then((rows) => rows.map((r) => r.questionId));

    const qb = this.questionsRepo
      .createQueryBuilder('q')
      .where('q.category = :category', { category })
      .andWhere('q.isActive = true')
      .orderBy('RANDOM()')
      .take(count);

    if (recentlySeenIds.length > 0) {
      qb.andWhere('q.id NOT IN (:...recentlySeenIds)', { recentlySeenIds });
    }

    const questions = await qb.getMany();

    this.logger.log(
      `Selected ${questions.length} questions for userId=${userId} category=${category}`,
    );

    return questions;
  }

  async reportQuestion(
    questionId: string,
    userId: string,
    reason: ReportReason,
  ): Promise<{ success: true }> {
    const exists = await this.questionsRepo.exists({ where: { id: questionId } });

    if (!exists) {
      throw new NotFoundException('Question not found');
    }

    await this.reportRepo.upsert(
      { questionId, userId, reason },
      { conflictPaths: ['questionId', 'userId'] },
    );

    return { success: true };
  }

  async listReportedQuestions(query: PaginatedQueryDto): Promise<
    PaginatedResponseDto<{
      questionId: string;
      content: string;
      category: string;
      reportCount: number;
      reasons: ReportReason[];
    }>
  > {
    const baseQb = this.reportRepo
      .createQueryBuilder('r')
      .innerJoin('r.question', 'q')
      .select('q.id', 'questionId')
      .addSelect('q.content', 'content')
      .addSelect('q.category', 'category')
      .addSelect('COUNT(r.id)::int', 'reportCount')
      .addSelect('ARRAY_AGG(DISTINCT r.reason)', 'reasons')
      .groupBy('q.id');

    const countResult = await this.reportRepo
      .createQueryBuilder('r')
      .select('COUNT(DISTINCT r."questionId")::int', 'total')
      .getRawOne<{ total: string }>();

    const total = Number(countResult?.total ?? 0);

    const rows = await baseQb
      .orderBy('"reportCount"', 'DESC')
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<{
        questionId: string;
        content: string;
        category: string;
        reportCount: number;
        reasons: ReportReason[];
      }>();

    return new PaginatedResponseDto(rows, total, query.page, query.limit);
  }

  async upsertHistory(
    userId: string,
    questionId: string,
    answeredCorrectly: boolean,
  ): Promise<void> {
    await this.historyRepo
      .createQueryBuilder()
      .insert()
      .into(UserQuestionHistory)
      .values({ userId, questionId, shownAt: new Date(), answeredCorrectly })
      .orUpdate(['shownAt', 'answeredCorrectly'], ['userId', 'questionId'])
      .execute();
  }
}
