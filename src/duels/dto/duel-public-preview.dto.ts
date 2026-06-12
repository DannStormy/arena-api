import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Duel } from '../entities/duel.entity';
import { DuelMode } from '../types/duel-mode.enum';
import { DuelStatus } from '../types/duel-status.enum';
import { TournamentArena } from '../../tournaments/types/tournament-arena.enum';

export class DuelPublicPreviewDto {
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
  challengerUsername: string;

  @ApiPropertyOptional()
  expiresAt: string | null;

  @ApiProperty()
  createdAt: string;

  static fromEntity(duel: Duel, challengerUsername: string): DuelPublicPreviewDto {
    const dto = new DuelPublicPreviewDto();

    dto.id = duel.id;
    dto.code = duel.code;
    dto.mode = duel.mode;
    dto.arena = duel.arena;
    dto.stake = duel.stake;
    dto.status = duel.status;
    dto.challengerUsername = challengerUsername;
    dto.expiresAt = duel.expiresAt ? duel.expiresAt.toISOString() : null;
    dto.createdAt = duel.createdAt.toISOString();

    return dto;
  }
}
