import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TournamentArena } from '../types/tournament-arena.enum';
import { TournamentStatus } from '../types/tournament-status.enum';
import { GameType } from '../../game-sessions/types/game-type.enum';

interface RawHistoryRow {
  tournamentId: string;
  name: string;
  arena: TournamentArena;
  gameType: GameType;
  tournamentStatus: TournamentStatus;
  score: string | number;
  rank: string | number;
  totalPlayers: string | number;
  prizeWon: string | null;
  playedAt: Date;
  completedAt: Date | null;
}

export class TournamentHistoryItemDto {
  @ApiProperty()
  tournamentId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: TournamentArena })
  arena: TournamentArena;

  @ApiProperty({ enum: GameType })
  gameType: GameType;

  @ApiProperty({ enum: TournamentStatus })
  tournamentStatus: TournamentStatus;

  @ApiProperty()
  score: number;

  @ApiProperty()
  rank: number;

  @ApiProperty({ description: 'True only when the tournament is completed and rank is settled' })
  rankIsFinal: boolean;

  @ApiProperty()
  totalPlayers: number;

  @ApiPropertyOptional()
  prizeWon: string | null;

  @ApiProperty()
  playedAt: Date;

  @ApiPropertyOptional()
  completedAt: Date | null;

  static fromRaw(row: RawHistoryRow): TournamentHistoryItemDto {
    const dto = new TournamentHistoryItemDto();

    dto.tournamentId = row.tournamentId;
    dto.name = row.name;
    dto.arena = row.arena;
    dto.gameType = row.gameType;
    dto.tournamentStatus = row.tournamentStatus;
    dto.score = Number(row.score);
    dto.rank = Number(row.rank);
    dto.rankIsFinal = row.tournamentStatus === TournamentStatus.COMPLETED;
    dto.totalPlayers = Number(row.totalPlayers);
    dto.prizeWon = row.prizeWon ?? null;
    dto.playedAt = row.playedAt;
    dto.completedAt = row.completedAt ?? null;

    return dto;
  }
}
