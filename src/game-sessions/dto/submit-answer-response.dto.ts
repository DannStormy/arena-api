import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProgressionSnapshot } from '../../duels/duel-progression';

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

  @ApiPropertyOptional({ description: 'Progression snapshot — only present when completed is true' })
  myProgression?: ProgressionSnapshot | null;
}
