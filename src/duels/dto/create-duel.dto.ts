import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { DuelMode } from '../types/duel-mode.enum';
import { TournamentArena } from '../../tournaments/types/tournament-arena.enum';

export class CreateDuelDto {
  @ApiProperty({ enum: DuelMode })
  @IsEnum(DuelMode)
  mode: DuelMode;

  @ApiProperty({ enum: TournamentArena })
  @IsEnum(TournamentArena)
  arena: TournamentArena;
}
