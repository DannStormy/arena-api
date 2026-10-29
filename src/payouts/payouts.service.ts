import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as Sentry from '@sentry/nestjs';
import { EntityManager, Repository } from 'typeorm';
import { Payout } from './entities/payout.entity';
import { PayoutStatus } from './payout-status.enum';
import { TournamentEntry } from '../tournaments/entities/tournament-entry.entity';
import { WalletService } from '../wallet/wallet.service';
import { TransactionType } from '../wallet/types/transaction-type.enum';
import { PaystackRejectedError, PaystackService } from '../services/paystack/paystack.service';

export const BANK_CHANGE_HOLD_MS = 48 * 60 * 60 * 1000;

export interface PayoutView {
  payoutId: string;
  status: PayoutStatus;
  transferCode: string | null;
  failureReason: string | null;
}

/**
 * Outbox for prize payouts. A payout row is the single source of truth: it is
 * created once per entry (unique), claimed with a conditional update before any
 * money moves, and only advanced by Paystack's answer or its signed webhook.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @InjectRepository(Payout)
    private readonly payoutsRepo: Repository<Payout>,
    @InjectRepository(TournamentEntry)
    private readonly entriesRepo: Repository<TournamentEntry>,
    private readonly walletService: WalletService,
    private readonly paystack: PaystackService,
  ) {}

  async requestAndDispatch(entryId: string, now = new Date()): Promise<PayoutView> {
    const payout = await this.request(entryId, now);
    return this.dispatch(payout.id);
  }

  async request(entryId: string, now = new Date()): Promise<Payout> {
    const entry = await this.entriesRepo.findOne({
      where: { id: entryId },
      relations: { user: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');

    const { user } = entry;
    if (!user.bankAccountNumber || !user.bankCode || !user.bankAccountName) {
      throw new BadRequestException('Winner has not set up bank details');
    }
    if (
      user.bankDetailsChangedAt &&
      now.getTime() - user.bankDetailsChangedAt.getTime() < BANK_CHANGE_HOLD_MS
    ) {
      throw new BadRequestException('Bank details changed in the last 48 hours; payout is on hold');
    }
    const prize = parseFloat(entry.prizeWon ?? '0');
    if (!(prize > 0)) throw new BadRequestException('No prize to pay out for this entry');

    const existing = await this.payoutsRepo.findOne({ where: { entryId } });
    if (existing) {
      if (existing.status === PayoutStatus.FAILED || existing.status === PayoutStatus.PENDING)
        return existing;
      throw new BadRequestException(`Payout already ${existing.status} for this entry`);
    }

    return this.payoutsRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Payout);
      const inserted = await repo
        .createQueryBuilder()
        .insert()
        .values({ entryId, userId: user.id, amountKobo: Math.round(prize * 100) })
        .orIgnore()
        .returning('*')
        .execute();
      const row = (inserted.raw as Payout[])[0];
      if (!row) throw new BadRequestException('Payout already requested for this entry');

      const wallet = await this.walletService.findByUserId(user.id);
      await this.walletService.credit(
        wallet.id,
        prize,
        TransactionType.PRIZE_PAYOUT,
        {
          reference: `payout:${row.id}:prize`,
          description: `Prize for tournament entry ${entryId}`,
          extra: { entryId },
        },
        manager,
      );
      return row;
    });
  }

  async dispatch(payoutId: string): Promise<PayoutView> {
    // Only one caller can move a payout out of pending/failed, so a double click sends once.
    const claimed = await this.payoutsRepo
      .createQueryBuilder()
      .update(Payout)
      .set({ status: PayoutStatus.PROCESSING, attempts: () => 'attempts + 1', failureReason: null })
      .where('id = :payoutId AND status IN (:...ready)', {
        payoutId,
        ready: [PayoutStatus.PENDING, PayoutStatus.FAILED],
      })
      .returning('*')
      .execute();
    const payout = (claimed.raw as Payout[])[0];
    if (!payout) {
      const current = await this.payoutsRepo.findOneOrFail({ where: { id: payoutId } });
      throw new BadRequestException(`Payout is ${current.status}, not ready to send`);
    }

    const entry = await this.entriesRepo.findOneOrFail({
      where: { id: payout.entryId },
      relations: { user: true },
    });
    const { user } = entry;
    const reference = payout.attempts > 1 ? `${payout.id}-r${payout.attempts}` : payout.id;

    try {
      const recipient = await this.paystack.createTransferRecipient(
        user.bankAccountName!,
        user.bankAccountNumber!,
        user.bankCode!,
      );
      const transferCode = await this.paystack.initiateTransfer(
        recipient,
        payout.amountKobo,
        `Arena prize payout ${payout.entryId}`,
        reference,
      );

      await this.payoutsRepo.manager.transaction(async (manager) => {
        await manager.getRepository(Payout).update(payout.id, {
          status: PayoutStatus.SENT,
          transferReference: reference,
          transferCode,
        });
        await this.recordWithdrawal(manager, payout, user.id);
      });
      this.logger.log(`Payout sent: ${payout.id} transfer=${transferCode}`);
      return this.view(payout.id);
    } catch (err) {
      if (err instanceof PaystackRejectedError) {
        await this.payoutsRepo.update(payout.id, {
          status: PayoutStatus.FAILED,
          failureReason: err.message,
        });
        this.logger.warn(`Payout rejected by Paystack: ${payout.id} ${err.message}`);
        Sentry.captureMessage(`Payout rejected by Paystack: ${payout.id}`, 'warning');
        return this.view(payout.id);
      }
      // Outcome unknown: leave it PROCESSING with the reference recorded for reconciliation.
      await this.payoutsRepo.update(payout.id, {
        transferReference: reference,
        failureReason: String(err),
      });
      this.logger.error(
        `Payout outcome unknown, needs reconciliation: ${payout.id} ${String(err)}`,
      );
      Sentry.captureMessage(`Payout outcome unknown, needs reconciliation: ${payout.id}`, 'error');
      throw err;
    }
  }

  async handleTransferEvent(
    event: string,
    reference: string | undefined,
    reason?: string,
  ): Promise<void> {
    if (!reference) return;
    const payout = await this.payoutsRepo.findOne({ where: { transferReference: reference } });
    if (!payout) {
      this.logger.warn(`Webhook for unknown transfer reference ${reference}`);
      return;
    }

    if (event === 'transfer.success') {
      await this.transition(payout.id, [PayoutStatus.SENT, PayoutStatus.PROCESSING], {
        status: PayoutStatus.CONFIRMED,
      });
      return;
    }

    if (event === 'transfer.failed' || event === 'transfer.reversed') {
      await this.payoutsRepo.manager.transaction(async (manager) => {
        const moved = await this.transition(
          payout.id,
          [PayoutStatus.SENT, PayoutStatus.PROCESSING],
          { status: PayoutStatus.FAILED, failureReason: reason ?? event },
          manager,
        );
        if (!moved) return;
        const wallet = await this.walletService.findByUserId(payout.userId);
        // The withdrawal for this attempt is undone so the prize sits in the wallet for a retry.
        await this.walletService.credit(
          wallet.id,
          payout.amountKobo / 100,
          TransactionType.REFUND,
          {
            reference: `payout:${payout.id}:refund:${payout.attempts}`,
            description: `Payout ${event}`,
            extra: { payoutId: payout.id },
          },
          manager,
        );
      });
    }
  }

  private async recordWithdrawal(
    manager: EntityManager,
    payout: Payout,
    userId: string,
  ): Promise<void> {
    const wallet = await this.walletService.findByUserId(userId);
    await this.walletService.debit(
      wallet.id,
      payout.amountKobo / 100,
      TransactionType.WITHDRAWAL,
      {
        reference: `payout:${payout.id}:withdrawal:${payout.attempts}`,
        description: `Prize sent to bank for entry ${payout.entryId}`,
        extra: { payoutId: payout.id },
      },
      manager,
    );
  }

  private async transition(
    payoutId: string,
    from: PayoutStatus[],
    set: Partial<Payout>,
    manager: EntityManager = this.payoutsRepo.manager,
  ): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .update(Payout)
      .set(set)
      .where('id = :payoutId AND status IN (:...from)', { payoutId, from })
      .execute();
    return Boolean(result.affected);
  }

  private async view(payoutId: string): Promise<PayoutView> {
    const p = await this.payoutsRepo.findOneOrFail({ where: { id: payoutId } });
    return {
      payoutId: p.id,
      status: p.status,
      transferCode: p.transferCode,
      failureReason: p.failureReason,
    };
  }
}
