import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ChallengeMode } from '../types/challenge-mode.enum';

export class PracticeSetDto {
  @ApiPropertyOptional({ enum: ChallengeMode, default: ChallengeMode.SPEED_MATH })
  @IsOptional()
  @IsEnum(ChallengeMode)
  mode: ChallengeMode = ChallengeMode.SPEED_MATH;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  count = 10;

  @ApiPropertyOptional({ default: 3, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  difficulty = 3;
}
