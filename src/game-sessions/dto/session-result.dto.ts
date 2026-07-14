import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SessionStatus } from '../types/session-status.enum';
import { ProgressionSnapshot } from '../../duels/duel-progression';

export class SessionResultDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true, description: 'null for solo sessions' })
  tournamentId: string | null;

  @ApiProperty()
  score: number;

  @ApiProperty()
  correctAnswers: number;

  @ApiProperty()
  totalAnswered: number;

  @ApiProperty({ enum: SessionStatus })
  status: SessionStatus;

  @ApiProperty()
  isFlagged: boolean;

  @ApiProperty()
  startedAt: Date;

  @ApiProperty()
  completedAt: Date;

  @ApiPropertyOptional()
  myProgression: ProgressionSnapshot | null;
}
