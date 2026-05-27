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
  totalPrizeWon: string;

  @ApiProperty()
  tournamentsPlayed: number;
}
