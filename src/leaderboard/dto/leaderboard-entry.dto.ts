import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LeaderboardEntryDto {
  @ApiProperty()
  rank: number;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  username: string;

  @ApiPropertyOptional()
  avatarUrl: string;

  @ApiProperty()
  totalScore: number;

  @ApiProperty()
  totalPrizeWon: string;

  @ApiProperty()
  tournamentsPlayed: number;
}
