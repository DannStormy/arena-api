import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class TriggerPayoutDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  entryId: string;
}
