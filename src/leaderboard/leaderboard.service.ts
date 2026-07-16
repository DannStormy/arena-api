import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TournamentEntry } from '../tournaments/entities/tournament-entry.entity';
import { User } from '../users/entities/user.entity';
import { Duel } from '../duels/entities/duel.entity';
import { ProgressionProjection } from '../progression/entities/progression-projection.entity';
import { Ledger } from '../progression/types/ledger.enum';
import { LeaderboardEntryDto } from './dto/leaderboard-entry.dto';
import { DuelLeaderboardEntryDto } from './dto/duel-leaderboard-entry.dto';
import { LevelLeaderboardEntryDto } from './dto/level-leaderboard-entry.dto';
import { TournamentArena } from '../tournaments/types/tournament-arena.enum';
import { currentSeasonId } from '../duels/duel-progression';
import { PaginatedQueryDto } from '../common/dto/paginated-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

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
    @InjectRepository(ProgressionProjection)
    private readonly projectionRepo: Repository<ProgressionProjection>,
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

  /**
   * Paginated duel-rank leaderboard backed by the progression_projections table.
   *
   * Duel rank is a global per-season ledger — there are no per-arena projections.
   * The `arena` parameter is accepted for API consistency but does NOT filter results;
   * the FE should hide/disable the arena selector for this board.
   *
   * The requesting user's own row is appended to the page data even when they fall
   * outside the current page, so the FE can always highlight "YOU".
   */
  async getDuelLeaderboard(
    requestingUserId: string,
    query: PaginatedQueryDto,
    _arena?: TournamentArena,
  ): Promise<PaginatedResponseDto<DuelLeaderboardEntryDto>> {
    const seasonId = currentSeasonId();
    const monthStart = new Date(`${seasonId}-01T00:00:00.000Z`);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const [projections, total] = await this.projectionRepo.findAndCount({
      where: { ledger: Ledger.DUEL_RANK, seasonId },
      order: { total: 'DESC' },
      skip: offset,
      take: limit,
    });

    const topUserIds = projections.map((p) => p.userId);

    const [topUsers, gamesPlayedMap] = await Promise.all([
      topUserIds.length > 0
        ? this.usersRepo.createQueryBuilder('u').whereInIds(topUserIds).getMany()
        : Promise.resolve([]),
      this.getGamesPlayedForUsers(topUserIds, monthStart),
    ]);

    const userMap = new Map(topUsers.map((u) => [u.id, u]));

    const entries: DuelLeaderboardEntryDto[] = projections.map((proj, idx) => {
      const user = userMap.get(proj.userId);
      const dto = new DuelLeaderboardEntryDto();
      dto.rank = offset + idx + 1;
      dto.userId = proj.userId;
      dto.username = user?.username ?? '';
      dto.avatarInitials = computeInitials(user?.username ?? '');
      dto.avatarUrl = user?.avatarUrl ?? null;
      dto.rankPoints = proj.total;
      dto.tier = proj.tier ?? 'Spectator';
      dto.gamesPlayed = gamesPlayedMap.get(proj.userId) ?? 0;
      dto.isRequestingUser = proj.userId === requestingUserId;
      return dto;
    });

    const inPage = entries.some((e) => e.userId === requestingUserId);

    if (!inPage) {
      const myProj = await this.projectionRepo.findOne({
        where: { userId: requestingUserId, ledger: Ledger.DUEL_RANK, seasonId },
      });

      if (myProj) {
        const higherRow = await this.projectionRepo
          .createQueryBuilder('p')
          .select('COUNT(*)', 'count')
          .where('p.ledger = :ledger', { ledger: Ledger.DUEL_RANK })
          .andWhere('p.seasonId = :seasonId', { seasonId })
          .andWhere('p.total > :total', { total: myProj.total })
          .getRawOne<{ count: string }>();

        const actualRank = Number(higherRow?.count ?? 0) + 1;

        const [requestingUser, myGamesPlayed] = await Promise.all([
          this.usersRepo.findOne({ where: { id: requestingUserId } }),
          this.getGamesPlayedForUsers([requestingUserId], monthStart),
        ]);

        const selfDto = new DuelLeaderboardEntryDto();
        selfDto.rank = actualRank;
        selfDto.userId = requestingUserId;
        selfDto.username = requestingUser?.username ?? '';
        selfDto.avatarInitials = computeInitials(requestingUser?.username ?? '');
        selfDto.avatarUrl = requestingUser?.avatarUrl ?? null;
        selfDto.rankPoints = myProj.total;
        selfDto.tier = myProj.tier ?? 'Spectator';
        selfDto.gamesPlayed = myGamesPlayed.get(requestingUserId) ?? 0;
        selfDto.isRequestingUser = true;

        entries.push(selfDto);
      }
    }

    return new PaginatedResponseDto(entries, total, page, limit);
  }

  /**
   * All-time XP/level board. LEVEL projections are permanent (seasonId null) and
   * earned by ALL play — solo Speed Math, Memory, the Daily — so everyone who
   * plays climbs this, unlike the duel-rank board which needs live opponents.
   */
  async getLevelLeaderboard(
    requestingUserId: string,
    query: PaginatedQueryDto,
  ): Promise<PaginatedResponseDto<LevelLeaderboardEntryDto>> {
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const [projections, total] = await this.projectionRepo.findAndCount({
      where: { ledger: Ledger.LEVEL, seasonId: IsNull() },
      order: { total: 'DESC' },
      skip: offset,
      take: limit,
    });

    const topUserIds = projections.map((p) => p.userId);
    const topUsers =
      topUserIds.length > 0
        ? await this.usersRepo.createQueryBuilder('u').whereInIds(topUserIds).getMany()
        : [];
    const userMap = new Map(topUsers.map((u) => [u.id, u]));

    const build = (
      proj: ProgressionProjection,
      rank: number,
      user: User | undefined,
    ): LevelLeaderboardEntryDto => {
      const dto = new LevelLeaderboardEntryDto();
      dto.rank = rank;
      dto.userId = proj.userId;
      dto.username = user?.username ?? '';
      dto.avatarInitials = computeInitials(user?.username ?? '');
      dto.avatarUrl = user?.avatarUrl ?? null;
      dto.xp = proj.total;
      dto.level = proj.levelNumber ?? 1;
      dto.isRequestingUser = proj.userId === requestingUserId;
      return dto;
    };

    const entries = projections.map((proj, idx) =>
      build(proj, offset + idx + 1, userMap.get(proj.userId)),
    );

    // Append the caller's own line if they're off this page (rank = # above + 1).
    if (!entries.some((e) => e.userId === requestingUserId)) {
      const myProj = await this.projectionRepo.findOne({
        where: { userId: requestingUserId, ledger: Ledger.LEVEL, seasonId: IsNull() },
      });
      if (myProj) {
        const higher = await this.projectionRepo
          .createQueryBuilder('p')
          .select('COUNT(*)', 'count')
          .where('p.ledger = :ledger', { ledger: Ledger.LEVEL })
          .andWhere('p.seasonId IS NULL')
          .andWhere('p.total > :total', { total: myProj.total })
          .getRawOne<{ count: string }>();
        const me = await this.usersRepo.findOne({ where: { id: requestingUserId } });
        entries.push(build(myProj, Number(higher?.count ?? 0) + 1, me ?? undefined));
      }
    }

    return new PaginatedResponseDto(entries, total, page, limit);
  }

  private async getGamesPlayedForUsers(
    userIds: string[],
    monthStart: Date,
  ): Promise<Map<string, number>> {
    if (!userIds.length) return new Map();

    const rows = await this.duelsRepo.manager.query<{ userId: string; count: string }[]>(
      `
      SELECT t."userId", COUNT(*)::int AS count
      FROM (
        SELECT "challengerId" AS "userId"
        FROM duels
        WHERE "challengerId" = ANY($1)
          AND status = 'completed'
          AND "completedAt" >= $2
        UNION ALL
        SELECT "opponentId" AS "userId"
        FROM duels
        WHERE "opponentId" = ANY($1)
          AND status = 'completed'
          AND "completedAt" >= $2
          AND "opponentId" IS NOT NULL
      ) t
      GROUP BY t."userId"
      `,
      [userIds, monthStart],
    );

    return new Map(rows.map((r) => [r.userId, Number(r.count)]));
  }
}

function computeInitials(username: string): string {
  const words = username.trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}
