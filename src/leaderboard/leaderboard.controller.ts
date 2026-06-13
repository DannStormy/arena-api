import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { LeaderboardEntryDto } from './dto/leaderboard-entry.dto';
import { DuelLeaderboardEntryDto } from './dto/duel-leaderboard-entry.dto';
import { TournamentArena } from '../tournaments/types/tournament-arena.enum';
import { ApiPropertyOptional } from '@nestjs/swagger';

class LeaderboardQueryDto {
  @ApiPropertyOptional({ enum: TournamentArena })
  @IsOptional()
  @IsEnum(TournamentArena)
  arena?: TournamentArena;
}

@ApiTags('Leaderboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  @ApiOperation({ summary: 'Global top 50 leaderboard by total prize won' })
  @ApiQuery({ name: 'arena', enum: TournamentArena, required: false })
  @ApiResponse({ status: 200, type: [LeaderboardEntryDto] })
  async getLeaderboard(@Query() query: LeaderboardQueryDto): Promise<LeaderboardEntryDto[]> {
    return this.leaderboardService.getGlobalLeaderboard(query.arena);
  }

  @Get('duels')
  @ApiOperation({ summary: 'Duel leaderboard ranked by season points; arena filter for monthly per-arena SP' })
  @ApiQuery({ name: 'arena', enum: TournamentArena, required: false })
  @ApiResponse({ status: 200, type: [DuelLeaderboardEntryDto] })
  async getDuelLeaderboard(
    @CurrentUser() user: JwtPayload,
    @Query() query: LeaderboardQueryDto,
  ): Promise<DuelLeaderboardEntryDto[]> {
    return this.leaderboardService.getDuelLeaderboard(user.sub, query.arena);
  }
}
