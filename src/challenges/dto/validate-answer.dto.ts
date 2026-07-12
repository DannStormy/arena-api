import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEnum, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { ChallengeMode } from '../types/challenge-mode.enum';

export class ValidateAnswerDto {
  @ApiProperty({ description: 'The matchSeed returned with the challenge set' })
  @IsString()
  @IsNotEmpty()
  matchSeed: string;

  @ApiProperty({ enum: ChallengeMode })
  @IsEnum(ChallengeMode)
  mode: ChallengeMode;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  difficulty: number;

  @ApiProperty({ description: 'Zero-based index of the challenge in the set' })
  @IsInt()
  @Min(0)
  index: number;

  @ApiProperty({ description: 'The submitted answer (number or text)' })
  @IsDefined()
  answer: number | string;

  @ApiProperty({ description: 'Milliseconds taken to answer (for the speed bonus)' })
  @IsInt()
  @Min(0)
  elapsedMs: number;
}
