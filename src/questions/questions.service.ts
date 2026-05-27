import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Question } from './entities/question.entity';
import { UserQuestionHistory } from './entities/user-question-history.entity';
import { QuestionCategory } from './types/question-category.enum';
import { QuestionDifficulty } from './types/question-difficulty.enum';
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
  ) {}

  async bulkCreate(dtos: CreateQuestionDto[]): Promise<{ created: number }> {
    const entities = this.questionsRepo.create(dtos);

    await this.questionsRepo.insert(entities);

    this.logger.log(`Bulk created ${entities.length} questions`);

    return { created: entities.length };
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
