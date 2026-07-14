import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMinSize,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';

export class DailyAnswerInputDto {
  @ApiProperty({ description: 'Zero-based challenge index within the daily set' })
  @IsInt()
  @Min(0)
  index: number;

  @ApiProperty({ description: 'The submitted answer (shape depends on the challenge answerType)' })
  @Allow() // keep through the global whitelisting ValidationPipe; shape is validated server-side
  answer: unknown;

  @ApiProperty({ description: 'Time the player took on this challenge, in ms' })
  @IsInt()
  @Min(0)
  elapsedMs: number;
}

export class CompleteDailyDto {
  @ApiProperty({ type: [DailyAnswerInputDto], description: 'The whole run, one entry per challenge' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DailyAnswerInputDto)
  answers: DailyAnswerInputDto[];
}
