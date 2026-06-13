import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GameSessionsService } from './game-sessions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { StartSessionResponseDto } from './dto/start-session-response.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { SubmitAnswerResponseDto } from './dto/submit-answer-response.dto';
import { SessionResultDto } from './dto/session-result.dto';
import { QuestionResponseDto } from '../questions/dto/question-response.dto';
import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class StartSessionDto {
  @ApiProperty()
  @IsUUID()
  tournamentId: string;
}

@ApiTags('Game Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('game-sessions')
export class GameSessionsController {
  constructor(private readonly gameSessionsService: GameSessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Start a new game session for a tournament' })
  @ApiBody({ type: StartSessionDto })
  @ApiResponse({ status: 201, type: StartSessionResponseDto })
  async startSession(
    @CurrentUser() user: JwtPayload,
    @Body() dto: StartSessionDto,
  ): Promise<StartSessionResponseDto> {
    return this.gameSessionsService.startSession(user.sub, dto.tournamentId);
  }

  @Get(':id/questions')
  @ApiOperation({ summary: 'Get the current question for the session' })
  @ApiResponse({ status: 200, type: QuestionResponseDto })
  @ApiResponse({ status: 400, description: 'No more questions or session not active' })
  async getCurrentQuestion(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuestionResponseDto> {
    return this.gameSessionsService.getNextQuestion(id, user.sub);
  }

  @Get(':id/next-question')
  @ApiOperation({ summary: 'Get the next question for the session' })
  @ApiResponse({ status: 200, type: QuestionResponseDto })
  @ApiResponse({ status: 400, description: 'No more questions or session not active' })
  async nextQuestion(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuestionResponseDto> {
    return this.gameSessionsService.getNextQuestion(id, user.sub);
  }

  @Post(':id/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit an answer for the current question' })
  @ApiBody({ type: SubmitAnswerDto })
  @ApiResponse({ status: 200, type: SubmitAnswerResponseDto })
  async submitAnswer(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAnswerDto,
  ): Promise<SubmitAnswerResponseDto> {
    return this.gameSessionsService.submitAnswer(id, user.sub, dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete the game session and finalise score' })
  @ApiResponse({ status: 200, type: SessionResultDto })
  async completeSession(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionResultDto> {
    return this.gameSessionsService.completeSession(id, user.sub);
  }
}
