import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../entities/user.entity';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  username: string;

  @ApiPropertyOptional()
  phone: string;

  @ApiPropertyOptional()
  avatarUrl: string;

  @ApiProperty()
  referralCode: string;

  @ApiPropertyOptional()
  referredBy: string;

  @ApiProperty()
  isVerified: boolean;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isAdmin: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();

    dto.id = user.id;
    dto.email = user.email;
    dto.username = user.username;
    dto.phone = user.phone;
    dto.avatarUrl = user.avatarUrl;
    dto.referralCode = user.referralCode;
    dto.referredBy = user.referredBy;
    dto.isVerified = user.isVerified;
    dto.isActive = user.isActive;
    dto.isAdmin = user.isAdmin;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;

    return dto;
  }
}
