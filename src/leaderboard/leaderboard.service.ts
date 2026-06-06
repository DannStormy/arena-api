import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TournamentEntry } from '../tournaments/entities/tournament-entry.entity';
import { User } from '../users/entities/user.entity';
import { LeaderboardEntryDto } from './dto/leaderboard-entry.dto';
import { TournamentArena } from '../tournaments/types/tournament-arena.enum';

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    @InjectRepository(TournamentEntry)
    private readonly entriesRepo: Repository<TournamentEntry>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async getGlobalLeaderboard(arena?: TournamentArena): Promise<LeaderboardEntryDto[]> {
    const qb = this.entriesRepo
      .createQueryBuilder('e')
      .select('e.userId', 'userId')
      .addSelect('COALESCE(SUM(CAST(e.prize_won AS numeric)), 0)', 'totalPrizeWon')
      .addSelect('COUNT(DISTINCT e.tournamentId)', 'tournamentsPlayed')
      .groupBy('e.userId')
      .orderBy('"totalPrizeWon"', 'DESC')
      .limit(50);

    if (arena) {
      qb.innerJoin('e.tournament', 't').andWhere('t.arena = :arena', { arena });
    }

    const rows = await qb.getRawMany<{
      userId: string;
      totalPrizeWon: string;
      tournamentsPlayed: string;
    }>();

    const userIds = rows.map((r) => r.userId);

    const users =
      userIds.length > 0
        ? await this.usersRepo.createQueryBuilder('u').whereInIds(userIds).getMany()
        : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    return rows.map((row, idx) => {
      const user = userMap.get(row.userId);
      const dto = new LeaderboardEntryDto();

      dto.rank = idx + 1;
      dto.userId = row.userId;
      dto.username = user?.username ?? '';
      dto.avatarUrl = user?.avatarUrl ?? '';
      dto.totalPrizeWon = row.totalPrizeWon;
      dto.tournamentsPlayed = parseInt(row.tournamentsPlayed, 10);

      return dto;
    });
  }
}
