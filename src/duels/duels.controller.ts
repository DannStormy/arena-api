import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
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
import { DuelsService } from './duels.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { CreateDuelDto } from './dto/create-duel.dto';
import { MatchmakeDuelDto } from './dto/matchmake-duel.dto';
import { DuelResponseDto } from './dto/duel-response.dto';
import { DuelPublicPreviewDto } from './dto/duel-public-preview.dto';
import { DuelListItemDto } from './dto/duel-list-item.dto';
import { PaginatedQueryDto } from '../common/dto/paginated-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { DuelStatus } from './types/duel-status.enum';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

class DuelHistoryQueryDto extends PaginatedQueryDto {
  @ApiPropertyOptional({ enum: DuelStatus })
  @IsOptional()
  @IsEnum(DuelStatus)
  status?: DuelStatus;
}

@ApiTags('Duels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('duels')
export class DuelsController {
  constructor(private readonly duelsService: DuelsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a duel challenge' })
  @ApiBody({ type: CreateDuelDto })
  @ApiResponse({ status: 201, type: DuelResponseDto })
  async createDuel(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDuelDto,
  ): Promise<DuelResponseDto> {
    return this.duelsService.createDuel(user.sub, dto);
  }

  @Post('matchmake')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Find or create a duel via random matchmaking' })
  @ApiBody({ type: MatchmakeDuelDto })
  @ApiResponse({ status: 200, type: DuelResponseDto })
  async matchmakeDuel(
    @CurrentUser() user: JwtPayload,
    @Body() dto: MatchmakeDuelDto,
  ): Promise<DuelResponseDto> {
    return this.duelsService.matchmakeDuel(user.sub, dto);
  }

  // NOTE: must be declared before @Get(':id') to avoid route shadowing
  @Get('history')
  @ApiOperation({ summary: "Get current user's duel history (paginated)" })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  async getDuelHistory(
    @CurrentUser() user: JwtPayload,
    @Query() query: DuelHistoryQueryDto,
  ): Promise<PaginatedResponseDto<DuelListItemDto>> {
    return this.duelsService.getDuelHistory(user.sub, query, query.status);
  }

  // NOTE: declared before param routes to avoid shadowing
  @Patch('expire')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel all expired pending duels (idempotent)' })
  @ApiResponse({ status: 204 })
  async expirePendingDuels(): Promise<void> {
    await this.duelsService.expirePendingDuels();
  }

  @Get('code/:code')
  @Public()
  @ApiOperation({ summary: 'Get a public duel preview by 6-character code (no auth required)' })
  @ApiResponse({ status: 200, type: DuelPublicPreviewDto })
  @ApiResponse({ status: 404, description: 'Duel not found' })
  async getDuelByCode(@Param('code') code: string): Promise<DuelPublicPreviewDto> {
    const dto = await this.duelsService.getDuelPublicPreview(code);

    if (!dto) {
      throw new NotFoundException('Duel not found');
    }

    return dto;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a duel by ID' })
  @ApiResponse({ status: 200, type: DuelResponseDto })
  @ApiResponse({ status: 404, description: 'Duel not found' })
  async getDuel(@Param('id') id: string): Promise<DuelResponseDto> {
    const dto = await this.duelsService.getDuelResponse(id);

    if (!dto) {
      throw new NotFoundException('Duel not found');
    }

    return dto;
  }

  @Post(':code/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a duel challenge by code' })
  @ApiQuery({ name: 'code', description: '6-character duel code' })
  @ApiResponse({ status: 200, type: DuelResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired duel' })
  @ApiResponse({ status: 404, description: 'Duel not found' })
  async acceptDuel(
    @CurrentUser() user: JwtPayload,
    @Param('code') code: string,
  ): Promise<DuelResponseDto> {
    return this.duelsService.acceptDuel(code, user.sub);
  }
}
