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
  seasonPoints: number;

  @ApiProperty()
  rankTier: string;

  @ApiProperty()
  isRequestingUser: boolean;
}
