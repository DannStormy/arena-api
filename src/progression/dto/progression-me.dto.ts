import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LevelProgressionDto {
  @ApiProperty()
  number: number;

  @ApiProperty()
  xp: number;

  @ApiPropertyOptional({ nullable: true })
  xpToNext: number | null;

  @ApiProperty({ type: [Number] })
  milestonesUnlocked: number[];
}

export class RankProgressionDto {
  @ApiProperty()
  tier: string;

  @ApiProperty()
  points: number;

  @ApiPropertyOptional({ nullable: true })
  pointsToNext: number | null;

  @ApiProperty()
  demotionShielded: boolean;

  @ApiProperty()
  seasonId: string;
}

export class AllTimeProgressionDto {
  @ApiProperty()
  duelPeak: string;

  @ApiProperty()
  tournamentPeak: string;

  @ApiProperty()
  combinedBadge: string;
}

export class ProgressionMeDto {
  @ApiProperty({ type: LevelProgressionDto })
  level: LevelProgressionDto;

  @ApiProperty({ type: RankProgressionDto })
  duelRank: RankProgressionDto;

  @ApiProperty({ type: RankProgressionDto })
  tournamentRank: RankProgressionDto;

  @ApiProperty({ type: AllTimeProgressionDto })
  allTime: AllTimeProgressionDto;
}
