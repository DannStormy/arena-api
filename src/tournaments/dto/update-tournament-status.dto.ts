import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TournamentStatus } from '../types/tournament-status.enum';

const ALLOWED_TARGET_STATUSES = [
  TournamentStatus.OPEN,
  TournamentStatus.IN_PROGRESS,
  TournamentStatus.COMPLETED,
  TournamentStatus.CANCELLED,
] as const;

export type AllowedTargetStatus = (typeof ALLOWED_TARGET_STATUSES)[number];

export class UpdateTournamentStatusDto {
  @ApiProperty({ enum: ALLOWED_TARGET_STATUSES })
  @IsEnum(ALLOWED_TARGET_STATUSES)
  status: AllowedTargetStatus;
}
