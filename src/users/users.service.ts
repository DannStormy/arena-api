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
import { UserProfileDto } from './dto/user-profile.dto';
import { Duel } from '../duels/entities/duel.entity';
import { DuelAnswer } from '../duels/entities/duel-answer.entity';
import { DuelStatus } from '../duels/types/duel-status.enum';
import { levelFromXp, currentSeasonId } from '../duels/duel-progression';
import { rankFromSeasonPoints } from '../common/rank-tiers';

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
    @InjectRepository(Duel)
    private readonly duelsRepo: Repository<Duel>,
    @InjectRepository(DuelAnswer)
    private readonly duelAnswersRepo: Repository<DuelAnswer>,
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

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.findById(userId);

    // ── Duel record ──────────────────────────────────────────────────────────
    const [duelRecord, answerStats, sessionStats] = await Promise.all([
      this.duelsRepo
        .createQueryBuilder('d')
        .select([
          `SUM(CASE WHEN d.winnerId = :uid THEN 1 ELSE 0 END)::int AS wins`,
          `SUM(CASE WHEN d.status = 'completed' AND d.winnerId IS NOT NULL AND d.winnerId != :uid THEN 1 ELSE 0 END)::int AS losses`,
          `SUM(CASE WHEN d.status = 'completed' AND d.winnerId IS NULL THEN 1 ELSE 0 END)::int AS draws`,
          `COUNT(*)::int AS total`,
        ])
        .where('(d.challengerId = :uid OR d.opponentId = :uid)', { uid: userId })
        .andWhere('d.status = :status', { status: DuelStatus.COMPLETED })
        .getRawOne<{ wins: string; losses: string; draws: string; total: string }>(),

      this.duelAnswersRepo
        .createQueryBuilder('a')
        .select([
          `MIN(CASE WHEN a.isCorrect = true AND a.timeTakenMs IS NOT NULL AND a.timeTakenMs > 0 THEN a.timeTakenMs END)::int AS "fastestAnswerMs"`,
          `COUNT(*)::int AS total`,
          `SUM(CASE WHEN a.isCorrect = true THEN 1 ELSE 0 END)::int AS correct`,
        ])
        .where('a.userId = :uid', { uid: userId })
        .andWhere('a.isSteal = false')
        .getRawOne<{ fastestAnswerMs: string | null; total: string; correct: string }>(),

      this.sessionsRepo
        .createQueryBuilder('s')
        .select([
          `COALESCE(SUM(s."totalAnswered"), 0)::int AS "sessionTotal"`,
          `COALESCE(SUM(s."correctAnswers"), 0)::int AS "sessionCorrect"`,
        ])
        .where('s.userId = :uid', { uid: userId })
        .andWhere('s.status = :status', { status: SessionStatus.COMPLETED })
        .getRawOne<{ sessionTotal: string; sessionCorrect: string }>(),
    ]);

    const wins = Number(duelRecord?.wins ?? 0);
    const losses = Number(duelRecord?.losses ?? 0);
    const draws = Number(duelRecord?.draws ?? 0);
    const totalDuels = Number(duelRecord?.total ?? 0);
    const winRate = totalDuels > 0 ? Math.round((wins / totalDuels) * 10000) / 100 : 0;

    const fastestAnswerMs =
      answerStats?.fastestAnswerMs != null ? Number(answerStats.fastestAnswerMs) : null;
    const duelTotal = Number(answerStats?.total ?? 0);
    const duelCorrect = Number(answerStats?.correct ?? 0);

    const sessionTotal = Number(sessionStats?.sessionTotal ?? 0);
    const sessionCorrect = Number(sessionStats?.sessionCorrect ?? 0);

    const combinedTotal = duelTotal + sessionTotal;
    const combinedCorrect = duelCorrect + sessionCorrect;
    const avgAccuracy =
      combinedTotal > 0 ? Math.round((combinedCorrect / combinedTotal) * 10000) / 100 : 0;

    // ── XP / Level ───────────────────────────────────────────────────────────
    const xp = Number(user.lifetimeXp);
    const { level, intoLevel, nextLevelAt } = levelFromXp(xp);

    // ── Season rank ──────────────────────────────────────────────────────────
    const seasonId = currentSeasonId();
    const sp = user.seasonId === seasonId ? user.seasonPoints : 0;
    const { rank: seasonRank, rankFloor, nextRankAt } = rankFromSeasonPoints(sp);

    const dto = new UserProfileDto();
    dto.userId = user.id;
    dto.username = user.username;
    dto.avatarInitials = computeInitials(user.username);
    dto.avatarUrl = user.avatarUrl ?? null;
    dto.joinedAt = user.createdAt;
    dto.lifetimeXp = xp;
    dto.level = level;
    dto.intoLevel = intoLevel;
    dto.nextLevelAt = nextLevelAt;
    dto.seasonPoints = sp;
    dto.seasonRank = seasonRank;
    dto.rankFloor = rankFloor;
    dto.nextRankAt = nextRankAt;
    dto.allTimeHighestRank = user.allTimeHighestRank;
    dto.wins = wins;
    dto.losses = losses;
    dto.draws = draws;
    dto.totalDuels = totalDuels;
    dto.winRate = winRate;
    dto.currentWinStreak = user.duelWinStreak;
    dto.fastestAnswerMs = fastestAnswerMs;
    dto.avgAccuracy = avgAccuracy;

    return dto;
  }
}

function computeInitials(username: string): string {
  const words = username.trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}
