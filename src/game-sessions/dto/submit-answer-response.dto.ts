import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitAnswerResponseDto {
  @ApiProperty()
  isCorrect: boolean;

  @ApiProperty()
  correctAnswer: number;

  @ApiProperty()
  score: number;

  @ApiProperty()
  totalAnswered: number;

  @ApiProperty()
  isFlagged: boolean;

  @ApiProperty({ description: 'True when this answer completed the session' })
  completed: boolean;

  @ApiPropertyOptional({ description: 'Final score — only present when completed is true' })
  finalScore?: number;
}
