import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { ChallengeMode } from '../../challenges/types/challenge-mode.enum';

export class MatchmakeAsyncDuelDto {
  @ApiProperty({ enum: ChallengeMode, default: ChallengeMode.SPEED_MATH })
  @IsEnum(ChallengeMode)
  mode: ChallengeMode = ChallengeMode.SPEED_MATH;

  @ApiProperty({ default: 3, minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  difficulty = 3;
}
