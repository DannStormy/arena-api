import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { ChallengeService } from './challenge.service';
import { SeedTokenService } from './seed-token.service';
import { OFFLINE_SEED_PREFIX } from './seed-token';
import { ChallengeMode } from './types/challenge-mode.enum';
import { StreakService } from '../streak/streak.service';
import {
  ProgressionAwardService,
  SOLO_CHALLENGE_XP_PER_CORRECT,
} from '../progression/services/progression-award.service';
import { PracticeSetDto } from './dto/practice-set.dto';
import { ValidateAnswerDto } from './dto/validate-answer.dto';
import { ChallengeSetResponseDto } from './dto/challenge-set-response.dto';
import { ValidationResultDto } from './dto/validation-result.dto';

const PRACTICE_SET_TTL_MS = 2 * 60 * 60 * 1000;
const OFFLINE_SET_MAX = 20;

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
    private readonly seedTokens: SeedTokenService,
  ) {}

  @Post('practice')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a solo practice set (Speed Math / Brain Duel)' })
  @ApiResponse({ status: 200, type: ChallengeSetResponseDto })
  practice(@CurrentUser() user: JwtPayload, @Body() dto: PracticeSetDto): ChallengeSetResponseDto {
    const seed = randomUUID();
    const challenges = this.challengeService.generateSet({
      matchSeed: seed,
      mode: dto.mode,
      count: dto.count,
      difficulty: dto.difficulty,
    });
    const matchSeed = this.seedTokens.issue({
      seed,
      userId: user.sub,
      mode: dto.mode,
      difficulty: dto.difficulty,
      count: dto.count,
      expiresAt: Date.now() + PRACTICE_SET_TTL_MS,
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
    const set = this.resolveSet(user.sub, dto);
    if (dto.index >= set.count) throw new BadRequestException('index out of range');

    const result = this.challengeService.validateSubmission({
      matchSeed: set.seed,
      mode: set.mode,
      difficulty: set.difficulty,
      index: dto.index,
      submitted: dto.answer,
      elapsedMs: dto.elapsedMs,
    });

    // Idempotent per (seed:index) and capped per day in awardSoloXp. Offline
    // seeds keep their prefix so they fall under the smaller offline cap.
    if (result.correct) {
      void this.progressionAward
        .awardSoloXp(user.sub, `${set.seed}:${dto.index}`, SOLO_CHALLENGE_XP_PER_CORRECT)
        .catch((err) => this.logger.warn(`solo XP award failed: ${err}`));
    }

    return result;
  }

  private resolveSet(userId: string, dto: ValidateAnswerDto) {
    if (dto.matchSeed.startsWith(OFFLINE_SEED_PREFIX)) {
      if (dto.mode !== ChallengeMode.SPEED_MATH && dto.mode !== ChallengeMode.MEMORY) {
        throw new BadRequestException('offline play supports Speed Math and Memory only');
      }
      return {
        seed: dto.matchSeed,
        mode: dto.mode,
        difficulty: dto.difficulty,
        count: OFFLINE_SET_MAX,
      };
    }
    const grant = this.seedTokens.verify(dto.matchSeed, userId);
    if (!grant) throw new BadRequestException('invalid or expired challenge set');
    return grant;
  }
}
