import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateBankDetailsDto } from './dto/update-bank-details.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { username } });
  }

  async findByReferralCode(referralCode: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { referralCode } });
  }

  async create(data: Partial<User>): Promise<User> {
    const user = this.usersRepo.create(data);

    return this.usersRepo.save(user);
  }

  async getMe(userId: string): Promise<UserResponseDto> {
    const user = await this.findById(userId);

    return UserResponseDto.fromEntity(user);
  }

  async updateMe(userId: string, dto: UpdateUserDto): Promise<{ success: true }> {
    const user = await this.findById(userId);

    if (dto.username && dto.username !== user.username) {
      const existing = await this.findByUsername(dto.username);

      if (existing) {
        throw new ConflictException('Username already taken');
      }
    }

    await this.usersRepo.update(userId, dto);

    this.logger.log(`User updated: ${userId}`);

    return { success: true };
  }

  async updateBankDetails(userId: string, dto: UpdateBankDetailsDto): Promise<{ success: true }> {
    await this.findById(userId);
    await this.usersRepo.update(userId, dto);
    this.logger.log(`Bank details updated: ${userId}`);
    return { success: true };
  }
}
