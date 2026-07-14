import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { CompleteDailyDto } from './dto/complete-daily.dto';
import {
  DailyCompleteView,
  DailyLeaderboardView,
  DailyService,
  DailyStateView,
} from './daily.service';

@ApiTags('Daily Challenge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('daily')
export class DailyController {
  constructor(private readonly service: DailyService) {}

  @Get()
  @ApiOperation({ summary: "Today's shared seeded set; includes your result if you already played" })
  getDaily(@CurrentUser() user: JwtPayload): Promise<DailyStateView> {
    return this.service.getDaily(user.sub);
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit your one-shot run; server validates every answer and records the result' })
  completeDaily(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CompleteDailyDto,
  ): Promise<DailyCompleteView> {
    return this.service.completeDaily(user.sub, dto);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Top 20 for a day (default today) plus your own line' })
  @ApiQuery({ name: 'date', required: false, description: 'UTC day YYYY-MM-DD (defaults to today)' })
  getLeaderboard(
    @CurrentUser() user: JwtPayload,
    @Query('date') date?: string,
  ): Promise<DailyLeaderboardView> {
    return this.service.getLeaderboard(user.sub, date);
  }
}
