import { ApiProperty } from '@nestjs/swagger';
import { Question } from '../entities/question.entity';
import { QuestionCategory } from '../types/question-category.enum';
import { QuestionDifficulty } from '../types/question-difficulty.enum';

export class QuestionListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  content: string;

  @ApiProperty({ enum: QuestionCategory })
  category: QuestionCategory;

  @ApiProperty({ enum: QuestionDifficulty })
  difficulty: QuestionDifficulty;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(q: Question): QuestionListItemDto {
    const dto = new QuestionListItemDto();

    dto.id = q.id;
    dto.content = q.content;
    dto.category = q.category;
    dto.difficulty = q.difficulty;
    dto.isActive = q.isActive;
    dto.createdAt = q.createdAt;

    return dto;
  }
}
