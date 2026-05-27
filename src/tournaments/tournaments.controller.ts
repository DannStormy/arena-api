import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { TournamentsService } from './tournaments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { TournamentResponseDto } from './dto/tournament-response.dto';
import { TournamentListItemDto } from './dto/tournament-list-item.dto';
import { TournamentArena } from './types/tournament-arena.enum';
import { TournamentStatus } from './types/tournament-status.enum';
import { GameType } from '../game-sessions/types/game-type.enum';
import { PaginatedQueryDto } from '../common/dto/paginated-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { LeaderboardEntryDto } from '../leaderboard/dto/leaderboard-entry.dto';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UpdateTournamentStatusDto } from './dto/update-tournament-status.dto';

class TournamentQueryDto extends PaginatedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: TournamentArena })
  @IsOptional()
  @IsEnum(TournamentArena)
  arena?: TournamentArena;

  @ApiPropertyOptional({ enum: TournamentStatus })
  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @ApiPropertyOptional({ enum: GameType })
  @IsOptional()
  @IsEnum(GameType)
  gameType?: GameType;
}

@ApiTags('Tournaments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get()
  @ApiOperation({ summary: 'List tournaments (paginated, filterable)' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  async list(
    @Query() query: TournamentQueryDto,
  ): Promise<PaginatedResponseDto<TournamentListItemDto>> {
    return this.tournamentsService.list({
      page: query.page,
      limit: query.limit,
      order: query.order,
      search: query.search,
      arena: query.arena,
      status: query.status,
      gameType: query.gameType,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single tournament by ID' })
  @ApiResponse({ status: 200, type: TournamentResponseDto })
  @ApiResponse({ status: 404, description: 'Tournament not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TournamentResponseDto> {
    return this.tournamentsService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new tournament (admin only)' })
  @ApiBody({ type: CreateTournamentDto })
  @ApiResponse({ status: 201, type: TournamentResponseDto })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTournamentDto,
  ): Promise<TournamentResponseDto> {
    return this.tournamentsService.create(user.sub, dto);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a tournament' })
  @ApiResponse({ status: 200, schema: { example: { success: true, entryId: 'uuid' } } })
  @ApiResponse({ status: 400, description: 'Already registered or tournament not open' })
  async join(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: true; entryId: string }> {
    return this.tournamentsService.joinTournament(id, user.sub);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Update tournament status (admin only)' })
  @ApiBody({ type: UpdateTournamentStatusDto })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Tournament not found' })
  @ApiResponse({ status: 422, description: 'Invalid status transition' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTournamentStatusDto,
  ): Promise<{ success: true }> {
    return this.tournamentsService.updateStatus(id, dto.status);
  }

  @Get(':id/leaderboard')
  @ApiOperation({ summary: 'Get tournament leaderboard' })
  @ApiResponse({ status: 200, type: [LeaderboardEntryDto] })
  async leaderboard(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeaderboardEntryDto[]> {
    return this.tournamentsService.getTournamentLeaderboard(id);
  }
}
