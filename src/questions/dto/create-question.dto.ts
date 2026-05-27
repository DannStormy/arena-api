import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { QuestionCategory } from '../types/question-category.enum';
import { QuestionDifficulty } from '../types/question-difficulty.enum';

export class CreateQuestionDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  content: string;

  @ApiProperty({ type: [String], minItems: 4, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  options: string[];

  @ApiProperty({ minimum: 0, maximum: 3 })
  @IsInt()
  @Min(0)
  @Max(3)
  correctAnswer: number;

  @ApiProperty({ enum: QuestionCategory })
  @IsEnum(QuestionCategory)
  category: QuestionCategory;

  @ApiProperty({ enum: QuestionDifficulty })
  @IsEnum(QuestionDifficulty)
  difficulty: QuestionDifficulty;
}
