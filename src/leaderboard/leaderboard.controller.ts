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
import { PaginatedQueryDto } from '../common/dto/paginated-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

class LeaderboardQueryDto {
  @ApiPropertyOptional({ enum: TournamentArena })
  @IsOptional()
  @IsEnum(TournamentArena)
  arena?: TournamentArena;
}

class DuelLeaderboardQueryDto extends PaginatedQueryDto {
  @ApiPropertyOptional({ enum: TournamentArena, description: 'Accepted but ignored — duel rank is a global per-season ledger' })
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
  @ApiOperation({
    summary: 'Duel-rank leaderboard ranked by seasonal rank points (progression_projections). ' +
      'Arena filter accepted but ignored — duel rank is global per season. ' +
      "Requesting user's own row is appended to `data` if outside the current page.",
  })
  @ApiQuery({ name: 'arena', enum: TournamentArena, required: false })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  async getDuelLeaderboard(
    @CurrentUser() user: JwtPayload,
    @Query() query: DuelLeaderboardQueryDto,
  ): Promise<PaginatedResponseDto<DuelLeaderboardEntryDto>> {
    return this.leaderboardService.getDuelLeaderboard(user.sub, query, query.arena);
  }
}
