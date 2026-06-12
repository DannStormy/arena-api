import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Duel } from '../entities/duel.entity';
import { DuelMode } from '../types/duel-mode.enum';
import { DuelStatus } from '../types/duel-status.enum';
import { TournamentArena } from '../../tournaments/types/tournament-arena.enum';

export class DuelListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty({ enum: DuelMode })
  mode: DuelMode;

  @ApiProperty({ enum: TournamentArena })
  arena: TournamentArena;

  @ApiProperty()
  stake: string;

  @ApiProperty({ enum: DuelStatus })
  status: DuelStatus;

  @ApiProperty()
  challengerId: string;

  @ApiProperty()
  challengerUsername: string;

  @ApiPropertyOptional()
  opponentId: string | null;

  @ApiPropertyOptional()
  opponentUsername: string | null;

  @ApiProperty()
  totalQuestions: number;

  @ApiProperty()
  challengerScore: number;

  @ApiProperty()
  opponentScore: number;

  @ApiPropertyOptional()
  winnerId: string | null;

  @ApiProperty()
  isTie: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  completedAt: Date | null;

  static fromEntity(
    duel: Duel,
    opts: { challengerUsername?: string; opponentUsername?: string | null } = {},
  ): DuelListItemDto {
    const dto = new DuelListItemDto();

    dto.id = duel.id;
    dto.code = duel.code;
    dto.mode = duel.mode;
    dto.arena = duel.arena;
    dto.stake = duel.stake;
    dto.status = duel.status;
    dto.challengerId = duel.challengerId;
    dto.challengerUsername = opts.challengerUsername ?? '';
    dto.opponentId = duel.opponentId;
    dto.opponentUsername = opts.opponentUsername ?? null;
    dto.totalQuestions = duel.questionIds.length;
    dto.challengerScore = duel.challengerScore;
    dto.opponentScore = duel.opponentScore;
    dto.winnerId = duel.winnerId;
    dto.isTie = duel.isTie;
    dto.createdAt = duel.createdAt;
    dto.completedAt = duel.completedAt;

    return dto;
  }
}
