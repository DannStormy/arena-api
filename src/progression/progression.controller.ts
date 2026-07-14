import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProgressionProjection } from './entities/progression-projection.entity';
import { ProgressionConfigService } from './services/progression-config.service';
import { ProgressionProjectionService } from './services/progression-projection.service';
import { ProgressionSeasonService } from './services/progression-season.service';
import { ProgressionSeedService } from './services/progression-seed.service';
import { ProgressionMeDto } from './dto/progression-me.dto';
import { ProgressionLeaderboardEntryDto } from './dto/progression-leaderboard-entry.dto';
import { ProgressionConfigVersionResponseDto } from './dto/progression-config-version-response.dto';
import { CreateProgressionConfigDto } from './dto/create-progression-config.dto';
import { PaginatedQueryDto } from '../common/dto/paginated-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { Ledger } from './types/ledger.enum';
import { isHigherRank, RankTier } from '../common/rank-tiers';
import { rankFromSeasonPoints } from '../common/rank-tiers';
import { currentSeasonId } from '../duels/duel-progression';
import type { ProgressionConfigValues } from './types/progression-config.types';

class LeaderboardQueryDto extends PaginatedQueryDto {
  @ApiPropertyOptional({ enum: Ledger, default: Ledger.DUEL_RANK })
  @IsOptional()
  @IsEnum(Ledger)
  ledger?: Ledger;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seasonId?: string;
}

class SeasonResetBodyDto {
  @ApiPropertyOptional()
  fromSeason: string;

  @ApiPropertyOptional()
  toSeason: string;
}

class EffectiveAtQueryDto {
  @ApiPropertyOptional({ description: 'ISO 8601 timestamp to preview config at' })
  @IsOptional()
  @IsDateString()
  at?: string;
}

@ApiTags('Progression')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('progression')
export class ProgressionController {
  constructor(
    @InjectRepository(ProgressionProjection)
    private readonly projectionRepo: Repository<ProgressionProjection>,
    private readonly configService: ProgressionConfigService,
    private readonly projectionService: ProgressionProjectionService,
    private readonly seasonService: ProgressionSeasonService,
    private readonly seedService: ProgressionSeedService,
  ) {}

  // ── Public / player endpoints ──────────────────────────────────────────────
  // NOTE: @Get(':userId') is a single-segment wildcard — it will NOT shadow
  // multi-segment routes like 'admin/config'. All specific routes are still
  // declared first to be explicit about priority within single-segment routes.

  @Get('me')
  @ApiOperation({ summary: "Current user's full progression state" })
  @ApiResponse({ status: 200, type: ProgressionMeDto })
  async getMyProgression(@CurrentUser() user: JwtPayload): Promise<ProgressionMeDto> {
    return this.buildProgressionDto(user.sub);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Season rank leaderboard (duel_rank or tournament_rank)' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  async getLeaderboard(
    @Query() query: LeaderboardQueryDto,
  ): Promise<PaginatedResponseDto<ProgressionLeaderboardEntryDto>> {
    const ledger = query.ledger ?? Ledger.DUEL_RANK;
    const seasonId = query.seasonId ?? currentSeasonId();

    const [rows, total] = await Promise.all([
      this.projectionRepo
        .createQueryBuilder('p')
        .innerJoin('users', 'u', 'u.id = p.userId')
        .select([
          'p.userId AS "userId"',
          'p.total AS "points"',
          'p.tier AS "tier"',
          'u.username AS "username"',
          'u."avatarUrl" AS "avatarUrl"',
        ])
        .where('p.ledger = :ledger AND p.seasonId = :seasonId', { ledger, seasonId })
        .orderBy('p.total', 'DESC')
        .offset((query.page - 1) * query.limit)
        .limit(query.limit)
        .getRawMany<{
          userId: string;
          points: string;
          tier: string;
          username: string;
          avatarUrl: string | null;
        }>(),
      this.projectionRepo.count({ where: { ledger, seasonId } }),
    ]);

    const data: ProgressionLeaderboardEntryDto[] = rows.map((row, idx) => ({
      rank: (query.page - 1) * query.limit + idx + 1,
      userId: row.userId,
      username: row.username,
      avatarUrl: row.avatarUrl,
      points: Number(row.points),
      tier: row.tier ?? 'Spectator',
    }));

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  // ── Admin: config CRUD ─────────────────────────────────────────────────────

  @Get('admin/config')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '(Admin) Get the currently-effective progression config' })
  @ApiResponse({ status: 200, type: ProgressionConfigVersionResponseDto })
  async getCurrentConfig(): Promise<ProgressionConfigVersionResponseDto> {
    const version = await this.configService.getEffectiveVersion();
    if (!version) {
      throw new BadRequestException('No config version found — run seed first');
    }
    return ProgressionConfigVersionResponseDto.fromEntity(version);
  }

  @Get('admin/config/effective')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '(Admin) Preview which config is effective at a given timestamp' })
  @ApiResponse({ status: 200, type: ProgressionConfigVersionResponseDto })
  async getConfigEffectiveAt(
    @Query() query: EffectiveAtQueryDto,
  ): Promise<ProgressionConfigVersionResponseDto> {
    const at = query.at ? new Date(query.at) : undefined;
    const version = await this.configService.getEffectiveVersion(at);
    if (!version) {
      throw new BadRequestException('No config version found effective at that time');
    }
    return ProgressionConfigVersionResponseDto.fromEntity(version);
  }

  @Get('admin/config/versions')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '(Admin) Paginated audit history of progression config versions' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  async listConfigVersions(
    @Query() query: PaginatedQueryDto,
  ): Promise<PaginatedResponseDto<ProgressionConfigVersionResponseDto>> {
    return this.configService.listVersionsPaginated(query);
  }

  @Post('admin/config')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '(Admin) Create a new effective-dated progression config version' })
  @ApiBody({ type: CreateProgressionConfigDto })
  @ApiResponse({ status: 201, type: ProgressionConfigVersionResponseDto })
  async createConfig(
    @CurrentUser() admin: JwtPayload,
    @Body() dto: CreateProgressionConfigDto,
  ): Promise<ProgressionConfigVersionResponseDto> {
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    const version = await this.configService.createVersion(
      dto.values as unknown as ProgressionConfigValues,
      admin.sub,
      dto.notes,
      effectiveFrom,
    );
    return ProgressionConfigVersionResponseDto.fromEntity(version);
  }

  // ── Admin: operational ─────────────────────────────────────────────────────

  @Post('admin/seed')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '(Admin) Bootstrap seed events from existing User XP/SP data' })
  async seed(): Promise<{ seeded: number; skipped: number }> {
    return this.seedService.runSeed();
  }

  @Post('admin/season/reset')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '(Admin) Run monthly season reset (idempotent)' })
  @ApiBody({ type: SeasonResetBodyDto })
  async seasonReset(
    @Body() dto: SeasonResetBodyDto,
  ): Promise<{ usersReset: number }> {
    const from = dto.fromSeason ?? this.previousMonthLabel();
    const to = dto.toSeason ?? currentSeasonId();
    return this.seasonService.runMonthlyReset(from, to);
  }

  @Post('admin/rebuild/:userId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '(Admin) Rebuild all projections for a user from event log' })
  async rebuildUser(@Param('userId') userId: string): Promise<{ ok: true }> {
    const { values: cfg } = await this.configService.getEffective();
    await this.projectionService.rebuildForUser(userId, cfg);
    return { ok: true };
  }

  // ── Public: user profile (single-segment wildcard — declared last) ─────────

  @Get(':userId')
  @ApiOperation({ summary: "Public view of a user's progression" })
  @ApiResponse({ status: 200, type: ProgressionMeDto })
  async getUserProgression(@Param('userId') userId: string): Promise<ProgressionMeDto> {
    return this.buildProgressionDto(userId);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async buildProgressionDto(userId: string): Promise<ProgressionMeDto> {
    const { values: cfg } = await this.configService.getEffective();
    const seasonId = currentSeasonId();

    const [levelProj, duelRankProj, tournamentRankProj] = await Promise.all([
      this.projectionService.getOrInit(userId, Ledger.LEVEL, null),
      this.projectionService.getOrInit(userId, Ledger.DUEL_RANK, seasonId),
      this.projectionService.getOrInit(userId, Ledger.TOURNAMENT_RANK, seasonId),
    ]);

    const levelDto = this.projectionService.buildLevelDto(levelProj, cfg);
    const duelRankDto = this.projectionService.buildRankDto(duelRankProj, seasonId);
    const tournamentRankDto = this.projectionService.buildRankDto(tournamentRankProj, seasonId);

    const [duelPeakProj, tournPeakProj] = await Promise.all([
      this.projectionRepo
        .createQueryBuilder('p')
        .where('p.userId = :userId AND p.ledger = :ledger', { userId, ledger: Ledger.DUEL_RANK })
        .orderBy(
          `CASE p."allTimePeakTier"
            WHEN 'Legend' THEN 5 WHEN 'Champion' THEN 4
            WHEN 'Gladiator' THEN 3 WHEN 'Challenger' THEN 2
            ELSE 1 END`,
          'DESC',
        )
        .getOne(),
      this.projectionRepo
        .createQueryBuilder('p')
        .where('p.userId = :userId AND p.ledger = :ledger', { userId, ledger: Ledger.TOURNAMENT_RANK })
        .orderBy(
          `CASE p."allTimePeakTier"
            WHEN 'Legend' THEN 5 WHEN 'Champion' THEN 4
            WHEN 'Gladiator' THEN 3 WHEN 'Challenger' THEN 2
            ELSE 1 END`,
          'DESC',
        )
        .getOne(),
    ]);

    const duelPeak = duelPeakProj?.allTimePeakTier ?? 'Spectator';
    const tournPeak = tournPeakProj?.allTimePeakTier ?? 'Spectator';
    const combinedBadge = isHigherRank(duelPeak as RankTier, tournPeak as RankTier)
      ? duelPeak
      : tournPeak;

    return {
      level: {
        number: levelDto.number,
        xp: levelDto.xp,
        intoLevel: levelDto.intoLevel,
        xpToNext: levelDto.xpToNext,
        milestonesUnlocked: levelDto.milestonesUnlocked,
      },
      duelRank: duelRankDto,
      tournamentRank: tournamentRankDto,
      allTime: { duelPeak, tournamentPeak: tournPeak, combinedBadge },
    };
  }

  private previousMonthLabel(): string {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}
