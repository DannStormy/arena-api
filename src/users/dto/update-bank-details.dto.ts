import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateBankDetailsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankAccountNumber: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankAccountName: string;
}
