import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProgressionLeaderboardEntryDto {
  @ApiProperty()
  rank: number;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  username: string;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;

  @ApiProperty()
  points: number;

  @ApiProperty()
  tier: string;
}
