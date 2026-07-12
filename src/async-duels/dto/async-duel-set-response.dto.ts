import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChallengeMode } from '../../challenges/types/challenge-mode.enum';
import { Challenge } from '../../challenges/types/challenge.interface';
import { AsyncDuelMatchType } from '../types/async-duel-match-type.enum';

/**
 * The playable set for an async duel. Returned on create, on GET :code, and on
 * matchmake. Never carries answers (Challenge is client-safe) and never leaks
 * the opponent's score until the requester has completed their own run.
 */
export class AsyncDuelSetResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  matchSeed: string;

  @ApiProperty({ enum: ChallengeMode })
  mode: ChallengeMode;

  @ApiProperty()
  difficulty: number;

  @ApiProperty({ enum: AsyncDuelMatchType })
  matchType: AsyncDuelMatchType;

  @ApiProperty({ isArray: true, description: 'Client-safe challenges (no answers)' })
  challenges: Challenge[];

  @ApiPropertyOptional({
    description: "Opponent info; opponent.score is only present once the requester has finished",
    example: { score: null },
  })
  opponent?: { score: number | null } | null;

  @ApiPropertyOptional({ description: 'True once the requesting player has already submitted their run' })
  alreadyCompleted?: boolean;
}
