import { ApiProperty } from '@nestjs/swagger';
import { ChallengeMode } from '../types/challenge-mode.enum';
import { Challenge } from '../types/challenge.interface';

export class ChallengeSetResponseDto {
  @ApiProperty({ description: 'Seed that reproduces this set; echo it back when validating' })
  matchSeed: string;

  @ApiProperty({ enum: ChallengeMode })
  mode: ChallengeMode;

  @ApiProperty()
  difficulty: number;

  @ApiProperty({ isArray: true, description: 'Client-safe challenges (no answers)' })
  challenges: Challenge[];
}
