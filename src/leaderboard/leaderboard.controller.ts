import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LeaderboardEntryDto } from './dto/leaderboard-entry.dto';
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
}
