import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../entities/user.entity';
import { levelFromXp } from '../../duels/duel-progression';

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

  @ApiPropertyOptional()
  bankAccountNumber: string | null;

  @ApiPropertyOptional()
  bankCode: string | null;

  @ApiPropertyOptional()
  bankAccountName: string | null;

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
  lifetimeXp: number;

  @ApiProperty()
  level: number;

  @ApiProperty()
  intoLevel: number;

  @ApiPropertyOptional()
  nextLevelAt: number | null;

  @ApiProperty()
  seasonPoints: number;

  @ApiPropertyOptional()
  seasonId: string | null;

  @ApiProperty()
  duelWinStreak: number;

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
    dto.bankAccountNumber = user.bankAccountNumber;
    dto.bankCode = user.bankCode;
    dto.bankAccountName = user.bankAccountName;
    dto.referralCode = user.referralCode;
    dto.referredBy = user.referredBy;
    dto.isVerified = user.isVerified;
    dto.isActive = user.isActive;
    dto.isAdmin = user.isAdmin;

    const xp = Number(user.lifetimeXp);
    const lvl = levelFromXp(xp);
    dto.lifetimeXp = xp;
    dto.level = lvl.level;
    dto.intoLevel = lvl.intoLevel;
    dto.nextLevelAt = lvl.nextLevelAt;
    dto.seasonPoints = user.seasonPoints;
    dto.seasonId = user.seasonId;
    dto.duelWinStreak = user.duelWinStreak;

    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;

    return dto;
  }
}
