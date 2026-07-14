import { FindOperator, Repository } from 'typeorm';
import { DailyService } from './daily.service';
import { DailyResult } from './entities/daily-result.entity';
import { ChallengeService } from '../challenges/challenge.service';
import { ProgressionAwardService } from '../progression/services/progression-award.service';
import { User } from '../users/entities/user.entity';
import { DAILY_DIFFICULTY, DAILY_MODE } from './daily.constants';
import { dailySeed } from './daily.util';

/**
 * Minimal in-memory stand-in for the DailyResult repo. Handles just the query
 * shapes the service issues: findOne/find/count with a plain `where`, an
 * optional MoreThan operator on `score`, ordering, take, and a create+save that
 * enforces the (userId, date) unique constraint like Postgres would.
 */
function makeResultsRepo(seed: Partial<DailyResult>[] = []) {
  const rows: DailyResult[] = seed.map((r, i) => ({
    id: r.id ?? `row-${i + 1}`,
    userId: r.userId!,
    date: r.date!,
    score: r.score ?? 0,
    correctCount: r.correctCount ?? 0,
    createdAt: r.createdAt ?? new Date(Date.now() + i),
  }));

  const matches = (row: DailyResult, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      const cell = (row as unknown as Record<string, unknown>)[k];
      if (v instanceof FindOperator) return (cell as number) > (v.value as number); // only MoreThan used
      return cell === v;
    });

  return {
    rows,
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
    find: jest.fn(async ({ where, order, take }: any = {}) => {
      let out = rows.filter((r) => matches(r, where));
      if (order?.score) {
        out = [...out].sort((a, b) => {
          const s = order.score === 'DESC' ? b.score - a.score : a.score - b.score;
          if (s !== 0) return s;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });
      }
      return take ? out.slice(0, take) : out;
    }),
    count: jest.fn(async ({ where }: any = {}) => rows.filter((r) => matches(r, where)).length),
    create: (o: Partial<DailyResult>) => ({ ...o }) as DailyResult,
    save: jest.fn(async (row: DailyResult) => {
      const clash = rows.find((r) => r.userId === row.userId && r.date === row.date);
      if (clash) {
        // Simulate the unique-constraint violation TypeORM raises.
        const { QueryFailedError } = jest.requireActual('typeorm');
        throw new QueryFailedError('insert', [], new Error('duplicate key'));
      }
      if (!row.id) row.id = `row-${rows.length + 1}`;
      if (!row.createdAt) row.createdAt = new Date();
      rows.push(row);
      return row;
    }),
  };
}

function makeUsersRepo(users: { id: string; username: string }[] = []) {
  return {
    find: jest.fn(async ({ where }: any) => {
      const ids: string[] = where?.id?.value ?? [];
      return users.filter((u) => ids.includes(u.id));
    }),
  };
}

function build(resultsRepo: any, usersRepo: any = makeUsersRepo()) {
  const challengeService = new ChallengeService();
  const award = {
    awardSoloXp: jest.fn(async () => undefined),
    awardSoloXpWithSnapshot: jest.fn(async () => null),
  };
  const service = new DailyService(
    resultsRepo as unknown as Repository<DailyResult>,
    usersRepo as unknown as Repository<User>,
    challengeService,
    award as unknown as ProgressionAwardService,
  );
  return { service, challengeService, award };
}

/** Correct numeric answer for a Speed Math expression (mirrors the generator). */
function evalExpr(expression: string): number {
  const normalized = expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  // eslint-disable-next-line no-eval
  return eval(normalized) as number;
}

const DAY_A = new Date('2026-07-14T09:30:00.000Z');
const DAY_B = new Date('2026-07-15T00:00:01.000Z');

describe('DailyService', () => {
  describe('deterministic seeded set', () => {
    it('produces the identical set for the same UTC date', async () => {
      const { service } = build(makeResultsRepo());
      const first = await service.getDaily('u1', DAY_A);
      const second = await service.getDaily('u2', DAY_A);

      expect(first.date).toBe('2026-07-14');
      expect(first.matchSeed).toBe('daily:2026-07-14');
      expect(first.mode).toBe(DAILY_MODE);
      expect(first.difficulty).toBe(DAILY_DIFFICULTY);
      expect(first.challenges).toHaveLength(10);
      // Same day → byte-identical set for everyone.
      expect(second.challenges).toEqual(first.challenges);
      // Answers are stripped from the client-safe set.
      expect(first.challenges.every((c) => !('answer' in c))).toBe(true);
    });

    it('produces a different set on a different UTC date', async () => {
      const { service } = build(makeResultsRepo());
      const a = await service.getDaily('u1', DAY_A);
      const b = await service.getDaily('u1', DAY_B);

      expect(b.matchSeed).toBe('daily:2026-07-15');
      expect(b.matchSeed).not.toBe(a.matchSeed);
      expect(b.challenges).not.toEqual(a.challenges);
    });
  });

  describe('completeDaily one-shot', () => {
    it('records the authoritative score and is idempotent (never overwrites)', async () => {
      const repo = makeResultsRepo();
      const { service, challengeService } = build(repo);

      const seed = dailySeed('2026-07-14');
      const set = challengeService.generateSet({
        matchSeed: seed,
        mode: DAILY_MODE,
        count: 10,
        difficulty: DAILY_DIFFICULTY,
      });
      const correctAnswers = set.map((c, i) => ({
        index: i,
        answer: evalExpr((c.prompt as { expression: string }).expression),
        elapsedMs: 1500,
      }));

      const first = await service.completeDaily('u1', { answers: correctAnswers }, DAY_A);
      expect(first.alreadyPlayed).toBe(false);
      expect(first.correctCount).toBe(10);
      expect(first.score).toBeGreaterThan(0);
      expect(repo.rows).toHaveLength(1);

      // Second attempt with deliberately wrong answers must return the FIRST
      // result and leave the stored row untouched.
      const wrong = correctAnswers.map((a) => ({ ...a, answer: -99999 }));
      const second = await service.completeDaily('u1', { answers: wrong }, DAY_A);
      expect(second.alreadyPlayed).toBe(true);
      expect(second.score).toBe(first.score);
      expect(second.correctCount).toBe(10);
      expect(repo.rows).toHaveLength(1);
      expect(repo.rows[0].score).toBe(first.score);
    });

    it('never trusts a client total — scores 0 for wrong answers', async () => {
      const repo = makeResultsRepo();
      const { service } = build(repo);
      const answers = Array.from({ length: 10 }, (_, i) => ({
        index: i,
        answer: 'not-a-number',
        elapsedMs: 1000,
      }));
      const res = await service.completeDaily('u1', { answers }, DAY_A);
      expect(res.score).toBe(0);
      expect(res.correctCount).toBe(0);
    });
  });

  describe('rank + totalPlayers', () => {
    it('rank = (# results that day with a higher score) + 1', async () => {
      const date = '2026-07-14';
      const repo = makeResultsRepo([
        { userId: 'u1', date, score: 500 },
        { userId: 'u2', date, score: 900 },
        { userId: 'u3', date, score: 700 },
        { userId: 'u4', date, score: 900 }, // tie with u2 → both rank 1
        { userId: 'other', date: '2026-07-13', score: 9999 }, // different day, ignored
      ]);
      const { service } = build(repo);

      const u1 = await service.getDaily('u1', DAY_A);
      expect(u1.alreadyPlayed).toBe(true);
      expect(u1.result).toMatchObject({ score: 500, rank: 4, totalPlayers: 4 });

      // Two players tie at 900 (both rank 1), so 700 sits at rank 3, not 2.
      const u3 = await service.getDaily('u3', DAY_A);
      expect(u3.result).toMatchObject({ score: 700, rank: 3, totalPlayers: 4 });

      const u2 = await service.getDaily('u2', DAY_A);
      expect(u2.result).toMatchObject({ score: 900, rank: 1, totalPlayers: 4 });
    });
  });

  describe('streak', () => {
    it('counts consecutive UTC days ending at the just-played day', async () => {
      // u1 played 12th, 13th, 14th (today) → streak 3. The 10th is broken off
      // by the missing 11th.
      const repo = makeResultsRepo([
        { userId: 'u1', date: '2026-07-10', score: 100 },
        { userId: 'u1', date: '2026-07-12', score: 100 },
        { userId: 'u1', date: '2026-07-13', score: 100 },
        { userId: 'u1', date: '2026-07-14', score: 100 },
      ]);
      const { service } = build(repo);
      const res = await service.getDaily('u1', DAY_A);
      expect(res.result?.streak).toBe(3);
    });

    it('is 1 for a single-day player', async () => {
      const repo = makeResultsRepo([{ userId: 'u1', date: '2026-07-14', score: 100 }]);
      const { service } = build(repo);
      const res = await service.getDaily('u1', DAY_A);
      expect(res.result?.streak).toBe(1);
    });
  });

  describe('leaderboard', () => {
    it('returns top-20 desc with usernames and the caller line', async () => {
      const date = '2026-07-14';
      const repo = makeResultsRepo([
        { userId: 'u1', date, score: 500 },
        { userId: 'u2', date, score: 900 },
        { userId: 'u3', date, score: 700 },
      ]);
      const users = makeUsersRepo([
        { id: 'u1', username: 'alice' },
        { id: 'u2', username: 'bob' },
        { id: 'u3', username: 'carol' },
      ]);
      const { service } = build(repo, users);

      const lb = await service.getLeaderboard('u1', date, DAY_A);
      expect(lb.date).toBe(date);
      expect(lb.entries).toEqual([
        { rank: 1, username: 'bob', score: 900 },
        { rank: 2, username: 'carol', score: 700 },
        { rank: 3, username: 'alice', score: 500 },
      ]);
      expect(lb.me).toEqual({ rank: 3, score: 500 });
    });

    it('me is null when the caller has no result that day', async () => {
      const repo = makeResultsRepo([{ userId: 'u2', date: '2026-07-14', score: 900 }]);
      const users = makeUsersRepo([{ id: 'u2', username: 'bob' }]);
      const { service } = build(repo, users);
      const lb = await service.getLeaderboard('nobody', '2026-07-14', DAY_A);
      expect(lb.me).toBeNull();
    });
  });
});
