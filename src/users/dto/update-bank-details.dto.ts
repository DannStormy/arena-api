import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateBankDetailsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankAccountNumber: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ description: 'Ignored: the name is resolved from Paystack' })
  @IsOptional()
  @IsString()
  bankAccountName?: string;

  @ApiProperty({ description: "The user's current password; changing where prizes go needs re-auth" })
  @IsString()
  @IsNotEmpty()
  password: string;
}
