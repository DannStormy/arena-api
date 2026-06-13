import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Duel } from '../entities/duel.entity';
import { DuelMode } from '../types/duel-mode.enum';
import { DuelStatus } from '../types/duel-status.enum';
import { TournamentArena } from '../../tournaments/types/tournament-arena.enum';
import { QuestionSummaryItem } from '../duels.service';
import { ProgressionSnapshot } from '../duel-progression';

export class DuelResponseDto {
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
  totalQuestions: number;

  @ApiProperty()
  currentQuestionIndex: number;

  @ApiProperty()
  challengerId: string;

  @ApiPropertyOptional()
  opponentId: string | null;

  @ApiProperty()
  challengerScore: number;

  @ApiProperty()
  opponentScore: number;

  @ApiProperty()
  challengerStreak: number;

  @ApiProperty()
  opponentStreak: number;

  @ApiProperty()
  challengerMaxStreak: number;

  @ApiProperty()
  opponentMaxStreak: number;

  @ApiPropertyOptional()
  winnerId: string | null;

  @ApiPropertyOptional()
  resolution: 'score' | 'speed_tiebreak' | 'sudden_death' | 'forfeit' | 'draw' | null;

  @ApiPropertyOptional()
  tiebreakDeltaMs: number | null;

  @ApiPropertyOptional()
  challengerXpAwarded: number | null;

  @ApiPropertyOptional()
  challengerSpAwarded: number | null;

  @ApiPropertyOptional()
  opponentXpAwarded: number | null;

  @ApiPropertyOptional()
  opponentSpAwarded: number | null;

  @ApiProperty()
  isTie: boolean;

  @ApiProperty()
  suddenDeathRound: number;

  @ApiPropertyOptional()
  expiresAt: Date | null;

  @ApiPropertyOptional()
  startedAt: Date | null;

  @ApiPropertyOptional()
  completedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  challengerUsername: string;

  @ApiPropertyOptional()
  opponentUsername: string | null;

  @ApiPropertyOptional()
  shareUrl: string | null;

  @ApiProperty()
  challengerCorrect: number;

  @ApiProperty()
  opponentCorrect: number;

  @ApiProperty()
  questionSummary: QuestionSummaryItem[];

  @ApiPropertyOptional()
  myProgression: ProgressionSnapshot | null;

  static fromEntity(
    duel: Duel,
    opts: {
      shareUrl?: string;
      challengerUsername?: string;
      opponentUsername?: string | null;
      challengerCorrect?: number;
      opponentCorrect?: number;
      questionSummary?: QuestionSummaryItem[];
      requestingUserId?: string;
    } = {},
  ): DuelResponseDto {
    const dto = new DuelResponseDto();

    dto.id = duel.id;
    dto.code = duel.code;
    dto.mode = duel.mode;
    dto.arena = duel.arena;
    dto.stake = duel.stake;
    dto.status = duel.status;
    dto.totalQuestions =
      duel.mode === DuelMode.SUDDEN_DEATH
        ? duel.currentQuestionIndex + 1
        : duel.questionIds.length;
    dto.currentQuestionIndex = duel.currentQuestionIndex;
    dto.challengerId = duel.challengerId;
    dto.opponentId = duel.opponentId;
    dto.challengerScore = duel.challengerScore;
    dto.opponentScore = duel.opponentScore;
    dto.challengerStreak = duel.challengerStreak;
    dto.opponentStreak = duel.opponentStreak;
    dto.challengerMaxStreak = duel.challengerMaxStreak;
    dto.opponentMaxStreak = duel.opponentMaxStreak;
    dto.winnerId = duel.winnerId;
    dto.resolution = duel.resolution;
    dto.tiebreakDeltaMs = duel.tiebreakDeltaMs;
    dto.challengerXpAwarded = duel.challengerXpAwarded;
    dto.challengerSpAwarded = duel.challengerSpAwarded;
    dto.opponentXpAwarded = duel.opponentXpAwarded;
    dto.opponentSpAwarded = duel.opponentSpAwarded;
    dto.isTie = duel.isTie;
    dto.suddenDeathRound = duel.suddenDeathRound;
    dto.expiresAt = duel.expiresAt;
    dto.startedAt = duel.startedAt;
    dto.completedAt = duel.completedAt;
    dto.createdAt = duel.createdAt;
    dto.challengerUsername = opts.challengerUsername ?? '';
    dto.opponentUsername = opts.opponentUsername ?? null;
    dto.shareUrl = opts.shareUrl ?? null;
    dto.challengerCorrect = opts.challengerCorrect ?? 0;
    dto.opponentCorrect = opts.opponentCorrect ?? 0;
    dto.questionSummary = opts.questionSummary ?? [];

    if (opts.requestingUserId) {
      if (opts.requestingUserId === duel.challengerId) {
        dto.myProgression = duel.challengerProgression ?? null;
      } else if (opts.requestingUserId === duel.opponentId) {
        dto.myProgression = duel.opponentProgression ?? null;
      } else {
        dto.myProgression = null;
      }
    } else {
      dto.myProgression = null;
    }

    return dto;
  }
}
