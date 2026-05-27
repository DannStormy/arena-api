import { ApiProperty } from '@nestjs/swagger';
import { Question } from '../entities/question.entity';
import { QuestionCategory } from '../types/question-category.enum';
import { QuestionDifficulty } from '../types/question-difficulty.enum';

export class QuestionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  content: string;

  @ApiProperty({ type: [String] })
  options: string[];

  @ApiProperty({ enum: QuestionCategory })
  category: QuestionCategory;

  @ApiProperty({ enum: QuestionDifficulty })
  difficulty: QuestionDifficulty;

  static fromEntity(q: Question): QuestionResponseDto {
    const dto = new QuestionResponseDto();

    dto.id = q.id;
    dto.content = q.content;
    dto.options = q.options;
    dto.category = q.category;
    dto.difficulty = q.difficulty;

    return dto;
  }
}
