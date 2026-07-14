import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Question } from './entities/question.entity';
import { QuestionsService } from './questions.service';
import { SEED_QUESTIONS } from './data/seed-questions';

/**
 * Populates the question bank on boot IF AND ONLY IF it is empty, so a freshly
 * deployed (empty) database self-populates and trivia becomes playable, while an
 * already-populated DB is never touched or duplicated.
 *
 * Runs fire-and-forget from onModuleInit so a seeding hiccup (or a DB that isn't
 * ready) can never block or crash app startup. Insertion goes through
 * QuestionsService.bulkCreate, which is itself idempotent and honours the
 * @Unique(['content','category']) constraint.
 */
@Injectable()
export class QuestionsSeedService implements OnModuleInit {
  private readonly logger = new Logger(QuestionsSeedService.name);

  constructor(
    @InjectRepository(Question)
    private readonly questionsRepo: Repository<Question>,
    private readonly questionsService: QuestionsService,
  ) {}

  onModuleInit(): void {
    // Non-blocking: never hold up (or crash) boot on seeding.
    void this.seedIfEmpty().catch((err) =>
      this.logger.error(`Question seeding failed: ${err instanceof Error ? err.message : err}`),
    );
  }

  private async seedIfEmpty(): Promise<void> {
    const existing = await this.questionsRepo.count();
    if (existing > 0) {
      this.logger.log(`Question bank already populated (${existing}); skipping seed.`);
      return;
    }

    this.logger.log(`Question bank empty — seeding ${SEED_QUESTIONS.length} starter questions...`);
    const { created, skipped } = await this.questionsService.bulkCreate(SEED_QUESTIONS);
    this.logger.log(`Question seed complete: created=${created} skipped=${skipped}`);
  }
}
