import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AsyncDuelsService } from './async-duels.service';
import { AsyncDuel } from './entities/async-duel.entity';
import { AsyncDuelAnswer } from './entities/async-duel-answer.entity';
import { AsyncDuelMatchType } from './types/async-duel-match-type.enum';
import { AsyncDuelStatus } from './types/async-duel-status.enum';
import { ChallengeService } from '../challenges/challenge.service';
import { ChallengeMode } from '../challenges/types/challenge-mode.enum';
import { ProgressionAwardService } from '../progression/services/progression-award.service';
import { ProgressionConfigService } from '../progression/services/progression-config.service';
import { StreakService } from '../streak/streak.service';
import { User } from '../users/entities/user.entity';
import { MIN_PLAUSIBLE_ELAPSED_MS } from './async-duel-resolver';

/** Minimal in-memory stand-in for the answers repo. */
function makeAnswersRepo() {
  const rows: AsyncDuelAnswer[] = [];
  return {
    rows,
    create: (o: Partial<AsyncDuelAnswer>) => ({ ...o }) as AsyncDuelAnswer,
    save: jest.fn(async (batch: AsyncDuelAnswer[]) => {
      rows.push(...batch);
      return batch;
    }),
    count: jest.fn(async ({ where }: { where: { asyncDuelId: string; userId: string } }) =>
      rows.filter((r) => r.asyncDuelId === where.asyncDuelId && r.userId === where.userId).length,
    ),
  };
}

function makeDuelsRepo(store: AsyncDuel[]) {
  return {
    store,
    findOne: jest.fn(async ({ where }: { where: Partial<AsyncDuel> }) => {
      return (
        store.find((d) =>
          Object.entries(where).every(([k, v]) => (d as any)[k] === v),
        ) ?? null
      );
    }),
    create: (o: Partial<AsyncDuel>) => ({ ...o }) as AsyncDuel,
    save: jest.fn(async (d: AsyncDuel) => {
      if (!d.id) d.id = `duel-${store.length + 1}`;
      if (!store.includes(d)) store.push(d);
      return d;
    }),
  };
}

function baseDuel(overrides: Partial<AsyncDuel> = {}): AsyncDuel {
  return {
    id: 'match-1',
    code: 'ABC123',
    matchSeed: 'seed-xyz',
    mode: ChallengeMode.SPEED_MATH,
    difficulty: 3,
    challengeCount: 3,
    matchType: AsyncDuelMatchType.CHALLENGE_LINK,
    status: AsyncDuelStatus.AWAITING_OPPONENT,
    creatorId: 'creator',
    opponentId: null,
    creatorScore: 0,
    opponentScore: 0,
    creatorCorrect: 0,
    opponentCorrect: 0,
    creatorElapsedMs: 0,
    opponentElapsedMs: 0,
    creatorCompletedAt: null,
    opponentCompletedAt: null,
    ghostEligible: false,
    winnerId: null,
    resolution: null,
    tiebreakDeltaMs: null,
    isTie: false,
    progressionAwarded: false,
    creatorXpAwarded: null,
    creatorSpAwarded: null,
    opponentXpAwarded: null,
    opponentSpAwarded: null,
    creatorProgression: null,
    opponentProgression: null,
    createdAt: new Date(),
    completedAt: null,
    updatedAt: new Date(),
    ...overrides,
  } as AsyncDuel;
}

describe('AsyncDuelsService', () => {
  let challengeService: ChallengeService;
  let award: { awardAsyncDuelResult: jest.Mock };
  let config: { getEffective: jest.Mock };

  beforeEach(() => {
    challengeService = new ChallengeService();
    award = { awardAsyncDuelResult: jest.fn(async () => ({})) };
    config = { getEffective: jest.fn(async () => ({ values: {}, versionId: 'v1' })) };
  });

  function build(duelsRepo: any, answersRepo: any) {
    const streak = { recordActivity: jest.fn(async () => ({})) };
    const usersRepo = { find: jest.fn(async () => []) };
    return new AsyncDuelsService(
      duelsRepo as unknown as Repository<AsyncDuel>,
      answersRepo as unknown as Repository<AsyncDuelAnswer>,
      usersRepo as unknown as Repository<User>,
      challengeService,
      award as unknown as ProgressionAwardService,
      config as unknown as ProgressionConfigService,
      streak as unknown as StreakService,
    );
  }

  it('rejects a double-submit from the same user', async () => {
    const duel = baseDuel();
    const duelsRepo = makeDuelsRepo([duel]);
    const answersRepo = makeAnswersRepo();
    // Pre-seed an existing run for the creator.
    answersRepo.rows.push({ asyncDuelId: 'match-1', userId: 'creator' } as AsyncDuelAnswer);

    const service = build(duelsRepo, answersRepo);

    await expect(
      service.submit('ABC123', 'creator', {
        answers: [{ index: 0, answer: 1, elapsedMs: 500 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(answersRepo.save).not.toHaveBeenCalled();
  });

  it('scores an implausibly fast answer as 0 / incorrect (too-fast guard)', async () => {
    const duel = baseDuel({ challengeCount: 1 });
    const duelsRepo = makeDuelsRepo([duel]);
    const answersRepo = makeAnswersRepo();
    const service = build(duelsRepo, answersRepo);

    // Provide the correct answer, but faster than the plausibility floor.
    const [challenge] = challengeService.generateSet({
      matchSeed: duel.matchSeed,
      mode: duel.mode,
      count: 1,
      difficulty: duel.difficulty,
    });
    const correct = evalExpr((challenge.prompt as { expression: string }).expression);

    await service.submit('ABC123', 'creator', {
      answers: [{ index: 0, answer: correct, elapsedMs: MIN_PLAUSIBLE_ELAPSED_MS - 1 }],
    });

    expect(answersRepo.rows).toHaveLength(1);
    expect(answersRepo.rows[0].score).toBe(0);
    expect(answersRepo.rows[0].isCorrect).toBe(false);
    expect(duel.creatorScore).toBe(0);
  });

  it('credits a correct answer submitted at a plausible speed', async () => {
    const duel = baseDuel({ challengeCount: 1 });
    const duelsRepo = makeDuelsRepo([duel]);
    const answersRepo = makeAnswersRepo();
    const service = build(duelsRepo, answersRepo);

    const [challenge] = challengeService.generateSet({
      matchSeed: duel.matchSeed,
      mode: duel.mode,
      count: 1,
      difficulty: duel.difficulty,
    });
    const correct = evalExpr((challenge.prompt as { expression: string }).expression);

    await service.submit('ABC123', 'creator', {
      answers: [{ index: 0, answer: correct, elapsedMs: 1000 }],
    });

    expect(answersRepo.rows[0].isCorrect).toBe(true);
    expect(answersRepo.rows[0].score).toBeGreaterThan(0);
    expect(duel.creatorScore).toBeGreaterThan(0);
    expect(duel.ghostEligible).toBe(true);
  });

  describe('ghost selection', () => {
    it('excludes the requester\'s own runs and completed non-eligible runs', async () => {
      // Build a query-builder mock that captures the where predicates by simply
      // filtering the store the same way the real SQL would.
      const ghostOwn = baseDuel({
        id: 'ghost-own',
        creatorId: 'me',
        status: AsyncDuelStatus.COMPLETED,
        ghostEligible: true,
        creatorCompletedAt: new Date(),
      });
      const ghostOther = baseDuel({
        id: 'ghost-other',
        creatorId: 'other',
        code: 'OTHER1',
        status: AsyncDuelStatus.COMPLETED,
        ghostEligible: true,
        creatorScore: 42,
        creatorCompletedAt: new Date(),
      });
      const store = [ghostOwn, ghostOther];

      const qb: any = {
        _preds: [] as ((d: AsyncDuel) => boolean)[],
        where() {
          return this;
        },
        andWhere(clause: string, params: any) {
          if (clause.includes('creatorId != :userId')) {
            this._preds.push((d: AsyncDuel) => d.creatorId !== params.userId);
          }
          if (clause.includes('ghostEligible = true')) {
            this._preds.push((d: AsyncDuel) => d.ghostEligible);
          }
          if (clause.includes('status = :completed')) {
            this._preds.push((d: AsyncDuel) => d.status === params.completed);
          }
          return this;
        },
        orderBy() {
          return this;
        },
        addOrderBy() {
          return this;
        },
        limit() {
          return this;
        },
        getOne: async function () {
          return store.find((d) => this._preds.every((p: any) => p(d))) ?? null;
        },
      };

      const duelsRepo: any = {
        createQueryBuilder: jest.fn(() => qb),
        create: (o: Partial<AsyncDuel>) => ({ ...o }) as AsyncDuel,
        findOne: jest.fn(async () => null), // for unique-code check
        save: jest.fn(async (d: AsyncDuel) => {
          d.id = 'ghost-match';
          return d;
        }),
      };
      const answersRepo = makeAnswersRepo();
      const service = build(duelsRepo, answersRepo);

      const res = await service.matchmake('me', {
        mode: ChallengeMode.SPEED_MATH,
        difficulty: 3,
      });

      // Must match the OTHER player's ghost, never our own.
      expect(res.matchType).toBe(AsyncDuelMatchType.GHOST);
      const savedArg = duelsRepo.save.mock.calls[0][0] as AsyncDuel;
      expect(savedArg.opponentId).toBe('other');
      expect(savedArg.opponentScore).toBe(42);
      expect(savedArg.creatorId).toBe('me');
    });
  });
});

function evalExpr(expression: string): number {
  const normalized = expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  // eslint-disable-next-line no-eval
  return eval(normalized) as number;
}
