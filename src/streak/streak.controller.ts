import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { StreakService } from './streak.service';
import { StreakStatusDto } from './dto/streak-status.dto';

@ApiTags('Streak')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('streak')
export class StreakController {
  constructor(private readonly streakService: StreakService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Current daily-play streak (the don't-break-the-chain status)" })
  @ApiResponse({ status: 200, type: StreakStatusDto })
  getStreak(@CurrentUser() user: JwtPayload): Promise<StreakStatusDto> {
    return this.streakService.getStatus(user.sub);
  }
}
