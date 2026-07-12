import { randomUUID } from 'crypto';
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ChallengeService } from './challenge.service';
import { PracticeSetDto } from './dto/practice-set.dto';
import { ValidateAnswerDto } from './dto/validate-answer.dto';
import { ChallengeSetResponseDto } from './dto/challenge-set-response.dto';
import { ValidationResultDto } from './dto/validation-result.dto';

@ApiTags('Challenges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('challenges')
export class ChallengeController {
  constructor(private readonly challengeService: ChallengeService) {}

  @Post('practice')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a solo practice set (Speed Math / Brain Duel)' })
  @ApiResponse({ status: 200, type: ChallengeSetResponseDto })
  practice(@Body() dto: PracticeSetDto): ChallengeSetResponseDto {
    const matchSeed = randomUUID();
    const challenges = this.challengeService.generateSet({
      matchSeed,
      mode: dto.mode,
      count: dto.count,
      difficulty: dto.difficulty,
    });
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
