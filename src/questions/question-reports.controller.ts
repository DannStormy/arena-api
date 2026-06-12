import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { QuestionsService } from './questions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { ReportQuestionDto } from './dto/report-question.dto';

@ApiTags('Questions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('questions')
export class QuestionReportsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post(':id/report')
  @ApiOperation({ summary: 'Report a question (authenticated users)' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: ReportQuestionDto })
  @ApiResponse({ status: 201, schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Question not found' })
  async reportQuestion(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReportQuestionDto,
  ): Promise<{ success: true }> {
    return this.questionsService.reportQuestion(id, user.sub, dto.reason);
  }
}
