import 'dotenv/config';
import { join } from 'path';
import { Client } from 'pg';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PayoutsModule } from '../../src/payouts/payouts.module';
import { PayoutsService } from '../../src/payouts/payouts.service';
import { PayoutStatus } from '../../src/payouts/payout-status.enum';
import { WalletModule } from '../../src/wallet/wallet.module';
import { WalletService } from '../../src/wallet/wallet.service';
import { TransactionType } from '../../src/wallet/types/transaction-type.enum';
import { TournamentsModule } from '../../src/tournaments/tournaments.module';
import { TournamentsService } from '../../src/tournaments/tournaments.service';
import { PaystackService } from '../../src/services/paystack/paystack.service';
import { User } from '../../src/users/entities/user.entity';
import { Tournament } from '../../src/tournaments/entities/tournament.entity';
import { TournamentEntry } from '../../src/tournaments/entities/tournament-entry.entity';
import { TournamentStatus } from '../../src/tournaments/types/tournament-status.enum';
import { TournamentArena } from '../../src/tournaments/types/tournament-arena.enum';
import { GameType } from '../../src/game-sessions/types/game-type.enum';

const TEST_DB = 'arena_phase0_int';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pgAdmin = () =>
  new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });

const paystack = {
  createTransferRecipient: jest.fn(async () => 'RCP_test'),
  initiateTransfer: jest.fn(async (_r: string, _a: number, _why: string, reference: string) => {
    await sleep(50);
    return `TRF_${reference}`;
  }),
  resolveAccount: jest.fn(async () => 'TEST USER'),
};

describe('Phase 0 integrity against Postgres', () => {
  let db: DataSource;
  let payouts: PayoutsService;
  let wallets: WalletService;
  let tournaments: TournamentsService;
  let users: Repository<User>;
  let tournamentsRepo: Repository<Tournament>;
  let entries: Repository<TournamentEntry>;
  let n = 0;

  beforeAll(async () => {
    const admin = pgAdmin();
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await admin.query(`CREATE DATABASE ${TEST_DB}`);
    await admin.end();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT),
          username: process.env.DB_USERNAME,
          password: process.env.DB_PASSWORD,
          database: TEST_DB,
          entities: [join(__dirname, '../../src/**/*.entity.ts')],
          migrations: [join(__dirname, '../../src/database/migrations/*.ts')],
          migrationsRun: true,
          synchronize: false,
        }),
        TypeOrmModule.forFeature([User, Tournament, TournamentEntry]),
        PayoutsModule,
        WalletModule,
        TournamentsModule,
      ],
    })
      .overrideProvider(PaystackService)
      .useValue(paystack)
      .compile();

    db = moduleRef.get(DataSource);
    payouts = moduleRef.get(PayoutsService);
    wallets = moduleRef.get(WalletService);
    tournaments = moduleRef.get(TournamentsService);
    users = moduleRef.get(getRepositoryToken(User));
    tournamentsRepo = moduleRef.get(getRepositoryToken(Tournament));
    entries = moduleRef.get(getRepositoryToken(TournamentEntry));
  });

  afterAll(async () => {
    await db?.destroy();
  });

  beforeEach(() => jest.clearAllMocks());

  async function makeUser(bank = true): Promise<User> {
    n++;
    const user = await users.save(
      users.create({
        email: `p0_${n}@test.dev`,
        username: `p0_${n}`,
        password: 'x',
        referralCode: `P0REF${n}`,
        ...(bank
          ? { bankAccountNumber: '0123456789', bankCode: '058', bankAccountName: 'TEST USER' }
          : {}),
      }),
    );
    await wallets.createWallet(user.id);
    return user;
  }

  async function makeTournament(status: TournamentStatus, maxPlayers = 10): Promise<Tournament> {
    return tournamentsRepo.save(
      tournamentsRepo.create({
        title: `t${++n}`,
        arena: TournamentArena.NAIJA_STREET_SMARTS,
        gameType: GameType.LIGHTNING_TRIVIA,
        entryFee: '0',
        prizeFirst: '5000',
        maxPlayers,
        status,
        createdBy: 'test',
      }),
    );
  }

  async function winningEntry(user: User, prize = '5000'): Promise<TournamentEntry> {
    const t = await makeTournament(TournamentStatus.COMPLETED);
    return entries.save(entries.create({ tournamentId: t.id, userId: user.id, prizeWon: prize }));
  }

  const balanceOf = async (user: User) =>
    parseFloat(await wallets.getBalance((await wallets.findByUserId(user.id)).id));

  it('a double-clicked payout sends exactly one transfer and nets the wallet to zero', async () => {
    const user = await makeUser();
    const entry = await winningEntry(user);

    const results = await Promise.allSettled([
      payouts.requestAndDispatch(entry.id),
      payouts.requestAndDispatch(entry.id),
    ]);

    expect(paystack.initiateTransfer).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balanceOf(user)).toBe(0);
  });

  it('a failed transfer refunds once, retries with a new reference, then confirms', async () => {
    const user = await makeUser();
    const entry = await winningEntry(user);
    const sent = await payouts.requestAndDispatch(entry.id);
    expect(sent.status).toBe(PayoutStatus.SENT);
    const firstRef = (paystack.initiateTransfer.mock.calls[0] as unknown[])[3] as string;

    await payouts.handleTransferEvent('transfer.failed', firstRef, 'bank down');
    await payouts.handleTransferEvent('transfer.failed', firstRef, 'bank down');
    expect(await balanceOf(user)).toBe(5000);

    const retried = await payouts.requestAndDispatch(entry.id);
    expect(retried.status).toBe(PayoutStatus.SENT);
    const secondRef = (paystack.initiateTransfer.mock.calls[1] as unknown[])[3] as string;
    expect(secondRef).not.toBe(firstRef);
    expect(await balanceOf(user)).toBe(0);

    await payouts.handleTransferEvent('transfer.success', secondRef);
    await expect(payouts.requestAndDispatch(entry.id)).rejects.toThrow('already confirmed');
  });

  it('holds payouts for 48 hours after a bank change', async () => {
    const user = await makeUser();
    await users.update(user.id, { bankDetailsChangedAt: new Date() });
    const entry = await winningEntry(user);
    await expect(payouts.requestAndDispatch(entry.id)).rejects.toThrow('on hold');
    expect(paystack.initiateTransfer).not.toHaveBeenCalled();
  });

  it('concurrent debits can never overdraw a wallet', async () => {
    const user = await makeUser(false);
    const wallet = await wallets.findByUserId(user.id);
    await wallets.credit(wallet.id, 100, TransactionType.PRIZE_PAYOUT, {
      reference: `seed-${user.id}`,
    });

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        wallets.debit(wallet.id, 30, TransactionType.WITHDRAWAL, {
          reference: `d-${user.id}-${i}`,
        }),
      ),
    );

    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(3);
    expect(await balanceOf(user)).toBe(10);
  });

  it('a reused wallet reference is rejected', async () => {
    const user = await makeUser(false);
    const wallet = await wallets.findByUserId(user.id);
    await wallets.credit(wallet.id, 10, TransactionType.REFUND, { reference: `dup-${user.id}` });
    await expect(
      wallets.credit(wallet.id, 10, TransactionType.REFUND, { reference: `dup-${user.id}` }),
    ).rejects.toThrow();
  });

  it('a tournament never takes more players than maxPlayers', async () => {
    const t = await makeTournament(TournamentStatus.OPEN, 2);
    const players = await Promise.all(Array.from({ length: 6 }, () => makeUser(false)));

    await Promise.allSettled(players.map((p) => tournaments.joinTournament(t.id, p.id)));

    expect(await entries.count({ where: { tournamentId: t.id } })).toBe(2);
  });

  it('the duel answer and tournament session uniqueness rules exist in the schema', async () => {
    const rows: { indexname: string; indexdef: string }[] = await db.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE indexname IN ('UQ_duel_answer_once', 'UQ_session_per_tournament_entry')`,
    );
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      'UQ_duel_answer_once',
      'UQ_session_per_tournament_entry',
    ]);
    expect(rows.every((r) => r.indexdef.startsWith('CREATE UNIQUE INDEX'))).toBe(true);
  });
});
