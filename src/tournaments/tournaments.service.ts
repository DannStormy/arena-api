import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tournament } from './entities/tournament.entity';
import { TournamentEntry, EntryStatus } from './entities/tournament-entry.entity';
import { GameSession } from '../game-sessions/entities/game-session.entity';
import { SessionStatus } from '../game-sessions/types/session-status.enum';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { TournamentResponseDto } from './dto/tournament-response.dto';
import { TournamentListItemDto } from './dto/tournament-list-item.dto';
import { TournamentHistoryItemDto } from './dto/tournament-history-item.dto';
import { TournamentStatus } from './types/tournament-status.enum';
import { ListTournamentsParams } from './types/list-tournaments-params';
import { AllowedTargetStatus } from './dto/update-tournament-status.dto';
import { WalletService } from '../wallet/wallet.service';
import { TransactionType } from '../wallet/types/transaction-type.enum';
import { PaginatedQueryDto } from '../common/dto/paginated-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { LeaderboardEntryDto } from '../leaderboard/dto/leaderboard-entry.dto';
import { ProgressionAwardService } from '../progression/services/progression-award.service';

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(
    @InjectRepository(Tournament)
    private readonly tournamentsRepo: Repository<Tournament>,
    @InjectRepository(TournamentEntry)
    private readonly entriesRepo: Repository<TournamentEntry>,
    @InjectRepository(GameSession)
    private readonly sessionsRepo: Repository<GameSession>,
    private readonly walletService: WalletService,
    private readonly progressionAwardService: ProgressionAwardService,
  ) {}

  async create(createdBy: string, dto: CreateTournamentDto): Promise<TournamentResponseDto> {
    const tournament = this.tournamentsRepo.create({
      ...dto,
      entryFee: dto.entryFee?.toFixed(2),
      prizeFirst: dto.prizeFirst.toFixed(2),
      prizeSecond: dto.prizeSecond?.toFixed(2),
      prizeThird: dto.prizeThird?.toFixed(2),
      minPlayers: dto.minPlayers ?? 10,
      createdBy,
    });

    const saved = await this.tournamentsRepo.save(tournament);

    this.logger.log(`Tournament created: ${saved.id} by ${createdBy}`);

    return TournamentResponseDto.fromEntity(saved);
  }

  async findOne(id: string, userId?: string): Promise<TournamentResponseDto> {
    const tournament = await this.tournamentsRepo.findOne({ where: { id } });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const [entryCount, userEntry, userSession] = await Promise.all([
      this.entriesRepo.count({ where: { tournamentId: id } }),
      userId
        ? this.entriesRepo.findOne({ where: { tournamentId: id, userId } })
        : Promise.resolve(null),
      userId
        ? this.sessionsRepo.findOne({
            where: { tournamentId: id, userId, status: SessionStatus.COMPLETED },
            order: { startedAt: 'DESC' },
          })
        : Promise.resolve(null),
    ]);

    return TournamentResponseDto.fromEntity(tournament, {
      entryCount,
      hasJoined: userEntry !== null,
      userEntry: userEntry
        ? {
            score: userEntry.score,
            totalAnswered: userSession?.totalAnswered ?? 0,
            status: userEntry.status,
            rank: userEntry.rank ?? null,
            prizeWon: userEntry.prizeWon ?? null,
          }
        : null,
    });
  }

  async list(params: ListTournamentsParams): Promise<PaginatedResponseDto<TournamentListItemDto>> {
    const qb = this.tournamentsRepo.createQueryBuilder('t');

    if (params.search) {
      qb.andWhere('t.title ILIKE :search', { search: `%${params.search}%` });
    }

    if (params.arena) {
      qb.andWhere('t.arena = :arena', { arena: params.arena });
    }

    if (params.status) {
      qb.andWhere('t.status = :status', { status: params.status });
    }

    if (params.gameType) {
      qb.andWhere('t.gameType = :gameType', { gameType: params.gameType });
    }

    qb.orderBy('t.createdAt', params.order.toUpperCase() as 'ASC' | 'DESC');
    qb.skip((params.page - 1) * params.limit);
    qb.take(params.limit);

    const [tournaments, total] = await qb.getManyAndCount();

    let countMap = new Map<string, number>();
    let joinedIds = new Set<string>();

    if (tournaments.length > 0) {
      const ids = tournaments.map((t) => t.id);

      const [counts, joined] = await Promise.all([
        this.entriesRepo
          .createQueryBuilder('e')
          .select('e.tournamentId', 'tournamentId')
          .addSelect('COUNT(e.id)::int', 'count')
          .where('e.tournamentId IN (:...ids)', { ids })
          .groupBy('e.tournamentId')
          .getRawMany<{ tournamentId: string; count: string }>(),
        params.userId
          ? this.entriesRepo
              .createQueryBuilder('e')
              .select('e.tournamentId', 'tournamentId')
              .where('e.tournamentId IN (:...ids)', { ids })
              .andWhere('e.userId = :userId', { userId: params.userId })
              .getRawMany<{ tournamentId: string }>()
          : Promise.resolve([] as { tournamentId: string }[]),
      ]);

      countMap = new Map(counts.map((c) => [c.tournamentId, Number(c.count)]));
      joinedIds = new Set(joined.map((r) => r.tournamentId));
    }

    return new PaginatedResponseDto(
      tournaments.map((t) =>
        TournamentListItemDto.fromEntity(t, countMap.get(t.id) ?? 0, joinedIds.has(t.id)),
      ),
      total,
      params.page,
      params.limit,
    );
  }

  async joinTournament(
    tournamentId: string,
    userId: string,
  ): Promise<{ success: true; entryId: string }> {
    const tournament = await this.tournamentsRepo
      .createQueryBuilder('t')
      .where('t.id = :tournamentId', { tournamentId })
      .getOne();

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.status !== TournamentStatus.OPEN) {
      throw new BadRequestException('Tournament is not open for registration');
    }

    if (tournament.maxPlayers) {
      const entryCount = await this.entriesRepo.count({ where: { tournamentId } });

      if (entryCount >= tournament.maxPlayers) {
        throw new BadRequestException('Tournament is full');
      }
    }

    const existing = await this.entriesRepo.findOne({ where: { tournamentId, userId } });

    if (existing) {
      throw new BadRequestException('Already registered for this tournament');
    }

    const wallet = await this.walletService.findByUserId(userId);
    const entryFee = parseFloat(tournament.entryFee);

    if (entryFee > 0) {
      await this.walletService.debit(wallet.id, entryFee, TransactionType.ENTRY_FEE, {
        reference: `entry:${tournamentId}:${userId}`,
        description: `Entry fee for tournament: ${tournament.title}`,
      });
    }

    const entry = this.entriesRepo.create({
      tournamentId,
      userId,
      entryFeePaid: tournament.entryFee,
    });

    const saved = await this.entriesRepo.save(entry);

    this.logger.log(`User ${userId} joined tournament ${tournamentId}`);

    return { success: true, entryId: saved.id };
  }

  async cancelTournament(tournamentId: string): Promise<void> {
    const tournament = await this.tournamentsRepo.findOne({ where: { id: tournamentId } });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const entries = await this.entriesRepo.find({ where: { tournamentId } });

    for (const entry of entries) {
      const fee = parseFloat(entry.entryFeePaid);

      if (fee > 0) {
        const wallet = await this.walletService.findByUserId(entry.userId);

        await this.walletService.credit(wallet.id, fee, TransactionType.REFUND, {
          description: `Refund for cancelled tournament: ${tournament.title}`,
        });
      }
    }

    await this.tournamentsRepo.update(tournamentId, { status: TournamentStatus.CANCELLED });

    this.logger.log(`Tournament cancelled: ${tournamentId} — ${entries.length} entries refunded`);
  }

  async getTournamentLeaderboard(tournamentId: string): Promise<LeaderboardEntryDto[]> {
    const rows = await this.entriesRepo
      .createQueryBuilder('e')
      .innerJoin('users', 'u', 'u.id = e.userId')
      .select([
        'e.userId       AS "userId"',
        'e.score        AS "score"',
        'e."prizeWon"   AS "prizeWon"',
        'u.username     AS "username"',
        'u.avatarUrl    AS "avatarUrl"',
      ])
      .where('e.tournamentId = :tournamentId', { tournamentId })
      .orderBy('e.score', 'DESC')
      .getRawMany<{
        userId: string;
        score: string;
        prizeWon: string | null;
        username: string;
        avatarUrl: string | null;
      }>();

    return rows.map((row, idx) => {
      const dto = new LeaderboardEntryDto();

      dto.rank = idx + 1;
      dto.userId = row.userId;
      dto.username = row.username;
      dto.avatarUrl = row.avatarUrl ?? '';
      dto.totalPrizeWon = row.prizeWon ?? '0';
      dto.tournamentsPlayed = 1;

      return dto;
    });
  }

  async updateStatus(tournamentId: string, next: AllowedTargetStatus): Promise<{ success: true }> {
    const tournament = await this.tournamentsRepo.findOne({ where: { id: tournamentId } });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const { status: current } = tournament;

    const allowed: Partial<Record<TournamentStatus, TournamentStatus[]>> = {
      [TournamentStatus.DRAFT]: [TournamentStatus.OPEN],
      [TournamentStatus.OPEN]: [TournamentStatus.IN_PROGRESS, TournamentStatus.CANCELLED],
      [TournamentStatus.IN_PROGRESS]: [TournamentStatus.COMPLETED, TournamentStatus.CANCELLED],
    };

    if (!allowed[current]?.includes(next)) {
      throw new UnprocessableEntityException(
        `Cannot transition tournament from '${current}' to '${next}'`,
      );
    }

    const timestamps: Partial<Tournament> = {};

    if (next === TournamentStatus.IN_PROGRESS) {
      timestamps.startedAt = new Date();
    }

    if (next === TournamentStatus.COMPLETED) {
      timestamps.completedAt = new Date();
    }

    if (next === TournamentStatus.CANCELLED) {
      await this.cancelTournament(tournamentId);

      return { success: true };
    }

    await this.tournamentsRepo.update(tournamentId, { status: next, ...timestamps });

    this.logger.log(`Tournament ${tournamentId} status: ${current} → ${next}`);

    if (next === TournamentStatus.COMPLETED) {
      this.progressionAwardService.awardTournamentResult(tournamentId).catch((err: unknown) => {
        this.logger.error(
          `Progression award failed for tournament ${tournamentId} — result unaffected`,
          err,
        );
      });
    }

    return { success: true };
  }

  async getTournamentHistory(
    userId: string,
    query: PaginatedQueryDto,
  ): Promise<PaginatedResponseDto<TournamentHistoryItemDto>> {
    const total = await this.entriesRepo.count({ where: { userId } });

    if (total === 0) {
      return new PaginatedResponseDto([], 0, query.page, query.limit);
    }

    const order = query.order.toUpperCase() as 'ASC' | 'DESC';

    const rows = await this.entriesRepo
      .createQueryBuilder('e')
      .innerJoin('tournaments', 't', 't.id = e."tournamentId"')
      .select([
        'e."tournamentId"   AS "tournamentId"',
        'e.score            AS "score"',
        'e."prizeWon"       AS "prizeWon"',
        'e."joinedAt"       AS "playedAt"',
        't.title            AS "name"',
        't.arena            AS "arena"',
        't."gameType"       AS "gameType"',
        't.status           AS "tournamentStatus"',
        't."completedAt"    AS "completedAt"',
        `(SELECT COUNT(*)::int FROM tournament_entries e2 WHERE e2."tournamentId" = e."tournamentId" AND e2.score > e.score) + 1 AS "rank"`,
        `(SELECT COUNT(*)::int FROM tournament_entries e3 WHERE e3."tournamentId" = e."tournamentId") AS "totalPlayers"`,
      ])
      .where('e."userId" = :userId', { userId })
      .orderBy('e."joinedAt"', order)
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .getRawMany<Parameters<typeof TournamentHistoryItemDto.fromRaw>[0]>();

    return new PaginatedResponseDto(
      rows.map(TournamentHistoryItemDto.fromRaw),
      total,
      query.page,
      query.limit,
    );
  }

  async updateEntryScore(tournamentId: string, userId: string, score: number): Promise<void> {
    await this.entriesRepo
      .createQueryBuilder()
      .update(TournamentEntry)
      .set({ score, status: EntryStatus.COMPLETED })
      .where('tournamentId = :tournamentId AND userId = :userId', { tournamentId, userId })
      .execute();
  }
}
