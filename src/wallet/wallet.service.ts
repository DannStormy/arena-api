import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { TransactionType } from './types/transaction-type.enum';
import { WalletResponseDto } from './dto/wallet-response.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { PaginatedQueryDto } from '../common/dto/paginated-query.dto';

const CREDIT_TYPES: TransactionType[] = [
  TransactionType.DEPOSIT,
  TransactionType.PRIZE_PAYOUT,
  TransactionType.REFUND,
];

const DEBIT_TYPES: TransactionType[] = [
  TransactionType.WITHDRAWAL,
  TransactionType.ENTRY_FEE,
];

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletsRepo: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly txRepo: Repository<WalletTransaction>,
  ) {}

  async createWallet(userId: string): Promise<Wallet> {
    const wallet = this.walletsRepo.create({ userId });

    return this.walletsRepo.save(wallet);
  }

  async findByUserId(userId: string): Promise<Wallet> {
    const wallet = await this.walletsRepo.findOne({ where: { userId } });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  async getBalance(walletId: string): Promise<string> {
    const result = await this.txRepo
      .createQueryBuilder('tx')
      .select(
        `COALESCE(SUM(CASE WHEN tx.type IN (:...creditTypes) THEN tx.amount::numeric ELSE 0 END) - ` +
          `SUM(CASE WHEN tx.type IN (:...debitTypes) THEN tx.amount::numeric ELSE 0 END), 0)`,
        'balance',
      )
      .where('tx.walletId = :walletId', { walletId })
      .setParameter('creditTypes', CREDIT_TYPES)
      .setParameter('debitTypes', DEBIT_TYPES)
      .getRawOne<{ balance: string }>();

    return result?.balance ?? '0';
  }

  async credit(
    walletId: string,
    amount: number,
    type: TransactionType,
    meta?: { reference?: string; description?: string; extra?: Record<string, unknown> },
  ): Promise<WalletTransaction> {
    const tx = this.txRepo.create({
      walletId,
      type,
      amount: amount.toFixed(2),
      reference: meta?.reference,
      description: meta?.description,
      meta: meta?.extra,
    });

    const saved = await this.txRepo.save(tx);

    this.logger.log(`Credit walletId=${walletId} amount=${amount} type=${type}`);

    return saved;
  }

  async debit(
    walletId: string,
    amount: number,
    type: TransactionType,
    meta?: { reference?: string; description?: string; extra?: Record<string, unknown> },
  ): Promise<WalletTransaction> {
    const balance = await this.getBalance(walletId);

    if (parseFloat(balance) < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const tx = this.txRepo.create({
      walletId,
      type,
      amount: amount.toFixed(2),
      reference: meta?.reference,
      description: meta?.description,
      meta: meta?.extra,
    });

    const saved = await this.txRepo.save(tx);

    this.logger.log(`Debit walletId=${walletId} amount=${amount} type=${type}`);

    return saved;
  }

  async getWalletSummary(userId: string): Promise<WalletResponseDto> {
    const wallet = await this.findByUserId(userId);
    const balance = await this.getBalance(wallet.id);

    const dto = new WalletResponseDto();

    dto.id = wallet.id;
    dto.userId = wallet.userId;
    dto.balance = balance;
    dto.createdAt = wallet.createdAt;

    return dto;
  }

  async listTransactions(
    userId: string,
    query: PaginatedQueryDto,
  ): Promise<PaginatedResponseDto<TransactionResponseDto>> {
    const wallet = await this.findByUserId(userId);

    const [transactions, total] = await this.txRepo.findAndCount({
      where: { walletId: wallet.id },
      order: { createdAt: query.order.toUpperCase() as 'ASC' | 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return new PaginatedResponseDto(
      transactions.map(TransactionResponseDto.fromEntity),
      total,
      query.page,
      query.limit,
    );
  }
}
