import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Username or email' })
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;
}
