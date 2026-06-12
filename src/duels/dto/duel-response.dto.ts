import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Duel } from '../entities/duel.entity';
import { DuelMode } from '../types/duel-mode.enum';
import { DuelStatus } from '../types/duel-status.enum';
import { TournamentArena } from '../../tournaments/types/tournament-arena.enum';
import { QuestionSummaryItem } from '../duels.service';

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

  static fromEntity(
    duel: Duel,
    opts: {
      shareUrl?: string;
      challengerUsername?: string;
      opponentUsername?: string | null;
      challengerCorrect?: number;
      opponentCorrect?: number;
      questionSummary?: QuestionSummaryItem[];
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

    return dto;
  }
}
