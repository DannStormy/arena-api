import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionsService } from './questions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BulkCreateQuestionsDto } from './dto/bulk-create-questions.dto';
import { QuestionListItemDto } from './dto/question-list-item.dto';
import { PaginatedQueryDto } from '../common/dto/paginated-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { QuestionCategory } from './types/question-category.enum';
import { QuestionDifficulty } from './types/question-difficulty.enum';

class QuestionQueryDto extends PaginatedQueryDto {
  @ApiPropertyOptional({ enum: QuestionCategory })
  @IsOptional()
  @IsEnum(QuestionCategory)
  category?: QuestionCategory;

  @ApiPropertyOptional({ enum: QuestionDifficulty })
  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty;
}

@ApiTags('Questions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  @ApiOperation({ summary: 'Bulk create questions (admin only)' })
  @ApiBody({ type: BulkCreateQuestionsDto })
  @ApiResponse({ status: 201, schema: { example: { created: 5 } } })
  async bulkCreate(@Body() dto: BulkCreateQuestionsDto): Promise<{ created: number }> {
    return this.questionsService.bulkCreate(dto.questions);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List questions with filters (admin only)' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  async list(
    @Query() query: QuestionQueryDto,
  ): Promise<PaginatedResponseDto<QuestionListItemDto>> {
    return this.questionsService.list({
      query,
      category: query.category,
      difficulty: query.difficulty,
    });
  }
}
