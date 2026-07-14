import { randomUUID } from 'crypto';
import { Body, Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { ChallengeService } from './challenge.service';
import { StreakService } from '../streak/streak.service';
import {
  ProgressionAwardService,
  SOLO_CHALLENGE_XP_PER_CORRECT,
} from '../progression/services/progression-award.service';
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
    private readonly progressionAward: ProgressionAwardService,
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
  validate(@CurrentUser() user: JwtPayload, @Body() dto: ValidateAnswerDto): ValidationResultDto {
    const result = this.challengeService.validateSubmission({
      matchSeed: dto.matchSeed,
      mode: dto.mode,
      difficulty: dto.difficulty,
      index: dto.index,
      submitted: dto.answer,
      elapsedMs: dto.elapsedMs,
    });

    // Solo play now nudges XP so rank moves outside of duels/tournaments. Only a
    // correct answer earns it, a small flat amount, and it's idempotent per
    // (matchSeed:index) — re-validating the same challenge never re-awards, so it
    // can't be farmed into big numbers. Fire-and-forget: a progression hiccup
    // must never block gameplay (same pattern as the streak call in /practice).
    if (result.correct) {
      void this.progressionAward
        .awardSoloXp(user.sub, `${dto.matchSeed}:${dto.index}`, SOLO_CHALLENGE_XP_PER_CORRECT)
        .catch((err) => this.logger.warn(`solo XP award failed: ${err}`));
    }

    return result;
  }
}
