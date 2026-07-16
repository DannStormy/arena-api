import { ApiProperty } from '@nestjs/swagger';

/** One row of the all-time XP/level board — populated by ALL play (solo Speed
 *  Math / Memory / Daily earn level-XP), so everyone who plays appears here. */
export class LevelLeaderboardEntryDto {
  @ApiProperty()
  rank: number;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  avatarInitials: string;

  @ApiProperty({ nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ description: 'Total lifetime XP (level ledger).' })
  xp: number;

  @ApiProperty()
  level: number;

  @ApiProperty()
  isRequestingUser: boolean;
}
