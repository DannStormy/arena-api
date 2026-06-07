import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginatedQueryDto } from '../../common/dto/paginated-query.dto';
import { QuestionCategory } from '../../questions/types/question-category.enum';
import { QuestionDifficulty } from '../../questions/types/question-difficulty.enum';

export class AdminQuestionsQueryDto extends PaginatedQueryDto {
  @ApiPropertyOptional({ enum: QuestionCategory })
  @IsOptional()
  @IsEnum(QuestionCategory)
  category?: QuestionCategory;

  @ApiPropertyOptional({ enum: QuestionDifficulty })
  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty;
}
