import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class ResolveSessionDto {
  @ApiProperty({ enum: ['clear', 'disqualify'] })
  @IsIn(['clear', 'disqualify'])
  action: 'clear' | 'disqualify';
}
