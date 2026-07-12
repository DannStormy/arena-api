import { ApiProperty } from '@nestjs/swagger';

export class ValidationResultDto {
  @ApiProperty()
  index: number;

  @ApiProperty()
  correct: boolean;

  @ApiProperty({ description: 'Points earned (0 if wrong), scaled by speed' })
  score: number;
}
