import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNegative,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SeasonResetPointsDto {
  @ApiProperty({ default: 4000 })
  @IsInt()
  @Min(0)
  Legend: number;

  @ApiProperty({ default: 1500 })
  @IsInt()
  @Min(0)
  Champion: number;

  @ApiProperty({ default: 500 })
  @IsInt()
  @Min(0)
  Gladiator: number;

  @ApiProperty({ default: 0 })
  @IsInt()
  @Min(0)
  Challenger: number;

  @ApiProperty({ default: 0 })
  @IsInt()
  @Min(0)
  Spectator: number;
}

export class ProgressionConfigValuesDto {
  // ── Level XP (never negative) ──────────────────────────────────────────────
  @ApiProperty({ default: 300 })
  @IsNumber()
  @IsPositive()
  levelBase: number;

  @ApiProperty({ default: 1.05 })
  @IsNumber()
  @Min(1)
  levelGrowth: number;

  @ApiProperty({ default: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  maxLevel: number;

  @ApiProperty({ default: 50 })
  @IsNumber()
  @Min(0)
  firstDuelOfDayBonusXp: number;

  @ApiProperty({ default: 60 })
  @IsNumber()
  @Min(0)
  xpWin: number;

  @ApiProperty({ default: 30 })
  @IsNumber()
  @Min(0)
  xpForfeitWin: number;

  @ApiProperty({ default: 40 })
  @IsNumber()
  @Min(0)
  xpDraw: number;

  @ApiProperty({ default: 25 })
  @IsNumber()
  @Min(0)
  xpLoss: number;

  @ApiProperty({ default: 5 })
  @IsNumber()
  @Min(0)
  xpForfeitLoss: number;

  @ApiProperty({ default: 5 })
  @IsNumber()
  @Min(0)
  xpStreakBonusPerWin: number;

  @ApiProperty({ default: 25 })
  @IsNumber()
  @Min(0)
  xpStreakBonusCap: number;

  // ── Tournament XP ──────────────────────────────────────────────────────────
  @ApiProperty({ default: 20 })
  @IsNumber()
  @Min(0)
  tournamentXpCompletion: number;

  @ApiProperty({ default: 5 })
  @IsNumber()
  @Min(0)
  tournamentXpPerCorrect: number;

  @ApiProperty({ default: 30 })
  @IsNumber()
  @Min(0)
  tournamentXpAccuracyBonus: number;

  @ApiProperty({ default: 0.8 })
  @IsNumber()
  @Min(0)
  @Max(1)
  tournamentXpAccuracyThreshold: number;

  // ── Duel Rank — wins positive, losses negative ─────────────────────────────
  @ApiProperty({ default: 40 })
  @IsNumber()
  @IsPositive()
  duelRankWinFree: number;

  @ApiProperty({ default: 60 })
  @IsNumber()
  @IsPositive()
  duelRankWinStaked: number;

  @ApiProperty({ default: 20 })
  @IsNumber()
  @IsPositive()
  duelRankForfeitWinFree: number;

  @ApiProperty({ default: 30 })
  @IsNumber()
  @IsPositive()
  duelRankForfeitWinStaked: number;

  @ApiProperty({ default: 10 })
  @IsNumber()
  @Min(0)
  duelRankDrawFree: number;

  @ApiProperty({ default: 15 })
  @IsNumber()
  @Min(0)
  duelRankDrawStaked: number;

  @ApiProperty({ default: -20, description: 'Must be negative' })
  @IsNumber()
  @IsNegative()
  duelRankLossFree: number;

  @ApiProperty({ default: -30, description: 'Must be negative' })
  @IsNumber()
  @IsNegative()
  duelRankLossStaked: number;

  @ApiProperty({ default: -10, description: 'Must be ≤ 0' })
  @IsNumber()
  @Max(0)
  duelRankForfeitLossFree: number;

  @ApiProperty({ default: -15, description: 'Must be ≤ 0' })
  @IsNumber()
  @Max(0)
  duelRankForfeitLossStaked: number;

  @ApiProperty({ default: 5 })
  @IsNumber()
  @Min(0)
  duelRankStreakBonusPerWin: number;

  @ApiProperty({ default: 25 })
  @IsNumber()
  @Min(0)
  duelRankStreakBonusCap: number;

  @ApiProperty({ default: 15 })
  @IsInt()
  @Min(0)
  duelRankFreeSoftCapWins: number;

  // ── Demotion shield ────────────────────────────────────────────────────────
  @ApiProperty({ default: 100, description: 'Buffer pts before tier drop; must be < smallest tier gap (500)' })
  @IsNumber()
  @Min(0)
  demotionShieldBuffer: number;

  // ── Tournament Rank ────────────────────────────────────────────────────────
  @ApiProperty({ default: 200 })
  @IsNumber()
  @IsPositive()
  tournamentRankTopAward: number;

  @ApiProperty({ default: 1.5, description: 'Decay exponent k; topAward × (1−percentile)^k' })
  @IsNumber()
  @IsPositive()
  tournamentRankDecayK: number;

  @ApiProperty({ default: 10 })
  @IsNumber()
  @Min(0)
  tournamentRankParticipationFloor: number;

  // ── Season reset map ───────────────────────────────────────────────────────
  @ApiProperty({ type: SeasonResetPointsDto })
  @ValidateNested()
  @Type(() => SeasonResetPointsDto)
  seasonResetPoints: SeasonResetPointsDto;

  // ── Milestone levels ───────────────────────────────────────────────────────
  @ApiProperty({ type: [Number], default: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] })
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(100, { each: true })
  levelMilestones: number[];
}

export class CreateProgressionConfigDto {
  @ApiProperty({ type: ProgressionConfigValuesDto })
  @ValidateNested()
  @Type(() => ProgressionConfigValuesDto)
  values: ProgressionConfigValuesDto;

  @ApiPropertyOptional({
    description: 'ISO 8601 timestamp when this config takes effect (defaults to now)',
  })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ description: 'Human-readable reason for this change' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
