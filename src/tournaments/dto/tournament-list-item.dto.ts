import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Tournament } from '../entities/tournament.entity';
import { TournamentArena } from '../types/tournament-arena.enum';
import { TournamentStatus } from '../types/tournament-status.enum';
import { GameType } from '../../game-sessions/types/game-type.enum';

export class TournamentListItemDto {
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

  @ApiProperty()
  minPlayers: number;

  @ApiPropertyOptional()
  maxPlayers: number;

  @ApiProperty({ enum: TournamentStatus })
  status: TournamentStatus;

  @ApiPropertyOptional()
  scheduledAt: Date;

  @ApiProperty()
  isFunded: boolean;

  @ApiProperty()
  entryCount: number;

  @ApiProperty()
  hasJoined: boolean;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(t: Tournament, entryCount = 0, hasJoined = false): TournamentListItemDto {
    const dto = new TournamentListItemDto();

    dto.id = t.id;
    dto.title = t.title;
    dto.arena = t.arena;
    dto.gameType = t.gameType;
    dto.entryFee = t.entryFee;
    dto.prizeFirst = t.prizeFirst;
    dto.minPlayers = t.minPlayers;
    dto.maxPlayers = t.maxPlayers;
    dto.status = t.status;
    dto.scheduledAt = t.scheduledAt;
    dto.isFunded = t.isFunded;
    dto.entryCount = entryCount;
    dto.hasJoined = hasJoined;
    dto.createdAt = t.createdAt;

    return dto;
  }
}
