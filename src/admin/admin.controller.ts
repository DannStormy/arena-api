import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { UpdateTournamentStatusDto } from '../tournaments/dto/update-tournament-status.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginatedQueryDto } from '../common/dto/paginated-query.dto';
import { AdminTournamentQueryDto } from './dto/admin-tournament-query.dto';
import { AdminQuestionsQueryDto } from './dto/admin-questions-query.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { ResolveSessionDto } from './dto/resolve-session.dto';
import { TriggerPayoutDto } from './dto/trigger-payout.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly tournamentsService: TournamentsService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard stats (admin)' })
  @ApiResponse({
    status: 200,
    schema: {
      example: { totalUsers: 0, activeTournaments: 0, flaggedSessions: 0, pendingPayouts: 0 },
    },
  })
  getStats() {
    return this.adminService.getStats();
  }

  @Get('questions')
  @ApiOperation({ summary: 'List all questions including correct answers (admin)' })
  @ApiResponse({ status: 200 })
  listQuestions(@Query() query: AdminQuestionsQueryDto) {
    return this.adminService.listQuestions(query);
  }

  @Patch('questions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a question (admin)' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdateQuestionDto })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  updateQuestion(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.adminService.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a question — blocked if answer history exists (admin)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 400, description: 'Question has answer history — deactivate instead' })
  deleteQuestion(@Param('id') id: string) {
    return this.adminService.deleteQuestion(id);
  }

  @Get('tournaments')
  @ApiOperation({ summary: 'List all tournaments with entry counts (admin)' })
  @ApiResponse({ status: 200 })
  listTournaments(@Query() query: AdminTournamentQueryDto) {
    return this.adminService.listTournaments(query);
  }

  @Get('tournaments/:id')
  @ApiOperation({ summary: 'Get tournament with all entries (admin)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200 })
  getTournament(@Param('id') id: string) {
    return this.adminService.getTournament(id);
  }

  @Patch('tournaments/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update tournament status (admin)' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdateTournamentStatusDto })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  updateTournamentStatus(@Param('id') id: string, @Body() dto: UpdateTournamentStatusDto) {
    return this.tournamentsService.updateStatus(id, dto.status);
  }

  @Get('tournaments/:id/entries')
  @ApiOperation({ summary: 'List all entries for a tournament (admin)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200 })
  listTournamentEntries(@Param('id') id: string, @Query() query: PaginatedQueryDto) {
    return this.adminService.listTournamentEntries(id, query);
  }

  @Get('sessions/flagged')
  @ApiOperation({ summary: 'List all flagged game sessions (admin)' })
  @ApiResponse({ status: 200 })
  listFlaggedSessions(@Query() query: PaginatedQueryDto) {
    return this.adminService.listFlaggedSessions(query);
  }

  @Get('flagged-sessions')
  @ApiOperation({ summary: 'List all flagged game sessions — alias for /sessions/flagged (admin)' })
  @ApiResponse({ status: 200 })
  listFlaggedSessionsAlias(@Query() query: PaginatedQueryDto) {
    return this.adminService.listFlaggedSessions(query);
  }

  @Patch('sessions/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a flagged session — clear or disqualify (admin)' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: ResolveSessionDto })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  resolveSession(@Param('id') id: string, @Body() dto: ResolveSessionDto) {
    return this.adminService.resolveSession(id, dto);
  }

  @Get('payouts/pending')
  @ApiOperation({ summary: 'List pending prize payouts for completed tournaments (admin)' })
  @ApiResponse({ status: 200 })
  getPendingPayouts() {
    return this.adminService.getPendingPayouts();
  }

  @Post('payouts/trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger a prize payout via Paystack transfer (admin)' })
  @ApiBody({ type: TriggerPayoutDto })
  @ApiResponse({
    status: 200,
    schema: { example: { success: true, transferCode: 'TRF_xxxxxxxxxx' } },
  })
  triggerPayout(@Body() dto: TriggerPayoutDto) {
    return this.adminService.triggerPayout(dto);
  }
}
