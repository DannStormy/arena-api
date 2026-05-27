import { ApiProperty } from '@nestjs/swagger';
import { SessionStatus } from '../types/session-status.enum';

export class SessionResultDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tournamentId: string;

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
}
