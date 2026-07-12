import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { AsyncDuelsService } from './async-duels.service';
import { CreateAsyncDuelDto } from './dto/create-async-duel.dto';
import { MatchmakeAsyncDuelDto } from './dto/matchmake-async-duel.dto';
import { SubmitAsyncDuelDto } from './dto/submit-async-duel.dto';
import { AsyncDuelSetResponseDto } from './dto/async-duel-set-response.dto';
import { AsyncDuelResultDto } from './dto/async-duel-result.dto';

@ApiTags('Async Duels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('async-duels')
export class AsyncDuelsController {
  constructor(private readonly service: AsyncDuelsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a challenge-a-friend async duel (returns a shareable code + set)' })
  @ApiResponse({ status: 201, type: AsyncDuelSetResponseDto })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAsyncDuelDto,
  ): Promise<AsyncDuelSetResponseDto> {
    return this.service.create(user.sub, dto);
  }

  @Post('matchmake')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Match against a stored ghost run at a similar mode/difficulty' })
  @ApiResponse({ status: 201, type: AsyncDuelSetResponseDto })
  matchmake(
    @CurrentUser() user: JwtPayload,
    @Body() dto: MatchmakeAsyncDuelDto,
  ): Promise<AsyncDuelSetResponseDto> {
    return this.service.matchmake(user.sub, dto);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get the playable set for a match (same seed); opponent score hidden until you finish' })
  @ApiResponse({ status: 200, type: AsyncDuelSetResponseDto })
  getByCode(
    @CurrentUser() user: JwtPayload,
    @Param('code') code: string,
  ): Promise<AsyncDuelSetResponseDto> {
    return this.service.getByCode(code, user.sub);
  }

  @Post(':code/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a whole run; server validates every answer, resolves + awards when both are done' })
  @ApiResponse({ status: 200, type: AsyncDuelResultDto })
  submit(
    @CurrentUser() user: JwtPayload,
    @Param('code') code: string,
    @Body() dto: SubmitAsyncDuelDto,
  ): Promise<AsyncDuelResultDto> {
    return this.service.submit(code, user.sub, dto);
  }

  @Get(':id/result')
  @ApiOperation({ summary: 'Final result once resolved (scores, winner, resolution, progression snapshots)' })
  @ApiResponse({ status: 200, type: AsyncDuelResultDto })
  getResult(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<AsyncDuelResultDto> {
    return this.service.getResult(id, user.sub);
  }
}
