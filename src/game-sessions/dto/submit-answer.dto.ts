import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class SubmitAnswerDto {
  @ApiProperty()
  @IsUUID()
  questionId: string;

  @ApiProperty({ minimum: 0, maximum: 3 })
  @IsInt()
  @Min(0)
  @Max(3)
  selectedAnswer: number;

  @ApiPropertyOptional({ description: 'Client-side timestamp in ms epoch' })
  @IsOptional()
  @IsInt()
  clientTimestamp?: number;

  @ApiPropertyOptional({ description: 'Time taken in milliseconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  timeTakenMs?: number;
}
