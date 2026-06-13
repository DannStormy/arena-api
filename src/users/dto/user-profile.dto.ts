import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  avatarInitials: string;

  @ApiPropertyOptional()
  avatarUrl: string | null;

  @ApiProperty()
  joinedAt: Date;

  // ── XP / Level ──────────────────────────────────────────────────────────────

  @ApiProperty()
  lifetimeXp: number;

  @ApiProperty()
  level: number;

  @ApiProperty()
  intoLevel: number;

  @ApiPropertyOptional()
  nextLevelAt: number | null;

  // ── Season rank ─────────────────────────────────────────────────────────────

  @ApiProperty()
  seasonPoints: number;

  @ApiProperty()
  seasonRank: string;

  @ApiProperty()
  rankFloor: number;

  @ApiPropertyOptional()
  nextRankAt: number | null;

  @ApiPropertyOptional()
  allTimeHighestRank: string | null;

  // ── Duel record ─────────────────────────────────────────────────────────────

  @ApiProperty()
  wins: number;

  @ApiProperty()
  losses: number;

  @ApiProperty()
  draws: number;

  @ApiProperty()
  totalDuels: number;

  @ApiProperty()
  winRate: number;

  @ApiProperty()
  currentWinStreak: number;

  // ── Answer stats ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional()
  fastestAnswerMs: number | null;

  @ApiProperty()
  avgAccuracy: number;
}
