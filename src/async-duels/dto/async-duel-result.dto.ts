import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProgressionSnapshot } from '../../duels/duel-progression';
import { DuelResolution } from '../../duels/duel-resolver';
import { AsyncDuel } from '../entities/async-duel.entity';
import { AsyncDuelMatchType } from '../types/async-duel-match-type.enum';
import { AsyncDuelStatus } from '../types/async-duel-status.enum';

class AsyncDuelSideResultDto {
  @ApiProperty()
  userId: string | null;

  @ApiProperty()
  score: number;

  @ApiProperty()
  correct: number;

  @ApiProperty()
  elapsedMs: number;

  @ApiProperty()
  completed: boolean;

  @ApiPropertyOptional({ nullable: true })
  progression: ProgressionSnapshot | null;
}

export class AsyncDuelResultDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty({ enum: AsyncDuelMatchType })
  matchType: AsyncDuelMatchType;

  @ApiProperty({ enum: AsyncDuelStatus })
  status: AsyncDuelStatus;

  @ApiProperty({ nullable: true })
  winnerId: string | null;

  @ApiProperty({ nullable: true })
  resolution: DuelResolution | null;

  @ApiProperty()
  isTie: boolean;

  @ApiProperty({ type: AsyncDuelSideResultDto })
  creator: AsyncDuelSideResultDto;

  @ApiProperty({ type: AsyncDuelSideResultDto })
  opponent: AsyncDuelSideResultDto;

  static fromEntity(d: AsyncDuel): AsyncDuelResultDto {
    return {
      id: d.id,
      code: d.code,
      matchType: d.matchType,
      status: d.status,
      winnerId: d.winnerId,
      resolution: d.resolution,
      isTie: d.isTie,
      creator: {
        userId: d.creatorId,
        score: d.creatorScore,
        correct: d.creatorCorrect,
        elapsedMs: d.creatorElapsedMs,
        completed: d.creatorCompletedAt != null,
        progression: d.creatorProgression,
      },
      opponent: {
        userId: d.opponentId,
        score: d.opponentScore,
        correct: d.opponentCorrect,
        elapsedMs: d.opponentElapsedMs,
        completed: d.opponentCompletedAt != null,
        progression: d.opponentProgression,
      },
    };
  }
}
