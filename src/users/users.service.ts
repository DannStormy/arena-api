import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { TournamentEntry } from '../tournaments/entities/tournament-entry.entity';
import { GameSession } from '../game-sessions/entities/game-session.entity';
import { SessionStatus } from '../game-sessions/types/session-status.enum';
import { EntryStatus } from '../tournaments/entities/tournament-entry.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateBankDetailsDto } from './dto/update-bank-details.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(TournamentEntry)
    private readonly entriesRepo: Repository<TournamentEntry>,
    @InjectRepository(GameSession)
    private readonly sessionsRepo: Repository<GameSession>,
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

  async getMyStats(userId: string): Promise<{
    tournamentsPlayed: number;
    questionsAnswered: number;
    correctAnswers: number;
    accuracy: number;
    totalPrizeWon: string;
  }> {
    const [entryStats, sessionStats] = await Promise.all([
      this.entriesRepo
        .createQueryBuilder('e')
        .select('COUNT(e.id)::int', 'tournamentsPlayed')
        .addSelect('COALESCE(SUM(e."prizeWon"::numeric), 0)', 'totalPrizeWon')
        .where('e.userId = :userId', { userId })
        .andWhere('e.status = :entryStatus', { entryStatus: EntryStatus.COMPLETED })
        .getRawOne<{ tournamentsPlayed: number; totalPrizeWon: string }>(),
      this.sessionsRepo
        .createQueryBuilder('s')
        .select('COALESCE(SUM(s."totalAnswered"), 0)::int', 'questionsAnswered')
        .addSelect('COALESCE(SUM(s."correctAnswers"), 0)::int', 'correctAnswers')
        .where('s.userId = :userId', { userId })
        .andWhere('s.status = :status', { status: SessionStatus.COMPLETED })
        .getRawOne<{ questionsAnswered: number; correctAnswers: number }>(),
    ]);

    const tournamentsPlayed = Number(entryStats?.tournamentsPlayed ?? 0);
    const totalPrizeWon = entryStats?.totalPrizeWon ?? '0';
    const questionsAnswered = Number(sessionStats?.questionsAnswered ?? 0);
    const correctAnswers = Number(sessionStats?.correctAnswers ?? 0);
    const accuracy =
      questionsAnswered > 0
        ? Math.round((correctAnswers / questionsAnswered) * 10000) / 100
        : 0;

    return { tournamentsPlayed, questionsAnswered, correctAnswers, accuracy, totalPrizeWon };
  }
}
