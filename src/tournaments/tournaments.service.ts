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
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { TournamentResponseDto } from './dto/tournament-response.dto';
import { TournamentListItemDto } from './dto/tournament-list-item.dto';
import { TournamentStatus } from './types/tournament-status.enum';
import { ListTournamentsParams } from './types/list-tournaments-params';
import { AllowedTargetStatus } from './dto/update-tournament-status.dto';
import { WalletService } from '../wallet/wallet.service';
import { TransactionType } from '../wallet/types/transaction-type.enum';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { LeaderboardEntryDto } from '../leaderboard/dto/leaderboard-entry.dto';

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(
    @InjectRepository(Tournament)
    private readonly tournamentsRepo: Repository<Tournament>,
    @InjectRepository(TournamentEntry)
    private readonly entriesRepo: Repository<TournamentEntry>,
    private readonly walletService: WalletService,
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

  async findOne(id: string): Promise<TournamentResponseDto> {
    const tournament = await this.tournamentsRepo.findOne({ where: { id } });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    return TournamentResponseDto.fromEntity(tournament);
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

    return new PaginatedResponseDto(
      tournaments.map(TournamentListItemDto.fromEntity),
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
        'e.prize_won    AS "prizeWon"',
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

    return { success: true };
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
