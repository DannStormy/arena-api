import { ApiProperty } from '@nestjs/swagger';
import { GameType } from '../types/game-type.enum';
import { SessionStatus } from '../types/session-status.enum';

export class StartSessionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tournamentId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: GameType })
  gameType: GameType;

  @ApiProperty({ enum: SessionStatus })
  status: SessionStatus;

  @ApiProperty()
  totalQuestions: number;

  @ApiProperty()
  startedAt: Date;
}
