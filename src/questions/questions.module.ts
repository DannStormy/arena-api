import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from './entities/question.entity';
import { UserQuestionHistory } from './entities/user-question-history.entity';
import { QuestionReport } from './entities/question-report.entity';
import { QuestionsService } from './questions.service';
import { QuestionsSeedService } from './questions-seed.service';
import { QuestionsController } from './questions.controller';
import { QuestionReportsController } from './question-reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Question, UserQuestionHistory, QuestionReport])],
  providers: [QuestionsService, QuestionsSeedService],
  controllers: [QuestionsController, QuestionReportsController],
  exports: [QuestionsService],
})
export class QuestionsModule {}
