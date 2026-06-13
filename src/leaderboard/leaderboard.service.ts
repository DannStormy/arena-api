import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TournamentEntry } from '../tournaments/entities/tournament-entry.entity';
import { User } from '../users/entities/user.entity';
import { Duel } from '../duels/entities/duel.entity';
import { LeaderboardEntryDto } from './dto/leaderboard-entry.dto';
import { DuelLeaderboardEntryDto } from './dto/duel-leaderboard-entry.dto';
import { TournamentArena } from '../tournaments/types/tournament-arena.enum';
import { rankFromSeasonPoints } from '../common/rank-tiers';
import { currentSeasonId } from '../duels/duel-progression';

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    @InjectRepository(TournamentEntry)
    private readonly entriesRepo: Repository<TournamentEntry>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Duel)
    private readonly duelsRepo: Repository<Duel>,
  ) {}

  async getGlobalLeaderboard(arena?: TournamentArena): Promise<LeaderboardEntryDto[]> {
    const qb = this.entriesRepo
      .createQueryBuilder('e')
      .select('e.userId', 'userId')
      .addSelect('COALESCE(SUM(e.score), 0)::int', 'totalScore')
      .addSelect('COALESCE(SUM(CAST(e."prizeWon" AS numeric)), 0)', 'totalPrizeWon')
      .addSelect('COUNT(DISTINCT e.tournamentId)', 'tournamentsPlayed')
      .groupBy('e.userId')
      .orderBy('"totalScore"', 'DESC')
      .limit(50);

    if (arena) {
      qb.innerJoin('e.tournament', 't').andWhere('t.arena = :arena', { arena });
    }

    const rows = await qb.getRawMany<{
      userId: string;
      totalScore: string;
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
      dto.totalScore = Number(row.totalScore);
      dto.totalPrizeWon = row.totalPrizeWon;
      dto.tournamentsPlayed = parseInt(row.tournamentsPlayed, 10);

      return dto;
    });
  }

  async getDuelLeaderboard(
    requestingUserId: string,
    arena?: TournamentArena,
  ): Promise<DuelLeaderboardEntryDto[]> {
    const seasonId = currentSeasonId();
    const monthStart = new Date(`${seasonId}-01T00:00:00.000Z`);

    let rankedRows: Array<{ userId: string; seasonPoints: number }>;

    if (!arena) {
      // All arenas: rank by user.seasonPoints (already season-aware)
      const users = await this.usersRepo
        .createQueryBuilder('u')
        .select(['u.id', 'u.seasonPoints', 'u.seasonId'])
        .orderBy('u.seasonPoints', 'DESC')
        .limit(50)
        .getMany();

      rankedRows = users.map((u) => ({
        userId: u.id,
        seasonPoints: u.seasonId === seasonId ? u.seasonPoints : 0,
      }));
    } else {
      // Arena-specific: aggregate SP awarded in duels for this arena during current month
      const raw = await this.duelsRepo.manager.query<{ userId: string; arenaPoints: string }[]>(
        `
        SELECT t."userId", COALESCE(SUM(t.sp), 0)::int AS "arenaPoints"
        FROM (
          SELECT d."challengerId" AS "userId", d."challengerSpAwarded" AS sp
          FROM duels d
          WHERE d.arena = $1
            AND d."progressionAwarded" = true
            AND d."completedAt" >= $2
            AND d."challengerSpAwarded" IS NOT NULL
          UNION ALL
          SELECT d."opponentId" AS "userId", d."opponentSpAwarded" AS sp
          FROM duels d
          WHERE d.arena = $1
            AND d."progressionAwarded" = true
            AND d."completedAt" >= $2
            AND d."opponentSpAwarded" IS NOT NULL
            AND d."opponentId" IS NOT NULL
        ) t
        GROUP BY t."userId"
        ORDER BY "arenaPoints" DESC
        LIMIT 50
        `,
        [arena, monthStart],
      );

      rankedRows = raw.map((r) => ({ userId: r.userId, seasonPoints: Number(r.arenaPoints) }));
    }

    // Load user details
    const topUserIds = rankedRows.map((r) => r.userId);
    const topUsers =
      topUserIds.length > 0
        ? await this.usersRepo.createQueryBuilder('u').whereInIds(topUserIds).getMany()
        : [];
    const userMap = new Map(topUsers.map((u) => [u.id, u]));

    const entries: DuelLeaderboardEntryDto[] = rankedRows.map((row, idx) => {
      const user = userMap.get(row.userId);
      const dto = new DuelLeaderboardEntryDto();
      dto.rank = idx + 1;
      dto.userId = row.userId;
      dto.username = user?.username ?? '';
      dto.avatarInitials = computeInitials(user?.username ?? '');
      dto.avatarUrl = user?.avatarUrl ?? null;
      dto.seasonPoints = row.seasonPoints;
      dto.rankTier = rankFromSeasonPoints(row.seasonPoints).rank;
      dto.isRequestingUser = row.userId === requestingUserId;
      return dto;
    });

    // Always include requesting user if outside the top list
    const inTop = entries.some((e) => e.userId === requestingUserId);

    if (!inTop) {
      const requestingUser = await this.usersRepo.findOne({ where: { id: requestingUserId } });

      if (requestingUser) {
        let userPoints = 0;

        if (!arena) {
          userPoints =
            requestingUser.seasonId === seasonId ? requestingUser.seasonPoints : 0;
        } else {
          const [arenaRow] = await this.duelsRepo.manager.query<{ arenaPoints: string }[]>(
            `
            SELECT COALESCE(SUM(t.sp), 0)::int AS "arenaPoints"
            FROM (
              SELECT d."challengerSpAwarded" AS sp
              FROM duels d
              WHERE d."challengerId" = $1 AND d.arena = $2
                AND d."progressionAwarded" = true AND d."completedAt" >= $3
                AND d."challengerSpAwarded" IS NOT NULL
              UNION ALL
              SELECT d."opponentSpAwarded" AS sp
              FROM duels d
              WHERE d."opponentId" = $1 AND d.arena = $2
                AND d."progressionAwarded" = true AND d."completedAt" >= $3
                AND d."opponentSpAwarded" IS NOT NULL
            ) t
            `,
            [requestingUserId, arena, monthStart],
          );
          userPoints = Number(arenaRow?.arenaPoints ?? 0);
        }

        // Compute actual rank
        let actualRank: number;
        if (!arena) {
          const [{ count }] = await this.usersRepo.manager.query<[{ count: string }]>(
            `SELECT COUNT(*)::int as count FROM users WHERE "seasonPoints" > $1 AND "seasonId" = $2`,
            [userPoints, seasonId],
          );
          actualRank = Number(count) + 1;
        } else {
          const [{ count }] = await this.duelsRepo.manager.query<[{ count: string }]>(
            `
            SELECT COUNT(DISTINCT t."userId")::int as count
            FROM (
              SELECT d."challengerId" AS "userId", COALESCE(SUM(d."challengerSpAwarded"), 0) AS sp
              FROM duels d
              WHERE d.arena = $1 AND d."progressionAwarded" = true AND d."completedAt" >= $2 AND d."challengerSpAwarded" IS NOT NULL
              GROUP BY d."challengerId"
              UNION ALL
              SELECT d."opponentId" AS "userId", COALESCE(SUM(d."opponentSpAwarded"), 0) AS sp
              FROM duels d
              WHERE d.arena = $1 AND d."progressionAwarded" = true AND d."completedAt" >= $2 AND d."opponentSpAwarded" IS NOT NULL AND d."opponentId" IS NOT NULL
              GROUP BY d."opponentId"
            ) t
            WHERE t.sp > $3
            `,
            [arena, monthStart, userPoints],
          );
          actualRank = Number(count) + 1;
        }

        const selfDto = new DuelLeaderboardEntryDto();
        selfDto.rank = actualRank;
        selfDto.userId = requestingUser.id;
        selfDto.username = requestingUser.username;
        selfDto.avatarInitials = computeInitials(requestingUser.username);
        selfDto.avatarUrl = requestingUser.avatarUrl ?? null;
        selfDto.seasonPoints = userPoints;
        selfDto.rankTier = rankFromSeasonPoints(userPoints).rank;
        selfDto.isRequestingUser = true;

        entries.push(selfDto);
      }
    }

    return entries;
  }
}

function computeInitials(username: string): string {
  const words = username.trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}
