import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DuelLeaderboardEntryDto {
  @ApiProperty()
  rank: number;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  avatarInitials: string;

  @ApiPropertyOptional()
  avatarUrl: string | null;

  @ApiProperty()
  rankPoints: number;

  @ApiProperty()
  tier: string;

  @ApiProperty()
  gamesPlayed: number;

  @ApiProperty()
  isRequestingUser: boolean;
}
