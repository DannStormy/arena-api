import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Tournament } from '../entities/tournament.entity';
import { TournamentArena } from '../types/tournament-arena.enum';
import { TournamentStatus } from '../types/tournament-status.enum';
import { GameType } from '../../game-sessions/types/game-type.enum';

export class TournamentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: TournamentArena })
  arena: TournamentArena;

  @ApiProperty({ enum: GameType })
  gameType: GameType;

  @ApiProperty()
  entryFee: string;

  @ApiProperty()
  prizeFirst: string;

  @ApiPropertyOptional()
  prizeSecond: string;

  @ApiPropertyOptional()
  prizeThird: string;

  @ApiPropertyOptional()
  maxPlayers: number;

  @ApiProperty()
  minPlayers: number;

  @ApiProperty({ enum: TournamentStatus })
  status: TournamentStatus;

  @ApiPropertyOptional()
  scheduledAt: Date;

  @ApiPropertyOptional()
  startedAt: Date;

  @ApiPropertyOptional()
  completedAt: Date;

  @ApiProperty()
  isFunded: boolean;

  @ApiProperty()
  createdBy: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntity(t: Tournament): TournamentResponseDto {
    const dto = new TournamentResponseDto();

    dto.id = t.id;
    dto.title = t.title;
    dto.arena = t.arena;
    dto.gameType = t.gameType;
    dto.entryFee = t.entryFee;
    dto.prizeFirst = t.prizeFirst;
    dto.prizeSecond = t.prizeSecond;
    dto.prizeThird = t.prizeThird;
    dto.maxPlayers = t.maxPlayers;
    dto.minPlayers = t.minPlayers;
    dto.status = t.status;
    dto.scheduledAt = t.scheduledAt;
    dto.startedAt = t.startedAt;
    dto.completedAt = t.completedAt;
    dto.isFunded = t.isFunded;
    dto.createdBy = t.createdBy;
    dto.createdAt = t.createdAt;
    dto.updatedAt = t.updatedAt;

    return dto;
  }
}
