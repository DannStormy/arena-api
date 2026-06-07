import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tournament } from '../tournaments/entities/tournament.entity';
import { TournamentEntry } from '../tournaments/entities/tournament-entry.entity';
import { GameSession } from '../game-sessions/entities/game-session.entity';
import { WalletTransaction } from '../wallet/entities/wallet-transaction.entity';
import { User } from '../users/entities/user.entity';
import { Question } from '../questions/entities/question.entity';
import { GameAnswer } from '../game-sessions/entities/game-answer.entity';
import { AdminTournamentQueryDto } from './dto/admin-tournament-query.dto';
import { AdminQuestionsQueryDto } from './dto/admin-questions-query.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { ResolveSessionDto } from './dto/resolve-session.dto';
import { TriggerPayoutDto } from './dto/trigger-payout.dto';
import { PaginatedQueryDto } from '../common/dto/paginated-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { SessionStatus } from '../game-sessions/types/session-status.enum';
import { TournamentStatus } from '../tournaments/types/tournament-status.enum';
import { TransactionType } from '../wallet/types/transaction-type.enum';
import { WalletService } from '../wallet/wallet.service';
import { PaystackService } from '../services/paystack/paystack.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(Tournament)
    private readonly tournamentsRepo: Repository<Tournament>,
    @InjectRepository(TournamentEntry)
    private readonly entriesRepo: Repository<TournamentEntry>,
    @InjectRepository(GameSession)
    private readonly sessionsRepo: Repository<GameSession>,
    @InjectRepository(WalletTransaction)
    private readonly txRepo: Repository<WalletTransaction>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Question)
    private readonly questionsRepo: Repository<Question>,
    @InjectRepository(GameAnswer)
    private readonly answersRepo: Repository<GameAnswer>,
    private readonly walletService: WalletService,
    private readonly paystackService: PaystackService,
  ) {}

  async listTournaments(query: AdminTournamentQueryDto) {
    const qb = this.tournamentsRepo.createQueryBuilder('t');

    if (query.status) qb.andWhere('t.status = :status', { status: query.status });
    if (query.arena) qb.andWhere('t.arena = :arena', { arena: query.arena });
    if (query.search) qb.andWhere('t.title ILIKE :search', { search: `%${query.search}%` });

    const total = await qb.clone().getCount();

    const tournaments = await qb
      .orderBy('t.createdAt', query.order === 'asc' ? 'ASC' : 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();

    let countMap = new Map<string, number>();

    if (tournaments.length > 0) {
      const ids = tournaments.map((t) => t.id);
      const counts = await this.entriesRepo
        .createQueryBuilder('e')
        .select('e.tournamentId', 'tournamentId')
        .addSelect('COUNT(e.id)::int', 'count')
        .where('e.tournamentId IN (:...ids)', { ids })
        .groupBy('e.tournamentId')
        .getRawMany<{ tournamentId: string; count: string }>();

      countMap = new Map(counts.map((c) => [c.tournamentId, Number(c.count)]));
    }

    const dtos = tournaments.map((t) => ({ ...t, entryCount: countMap.get(t.id) ?? 0 }));

    return new PaginatedResponseDto(dtos, total, query.page, query.limit);
  }

  async getTournament(tournamentId: string) {
    const tournament = await this.tournamentsRepo.findOne({ where: { id: tournamentId } });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const entries = await this.entriesRepo.findAndCount({
      where: { tournamentId },
      relations: { user: true },
      order: { rank: 'ASC' },
    });

    const [entryList] = entries;

    return {
      ...tournament,
      entries: entryList.map((e) => ({
        id: e.id,
        userId: e.userId,
        username: e.user.username,
        score: e.score,
        rank: e.rank,
        prizeWon: e.prizeWon,
        status: e.status,
        joinedAt: e.joinedAt,
      })),
    };
  }

  async listTournamentEntries(tournamentId: string, query: PaginatedQueryDto) {
    const exists = await this.tournamentsRepo.findOne({ where: { id: tournamentId } });

    if (!exists) {
      throw new NotFoundException('Tournament not found');
    }

    const [entries, total] = await this.entriesRepo.findAndCount({
      where: { tournamentId },
      relations: { user: true },
      order: { joinedAt: query.order === 'asc' ? 'ASC' : 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    const dtos = entries.map((e) => ({
      id: e.id,
      userId: e.userId,
      username: e.user.username,
      score: e.score,
      rank: e.rank,
      prizeWon: e.prizeWon,
      entryFeePaid: e.entryFeePaid,
      status: e.status,
      joinedAt: e.joinedAt,
    }));

    return new PaginatedResponseDto(dtos, total, query.page, query.limit);
  }

  async listFlaggedSessions(query: PaginatedQueryDto) {
    const baseQb = this.sessionsRepo
      .createQueryBuilder('s')
      .innerJoin('users', 'u', 'u.id::text = s."userId"')
      .innerJoin('tournaments', 't', 't.id = s.tournamentId')
      .where('s.isFlagged = :flagged', { flagged: true });

    const total = await baseQb.clone().getCount();

    const rows = await baseQb
      .select('s.id', 'id')
      .addSelect('s.userId', 'userId')
      .addSelect('u.username', 'username')
      .addSelect('s.tournamentId', 'tournamentId')
      .addSelect('t.title', 'tournamentTitle')
      .addSelect('s.score', 'score')
      .addSelect('s.totalAnswered', 'totalAnswered')
      .addSelect('s.flagReason', 'flagReason')
      .addSelect('s.startedAt', 'startedAt')
      .orderBy('s.startedAt', query.order === 'asc' ? 'ASC' : 'DESC')
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany();

    return new PaginatedResponseDto(rows, total, query.page, query.limit);
  }

  async resolveSession(sessionId: string, dto: ResolveSessionDto): Promise<{ success: true }> {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId } });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (dto.action === 'clear') {
      await this.sessionsRepo.update(sessionId, { isFlagged: false });
    } else {
      await this.sessionsRepo.update(sessionId, { status: SessionStatus.FLAGGED });

      await this.entriesRepo
        .createQueryBuilder()
        .update(TournamentEntry)
        .set({ score: 0 })
        .where('tournamentId = :tid AND userId = :uid', {
          tid: session.tournamentId,
          uid: session.userId,
        })
        .execute();
    }

    this.logger.log(`Session ${sessionId} resolved: action=${dto.action}`);

    return { success: true };
  }

async getPendingPayouts() {
  const qb = this.entriesRepo
    .createQueryBuilder('e')
    .innerJoin('tournaments', 't', 't.id = e."tournamentId"')
    .innerJoin('users', 'u', 'u.id = e."userId"')
    .leftJoin(
      'wallet_transactions',
      'wt',
      "wt.type = 'prize_payout' AND wt.meta->>'entryId' = e.id::text",
    )
    .where('t.status = :status', { status: TournamentStatus.COMPLETED })
    .andWhere('e."prizeWon" IS NOT NULL')
    .andWhere('e."prizeWon" > 0')
    .andWhere('wt.id IS NULL')
    .select([
      'e.id AS "entryId"',
      'e."userId" AS "userId"',
      'e."tournamentId" AS "tournamentId"',
      't.title AS "tournamentTitle"',
      'u.username AS "username"',
      'u."bankAccountNumber" AS "bankAccountNumber"',
      'u."bankCode" AS "bankCode"',
      'u."bankAccountName" AS "bankAccountName"',
      'e."prizeWon" AS "prizeWon"',
    ]);

  console.log('PAYOUTS SQL:', qb.getSql());

  type PayoutRow = {
    entryId: string;
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    username: string;
    bankAccountNumber: string | null;
    bankCode: string | null;
    bankAccountName: string | null;
    prizeWon: string;
  };

  const rows = await qb.getRawMany<PayoutRow>();

  const grouped = new Map<string, { tournamentId: string; tournamentTitle: string; winners: PayoutRow[] }>();

  for (const row of rows) {
    if (!grouped.has(row.tournamentId)) {
      grouped.set(row.tournamentId, {
        tournamentId: row.tournamentId,
        tournamentTitle: row.tournamentTitle,
        winners: [],
      });
    }

    grouped.get(row.tournamentId)!.winners.push(row);
  }

  return Array.from(grouped.values());
}

  async triggerPayout(dto: TriggerPayoutDto): Promise<{ success: true; transferCode: string }> {
    const entry = await this.entriesRepo.findOne({
      where: { id: dto.entryId },
      relations: { user: true },
    });

    if (!entry) {
      throw new NotFoundException('Entry not found');
    }

    const { user } = entry;

    if (!user.bankAccountNumber || !user.bankCode || !user.bankAccountName) {
      throw new BadRequestException('Winner has not set up bank details');
    }

    if (!entry.prizeWon || parseFloat(entry.prizeWon) <= 0) {
      throw new BadRequestException('No prize to pay out for this entry');
    }

    const alreadyPaid = await this.txRepo
      .createQueryBuilder('wt')
      .where("wt.type = 'prize_payout'")
      .andWhere("wt.meta->>'entryId' = :entryId", { entryId: dto.entryId })
      .getOne();

    if (alreadyPaid) {
      throw new BadRequestException('Payout already sent for this entry');
    }

    const amountKobo = Math.round(parseFloat(entry.prizeWon) * 100);

    const recipientCode = await this.paystackService.createTransferRecipient(
      user.bankAccountName,
      user.bankAccountNumber,
      user.bankCode,
    );

    const transferCode = await this.paystackService.initiateTransfer(
      recipientCode,
      amountKobo,
      `Prize payout for entry ${dto.entryId}`,
    );

    const wallet = await this.walletService.findByUserId(user.id);

    await this.walletService.credit(
      wallet.id,
      parseFloat(entry.prizeWon),
      TransactionType.PRIZE_PAYOUT,
      {
        reference: transferCode,
        description: `Prize payout for tournament entry ${dto.entryId}`,
        extra: { entryId: dto.entryId, transferCode },
      },
    );

    this.logger.log(`Payout triggered: entryId=${dto.entryId} transferCode=${transferCode}`);

    return { success: true, transferCode };
  }

  async getStats(): Promise<{
    totalUsers: number;
    activeTournaments: number;
    flaggedSessions: number;
    pendingPayouts: number;
  }> {
    const [totalUsers, activeTournaments, flaggedSessions, pendingPayouts] = await Promise.all([
      this.usersRepo.count(),
      this.tournamentsRepo.count({
        where: [{ status: TournamentStatus.OPEN }, { status: TournamentStatus.IN_PROGRESS }],
      }),
      this.sessionsRepo.count({ where: { isFlagged: true } }),
      this.entriesRepo
        .createQueryBuilder('e')
        .innerJoin('tournaments', 't', 't.id = e."tournamentId"')
        .leftJoin(
          'wallet_transactions',
          'wt',
          "wt.type = 'prize_payout' AND wt.meta->>'entryId' = e.id::text",
        )
        .where('t.status = :status', { status: TournamentStatus.COMPLETED })
        .andWhere('e."prizeWon" IS NOT NULL')
        .andWhere('e."prizeWon" > 0')
        .andWhere('wt.id IS NULL')
        .getCount(),
    ]);

    return { totalUsers, activeTournaments, flaggedSessions, pendingPayouts };
  }

  async listQuestions(query: AdminQuestionsQueryDto) {
    const where: { category?: Question['category']; difficulty?: Question['difficulty'] } = {};

    if (query.category) where.category = query.category;
    if (query.difficulty) where.difficulty = query.difficulty;

    const [questions, total] = await this.questionsRepo.findAndCount({
      where,
      order: { createdAt: query.order === 'asc' ? 'ASC' : 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return new PaginatedResponseDto(questions, total, query.page, query.limit);
  }

  async updateQuestion(questionId: string, dto: UpdateQuestionDto): Promise<{ success: true }> {
    const question = await this.questionsRepo.findOne({ where: { id: questionId } });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    await this.questionsRepo.update(questionId, dto);

    this.logger.log(`Question updated: ${questionId}`);

    return { success: true };
  }

  async deleteQuestion(questionId: string): Promise<void> {
    const question = await this.questionsRepo.findOne({ where: { id: questionId } });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const hasHistory = await this.answersRepo.exists({ where: { questionId } });

    if (hasHistory) {
      throw new BadRequestException(
        'This question has answer history and cannot be deleted. Deactivate it instead.',
      );
    }

    await this.questionsRepo.delete(questionId);

    this.logger.log(`Question deleted: ${questionId}`);
  }
}
