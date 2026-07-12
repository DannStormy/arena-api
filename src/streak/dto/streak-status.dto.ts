import { ApiProperty } from '@nestjs/swagger';

export class StreakStatusDto {
  @ApiProperty({ description: 'Consecutive days played (0 if broken)' })
  currentDailyStreak: number;

  @ApiProperty({ description: 'Best daily streak ever reached' })
  longestDailyStreak: number;

  @ApiProperty({ nullable: true, description: 'UTC date of last play (YYYY-MM-DD)' })
  lastPlayedOn: string | null;

  @ApiProperty({ description: 'Whether the user has already played today' })
  playedToday: boolean;

  @ApiProperty({ description: 'Last play was yesterday and not yet today — nudge them back' })
  atRisk: boolean;
}
