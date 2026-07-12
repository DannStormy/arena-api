import { randomUUID } from 'crypto';
import { Body, Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { ChallengeService } from './challenge.service';
import { StreakService } from '../streak/streak.service';
import { PracticeSetDto } from './dto/practice-set.dto';
import { ValidateAnswerDto } from './dto/validate-answer.dto';
import { ChallengeSetResponseDto } from './dto/challenge-set-response.dto';
import { ValidationResultDto } from './dto/validation-result.dto';

@ApiTags('Challenges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('challenges')
export class ChallengeController {
  private readonly logger = new Logger(ChallengeController.name);

  constructor(
    private readonly challengeService: ChallengeService,
    private readonly streakService: StreakService,
  ) {}

  @Post('practice')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a solo practice set (Speed Math / Brain Duel)' })
  @ApiResponse({ status: 200, type: ChallengeSetResponseDto })
  practice(@CurrentUser() user: JwtPayload, @Body() dto: PracticeSetDto): ChallengeSetResponseDto {
    const matchSeed = randomUUID();
    const challenges = this.challengeService.generateSet({
      matchSeed,
      mode: dto.mode,
      count: dto.count,
      difficulty: dto.difficulty,
    });
    // Playing Speed Math counts toward the daily streak. Fire-and-forget: a
    // streak hiccup must never block gameplay. The UI reads GET /streak.
    void this.streakService
      .recordActivity(user.sub)
      .catch((err) => this.logger.warn(`streak recordActivity failed: ${err}`));
    return { matchSeed, mode: dto.mode, difficulty: dto.difficulty, challenges };
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate one answer (server-authoritative, re-derived from the seed)' })
  @ApiResponse({ status: 200, type: ValidationResultDto })
  validate(@Body() dto: ValidateAnswerDto): ValidationResultDto {
    return this.challengeService.validateSubmission({
      matchSeed: dto.matchSeed,
      mode: dto.mode,
      difficulty: dto.difficulty,
      index: dto.index,
      submitted: dto.answer,
      elapsedMs: dto.elapsedMs,
    });
  }
}
