import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ChallengeMode } from '../../challenges/types/challenge-mode.enum';

export class CreateAsyncDuelDto {
  @ApiProperty({ enum: ChallengeMode, default: ChallengeMode.SPEED_MATH })
  @IsEnum(ChallengeMode)
  mode: ChallengeMode = ChallengeMode.SPEED_MATH;

  @ApiProperty({ default: 3, minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  difficulty = 3;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  count = 10;
}
