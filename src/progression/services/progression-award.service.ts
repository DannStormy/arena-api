import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProgressionEvent } from '../entities/progression-event.entity';
import { ProgressionProjection } from '../entities/progression-projection.entity';
import { Ledger } from '../types/ledger.enum';
import { EventReason } from '../types/event-reason.enum';
import { ProgressionConfigService } from './progression-config.service';
import { ProgressionProjectionService, levelFromXp } from './progression-projection.service';
import { ProgressionConfigValues } from '../types/progression-config.types';
import { Duel } from '../../duels/entities/duel.entity';
import { DuelResolution } from '../../duels/duel-resolver';
import { TournamentEntry } from '../../tournaments/entities/tournament-entry.entity';
import { GameSession } from '../../game-sessions/entities/game-session.entity';
import { User } from '../../users/entities/user.entity';
import { rankFromSeasonPoints } from '../../common/rank-tiers';
import { currentSeasonId, awardFor } from '../../duels/duel-progression';

/** Hard ceiling on any single solo-play XP award — keeps solo un-farmable into big numbers. */
export const SOLO_XP_MAX_PER_EVENT = 60;
/** XP for one correct solo Speed Math / Memory validate. */
// A perfect ~10-answer run should be worth roughly a level (levelBase 300), so
// solo play visibly moves your level instead of creeping. Was 2 (kid-tier).
export const SOLO_CHALLENGE_XP_PER_CORRECT = 30;

/** Modest XP for finishing a solo trivia session (clamped by SOLO_XP_MAX_PER_EVENT). */
export function soloTriviaXp(correctAnswers: number): number {
  const correct = Number.isFinite(correctAnswers) ? Math.max(0, correctAnswers) : 0;
  return 10 + correct * 3;
}

// Returned to DuelProgressionService for ProgressionSnapshot building
export interface PlayerAwardPayload {
  userId: string;
  xpBefore: number;
  xpAfter: number;
  xpAwarded: number;
  levelBefore: number;
  levelAfter: number;
  intoLevelBefore: number;
  intoLevelAfter: number;
  nextLevelAt: number | null;
  spBefore: number;
  spAfter: number;
  spAwarded: number;
  rankBefore: string;
  rankAfter: string;
  rankFloor: number;
  nextRankAt: number | null;
  firstGameOfDayBonus: number;
}

export interface DuelAwardPayload {
  challenger: PlayerAwardPayload;
  opponent: PlayerAwardPayload;
}

// Minimal before→after LEVEL snapshot for a solo results XP bar (no rank fields —
// solo never moves season rank). intoLevel/levelSpan drive the bar fill.
export interface SoloXpSnapshot {
  xpBefore: number;
  xpAfter: number;
  xpAwarded: number;
  levelBefore: number;
  levelAfter: number;
  intoLevelBefore: number;
  intoLevelAfter: number;
  levelSpanBefore: number;
  levelSpanAfter: number;
}

function buildCumulative(base: number, growth: number, maxLevel: number): number[] {
  const arr = [0];
  let total = 0;
  for (let l = 1; l < maxLevel; l++) {
    total += Math.round(base * Math.pow(growth, l - 1));
    arr.push(total);
  }
  return arr;
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

@Injectable()
export class ProgressionAwardService {
  private readonly logger = new Logger(ProgressionAwardService.name);

  constructor(
    @InjectRepository(ProgressionEvent)
    private readonly eventsRepo: Repository<ProgressionEvent>,
    @InjectRepository(ProgressionProjection)
    private readonly projectionRepo: Repository<ProgressionProjection>,
    @InjectRepository(Duel)
    private readonly duelsRepo: Repository<Duel>,
    @InjectRepository(TournamentEntry)
    private readonly entriesRepo: Repository<TournamentEntry>,
    @InjectRepository(GameSession)
    private readonly sessionsRepo: Repository<GameSession>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly configService: ProgressionConfigService,
    private readonly projectionService: ProgressionProjectionService,
  ) {}

  // ── Duel award ─────────────────────────────────────────────────────────────

  async awardDuelResult(duel: Duel): Promise<DuelAwardPayload | null> {
    if (!duel.opponentId || !duel.resolution || !duel.completedAt) return null;

    const { values: cfg, versionId } = await this.configService.getEffective(duel.completedAt);
    const seasonId = currentSeasonId();
    const staked = parseFloat(duel.stake) > 0;

    const [challenger, opponent] = await Promise.all([
      this.usersRepo.findOne({ where: { id: duel.challengerId } }),
      this.usersRepo.findOne({ where: { id: duel.opponentId } }),
    ]);
    if (!challenger || !opponent) return null;

    // Capture before projections (pre-award state)
    const [cLevelBefore, cRankBefore, oLevelBefore, oRankBefore] = await Promise.all([
      this.projectionService.getOrInit(duel.challengerId, Ledger.LEVEL, null),
      this.projectionService.getOrInit(duel.challengerId, Ledger.DUEL_RANK, seasonId),
      this.projectionService.getOrInit(duel.opponentId, Ledger.LEVEL, null),
      this.projectionService.getOrInit(duel.opponentId, Ledger.DUEL_RANK, seasonId),
    ]);

    // Compute XP awards (level ledger)
    const [cFirstToday, oFirstToday] = await Promise.all([
      this.isFirstDuelToday(challenger.id, duel.id),
      this.isFirstDuelToday(opponent.id, duel.id),
    ]);
    const cDayBonus = cFirstToday ? cfg.firstDuelOfDayBonusXp : 0;
    const oDayBonus = oFirstToday ? cfg.firstDuelOfDayBonusXp : 0;

    const cXp = this.computeDuelXp(duel, challenger.id, cfg) + cDayBonus;
    const oXp = this.computeDuelXp(duel, opponent.id, cfg) + oDayBonus;

    // Compute duel rank points (may be negative for losers)
    const [cFreeWins, oFreeWins] = await Promise.all([
      this.countFreeWinsToday(challenger.id, duel.id),
      this.countFreeWinsToday(opponent.id, duel.id),
    ]);
    const cRp = this.computeDuelRankPoints(
      duel, challenger.id, staked, challenger.duelWinStreak, cFreeWins, cfg,
    );
    const oRp = this.computeDuelRankPoints(
      duel, opponent.id, staked, opponent.duelWinStreak, oFreeWins, cfg,
    );

    const cReason = this.duelEventReason(duel, challenger.id);
    const oReason = this.duelEventReason(duel, opponent.id);

    // Write events — ON CONFLICT (unique key) DO NOTHING
    await this.eventsRepo.manager.query(
      `INSERT INTO progression_events
         (id, "userId", ledger, points, reason, "sourceType", "sourceId", "seasonId", "configVersionId", "createdAt")
       VALUES
         (gen_random_uuid(), $1, 'level',     $3,  $5,  'duel', $7, NULL,      $9,  NOW()),
         (gen_random_uuid(), $2, 'level',     $4,  $6,  'duel', $7, NULL,      $9,  NOW()),
         (gen_random_uuid(), $1, 'duel_rank', $10, $5,  'duel', $7, $8,        $9,  NOW()),
         (gen_random_uuid(), $2, 'duel_rank', $11, $6,  'duel', $7, $8,        $9,  NOW())
       ON CONFLICT ("userId", ledger, "sourceType", "sourceId", reason) DO NOTHING`,
      [
        duel.challengerId, // $1
        duel.opponentId,   // $2
        cXp,               // $3
        oXp,               // $4
        cReason,           // $5
        oReason,           // $6
        duel.id,           // $7
        seasonId,          // $8
        versionId,         // $9
        cRp,               // $10
        oRp,               // $11
      ],
    );

    // Update projections
    const [cLevelAfterProj, cRankAfterProj, oLevelAfterProj, oRankAfterProj] = await Promise.all([
      this.projectionService.updateForUser(duel.challengerId, Ledger.LEVEL, null, cfg),
      this.projectionService.updateForUser(duel.challengerId, Ledger.DUEL_RANK, seasonId, cfg),
      this.projectionService.updateForUser(duel.opponentId, Ledger.LEVEL, null, cfg),
      this.projectionService.updateForUser(duel.opponentId, Ledger.DUEL_RANK, seasonId, cfg),
    ]);

    // Update win streaks on User (compatibility shim — see deprecation note on User.duelWinStreak)
    await Promise.all([
      this.updateStreak(challenger, duel),
      this.updateStreak(opponent, duel),
    ]);

    const cumulative = buildCumulative(cfg.levelBase, cfg.levelGrowth, cfg.maxLevel);

    return {
      challenger: this.buildPlayerPayload(
        duel.challengerId, cXp, cRp, cDayBonus,
        cLevelBefore, cLevelAfterProj,
        cRankBefore, cRankAfterProj,
        cumulative,
      ),
      opponent: this.buildPlayerPayload(
        duel.opponentId, oXp, oRp, oDayBonus,
        oLevelBefore, oLevelAfterProj,
        oRankBefore, oRankAfterProj,
        cumulative,
      ),
    };
  }

  // ── Solo play award ────────────────────────────────────────────────────────

  /**
   * Award a MODEST amount of XP (level ledger only — never season points, so it
   * never inflates duel/tournament rank) for solo play: solo Speed Math / Memory
   * practice validates, and solo trivia completions.
   *
   * Abuse-resistant by construction:
   *   - The amount is hard-clamped to SOLO_XP_MAX_PER_EVENT here, so no caller can
   *     ever push a large number through.
   *   - Written with sourceType='solo' and a caller-supplied stable sourceId; the
   *     ON CONFLICT clause makes re-submitting the SAME challenge/session a no-op,
   *     so a single unit of play can only ever be counted once.
   *
   * Fire-and-forget from gameplay paths: it re-derives the LEVEL projection so
   * GET /progression/me reflects the gain immediately.
   */
  async awardSoloXp(userId: string, sourceId: string, points: number): Promise<void> {
    if (!userId || !sourceId) return;
    const pts = Math.max(0, Math.min(SOLO_XP_MAX_PER_EVENT, Math.round(points)));
    if (pts === 0) return;

    const { values: cfg, versionId } = await this.configService.getEffective();

    await this.eventsRepo.manager.query(
      `INSERT INTO progression_events
         (id, "userId", ledger, points, reason, "sourceType", "sourceId", "seasonId", "configVersionId", "createdAt")
       VALUES
         (gen_random_uuid(), $1, 'level', $2, $3, 'solo', $4, NULL, $5, NOW())
       ON CONFLICT ("userId", ledger, "sourceType", "sourceId", reason) DO NOTHING`,
      [userId, pts, EventReason.SOLO_PRACTICE, sourceId, versionId !== 'default' ? versionId : null],
    );

    // Re-derive the LEVEL projection so GET /progression/me shows the new XP.
    await this.projectionService.updateForUser(userId, Ledger.LEVEL, null, cfg);
  }

  /**
   * Like awardSoloXp, but AWAITED and returns a before→after LEVEL snapshot so a
   * results screen can animate an XP bar filling (and celebrate a level-up).
   * Level ledger only — season rank is never touched. Idempotent per sourceId,
   * so a replay returns a zero-gain snapshot rather than double-awarding.
   */
  async awardSoloXpWithSnapshot(
    userId: string,
    sourceId: string,
    points: number,
  ): Promise<SoloXpSnapshot | null> {
    if (!userId || !sourceId) return null;
    const pts = Math.max(0, Math.min(SOLO_XP_MAX_PER_EVENT, Math.round(points)));
    const { values: cfg, versionId } = await this.configService.getEffective();

    const before = await this.projectionService.getOrInit(userId, Ledger.LEVEL, null);
    const xpBefore = before.total;
    const levelBefore = before.levelNumber ?? 1;

    if (pts > 0) {
      await this.eventsRepo.manager.query(
        `INSERT INTO progression_events
           (id, "userId", ledger, points, reason, "sourceType", "sourceId", "seasonId", "configVersionId", "createdAt")
         VALUES
           (gen_random_uuid(), $1, 'level', $2, $3, 'solo', $4, NULL, $5, NOW())
         ON CONFLICT ("userId", ledger, "sourceType", "sourceId", reason) DO NOTHING`,
        [userId, pts, EventReason.SOLO_PRACTICE, sourceId, versionId !== 'default' ? versionId : null],
      );
    }

    const after = await this.projectionService.updateForUser(userId, Ledger.LEVEL, null, cfg);
    const xpAfter = after.total;
    const levelAfter = after.levelNumber ?? 1;

    const cumulative = buildCumulative(cfg.levelBase, cfg.levelGrowth, cfg.maxLevel);
    const span = (lvl: number) => {
      const start = cumulative[lvl - 1] ?? 0;
      const next = lvl < cfg.maxLevel ? (cumulative[lvl] ?? start) : start;
      return { start, size: Math.max(1, next - start) };
    };
    const b = span(levelBefore);
    const a = span(levelAfter);

    return {
      xpBefore,
      xpAfter,
      xpAwarded: xpAfter - xpBefore,
      levelBefore,
      levelAfter,
      intoLevelBefore: xpBefore - b.start,
      intoLevelAfter: xpAfter - a.start,
      levelSpanBefore: b.size,
      levelSpanAfter: a.size,
    };
  }

  // ── Async duel award ───────────────────────────────────────────────────────

  /**
   * Award XP + season points for a completed ASYNC duel. Free-to-play, so the
   * outcome is fed through the SAME award math as a live duel (`awardFor` for SP,
   * the same cfg XP fields, the same progression_events ledger + projection
   * update, and the same `buildPlayerPayload` snapshot builder) — nothing here
   * duplicates the calculation and the live-duel path is untouched.
   *
   * Only the players in `sides` are awarded. For a challenge-link match that's
   * both real players; for a ghost match it's only the live player (the ghost's
   * original run is never re-awarded).
   *
   * Events are written with sourceType='async_duel' so they never collide with a
   * live duel of the same id, and the ON CONFLICT clause keeps this idempotent.
   */
  async awardAsyncDuelResult(params: {
    asyncDuelId: string;
    resolution: DuelResolution;
    winnerId: string | null;
    completedAt: Date;
    sides: { userId: string }[];
  }): Promise<Record<string, PlayerAwardPayload>> {
    const { asyncDuelId, resolution, winnerId, completedAt, sides } = params;
    const { values: cfg, versionId } = await this.configService.getEffective(completedAt);
    const seasonId = currentSeasonId();
    const cumulative = buildCumulative(cfg.levelBase, cfg.levelGrowth, cfg.maxLevel);

    const result: Record<string, PlayerAwardPayload> = {};

    for (const side of sides) {
      const { userId } = side;
      const isWinner = winnerId === userId;

      // Capture pre-award projections.
      const [levelBefore, rankBefore] = await Promise.all([
        this.projectionService.getOrInit(userId, Ledger.LEVEL, null),
        this.projectionService.getOrInit(userId, Ledger.DUEL_RANK, seasonId),
      ]);

      const firstToday = await this.isFirstAsyncDuelToday(userId, asyncDuelId);
      const dayBonus = firstToday ? cfg.firstDuelOfDayBonusXp : 0;

      const xp = this.computeAsyncDuelXp(resolution, isWinner, cfg) + dayBonus;

      // SP via the shared free-duel award math. Async duels are always free and
      // have no streak/soft-cap tracking, so those inputs are neutral.
      const { seasonPoints: sp } = awardFor({
        isWinner,
        resolution,
        forfeited: false,
        staked: false,
        consecutiveWinsAfterThis: 0,
        freeWinsToday: 0,
      });

      const reason =
        resolution === 'draw'
          ? EventReason.DUEL_DRAW
          : isWinner
            ? EventReason.DUEL_WIN
            : EventReason.DUEL_LOSS;

      await this.eventsRepo.manager.query(
        `INSERT INTO progression_events
           (id, "userId", ledger, points, reason, "sourceType", "sourceId", "seasonId", "configVersionId", "createdAt")
         VALUES
           (gen_random_uuid(), $1, 'level',     $2, $4, 'async_duel', $5, NULL,      $7, NOW()),
           (gen_random_uuid(), $1, 'duel_rank', $3, $4, 'async_duel', $5, $6,        $7, NOW())
         ON CONFLICT ("userId", ledger, "sourceType", "sourceId", reason) DO NOTHING`,
        [userId, xp, sp, reason, asyncDuelId, seasonId, versionId],
      );

      const [levelAfter, rankAfter] = await Promise.all([
        this.projectionService.updateForUser(userId, Ledger.LEVEL, null, cfg),
        this.projectionService.updateForUser(userId, Ledger.DUEL_RANK, seasonId, cfg),
      ]);

      result[userId] = this.buildPlayerPayload(
        userId, xp, sp, dayBonus,
        levelBefore, levelAfter,
        rankBefore, rankAfter,
        cumulative,
      );
    }

    return result;
  }

  private computeAsyncDuelXp(
    resolution: DuelResolution,
    isWinner: boolean,
    cfg: ProgressionConfigValues,
  ): number {
    if (resolution === 'draw') return cfg.xpDraw;
    return isWinner ? cfg.xpWin : cfg.xpLoss;
  }

  private async isFirstAsyncDuelToday(userId: string, asyncDuelId: string): Promise<boolean> {
    const todayStart = startOfUtcDay();
    const count = await this.eventsRepo
      .createQueryBuilder('e')
      .where('e.userId = :uid', { uid: userId })
      .andWhere("e.sourceType = 'async_duel'")
      .andWhere('e.ledger = :ledger', { ledger: Ledger.LEVEL })
      .andWhere('e.createdAt >= :start', { start: todayStart })
      .andWhere('e.sourceId != :sid', { sid: asyncDuelId })
      .getCount();
    return count === 0;
  }

  // ── Tournament award ───────────────────────────────────────────────────────

  async awardTournamentResult(tournamentId: string): Promise<void> {
    const { values: cfg, versionId } = await this.configService.getEffective();
    const seasonId = currentSeasonId();

    // Derive final ranks from score order (same as leaderboard query)
    const entries = await this.entriesRepo
      .createQueryBuilder('e')
      .innerJoinAndSelect('e.user', 'u')
      .where('e.tournamentId = :tournamentId', { tournamentId })
      .orderBy('e.score', 'DESC')
      .getMany();

    if (!entries.length) return;

    // Tournament XP: load game sessions to get correct/total counts per user
    const sessions = await this.sessionsRepo.find({
      where: { tournamentId } as any,
    });
    const sessionMap = new Map<string, GameSession>(sessions.map((s) => [s.userId, s]));

    const fieldSize = entries.length;

    const eventRows: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    entries.forEach((entry, idx) => {
      const rank = idx + 1;
      const session = sessionMap.get(entry.userId);

      // XP
      const xp = this.computeTournamentXp(session, cfg);
      const trp = this.computeTournamentRankPoints(rank, fieldSize, cfg);

      const push = (val: unknown): string => {
        params.push(val);
        return `$${pi++}`;
      };

      const uid = push(entry.userId);
      const xpVal = push(xp);
      const trpVal = push(trp);
      const tid = push(tournamentId);
      const sid = push(seasonId);
      const cv = push(versionId !== 'default' ? versionId : null);

      eventRows.push(
        `(gen_random_uuid(), ${uid}, 'level',          ${xpVal},  'tournament_finish', 'tournament', ${tid}, NULL, ${cv}, NOW())`,
        `(gen_random_uuid(), ${uid}, 'tournament_rank', ${trpVal}, 'tournament_finish', 'tournament', ${tid}, ${sid}, ${cv}, NOW())`,
      );
    });

    await this.eventsRepo.manager.query(
      `INSERT INTO progression_events
         (id, "userId", ledger, points, reason, "sourceType", "sourceId", "seasonId", "configVersionId", "createdAt")
       VALUES ${eventRows.join(', ')}
       ON CONFLICT ("userId", ledger, "sourceType", "sourceId", reason) DO NOTHING`,
      params,
    );

    // Update projections for all participants
    await Promise.all(
      entries.flatMap((e) => [
        this.projectionService.updateForUser(e.userId, Ledger.LEVEL, null, cfg),
        this.projectionService.updateForUser(e.userId, Ledger.TOURNAMENT_RANK, seasonId, cfg),
      ]),
    );

    this.logger.log(
      `Tournament progression awarded: tournamentId=${tournamentId} players=${fieldSize}`,
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private computeDuelXp(duel: Duel, userId: string, cfg: ProgressionConfigValues): number {
    const isWinner = duel.winnerId === userId;
    const resolution = duel.resolution as DuelResolution;
    if (resolution === 'draw') return cfg.xpDraw;
    if (isWinner) return resolution === 'forfeit' ? cfg.xpForfeitWin : cfg.xpWin;
    const forfeited = resolution === 'forfeit' && duel.winnerId !== userId;
    return forfeited ? cfg.xpForfeitLoss : cfg.xpLoss;
  }

  private computeDuelRankPoints(
    duel: Duel,
    userId: string,
    staked: boolean,
    winStreak: number,
    freeWinsToday: number,
    cfg: ProgressionConfigValues,
  ): number {
    const isWinner = duel.winnerId === userId;
    const resolution = duel.resolution as DuelResolution;

    if (resolution === 'draw') {
      return staked ? cfg.duelRankDrawStaked : cfg.duelRankDrawFree;
    }

    if (!isWinner) {
      const forfeited = resolution === 'forfeit';
      return staked
        ? forfeited ? cfg.duelRankForfeitLossStaked : cfg.duelRankLossStaked
        : forfeited ? cfg.duelRankForfeitLossFree : cfg.duelRankLossFree;
    }

    // Winner
    const forfeitWin = resolution === 'forfeit';
    let pts = staked
      ? forfeitWin ? cfg.duelRankForfeitWinStaked : cfg.duelRankWinStaked
      : forfeitWin ? cfg.duelRankForfeitWinFree : cfg.duelRankWinFree;

    if (!forfeitWin && winStreak + 1 > 2) {
      const bonus = Math.min(
        (winStreak + 1 - 2) * cfg.duelRankStreakBonusPerWin,
        cfg.duelRankStreakBonusCap,
      );
      pts += bonus;
    }

    if (!staked && freeWinsToday >= cfg.duelRankFreeSoftCapWins) {
      pts = Math.round(pts / 2);
    }

    return pts;
  }

  private computeTournamentXp(
    session: GameSession | undefined,
    cfg: ProgressionConfigValues,
  ): number {
    if (!session) return cfg.tournamentXpCompletion;
    const correct = session.correctAnswers ?? 0;
    const total = session.totalAnswered ?? 0;
    const accuracy = total > 0 ? correct / total : 0;
    let xp = cfg.tournamentXpCompletion + correct * cfg.tournamentXpPerCorrect;
    if (accuracy >= cfg.tournamentXpAccuracyThreshold) xp += cfg.tournamentXpAccuracyBonus;
    return xp;
  }

  /**
   * Percentile decay: topAward * (1 - pct)^k, floored at participationFloor.
   * percentile = 0 for winner, 1 for last place.
   */
  private computeTournamentRankPoints(
    rank: number,
    fieldSize: number,
    cfg: ProgressionConfigValues,
  ): number {
    const percentile = fieldSize <= 1 ? 0 : (rank - 1) / (fieldSize - 1);
    const raw = cfg.tournamentRankTopAward * Math.pow(1 - percentile, cfg.tournamentRankDecayK);
    return Math.max(cfg.tournamentRankParticipationFloor, Math.round(raw));
  }

  private duelEventReason(duel: Duel, userId: string): EventReason {
    if (duel.resolution === 'draw') return EventReason.DUEL_DRAW;
    return duel.winnerId === userId ? EventReason.DUEL_WIN : EventReason.DUEL_LOSS;
  }

  private buildPlayerPayload(
    userId: string,
    xpAwarded: number,
    spAwarded: number,
    firstGameOfDayBonus: number,
    levelBefore: ProgressionProjection,
    levelAfter: ProgressionProjection,
    rankBefore: ProgressionProjection,
    rankAfter: ProgressionProjection,
    cumulative: number[],
  ): PlayerAwardPayload {
    const xpBefore = levelBefore.total;
    const xpAfter = levelAfter.total;
    const { level: lb, intoLevel: ilb } = levelFromXp(xpBefore, cumulative);
    const { level: la, intoLevel: ila, nextLevelAt } = levelFromXp(xpAfter, cumulative);

    const spBefore = rankBefore.total;
    const spAfter = rankAfter.total;
    const { rank: rb, rankFloor, nextRankAt } = rankFromSeasonPoints(spBefore);
    const { rank: ra } = rankFromSeasonPoints(spAfter);

    return {
      userId,
      xpBefore, xpAfter, xpAwarded,
      levelBefore: lb, levelAfter: la,
      intoLevelBefore: ilb, intoLevelAfter: ila, nextLevelAt,
      spBefore, spAfter, spAwarded,
      rankBefore: rb, rankAfter: ra,
      rankFloor, nextRankAt,
      firstGameOfDayBonus,
    };
  }

  private async isFirstDuelToday(userId: string, duelId: string): Promise<boolean> {
    const todayStart = startOfUtcDay();
    const count = await this.duelsRepo
      .createQueryBuilder('d')
      .where('(d.challengerId = :uid OR d.opponentId = :uid)', { uid: userId })
      .andWhere("d.status IN ('completed', 'cancelled')")
      .andWhere('d.completedAt >= :start', { start: todayStart })
      .andWhere('d.id != :did', { did: duelId })
      .getCount();
    return count === 0;
  }

  private async countFreeWinsToday(userId: string, duelId: string): Promise<number> {
    const todayStart = startOfUtcDay();
    return this.duelsRepo
      .createQueryBuilder('d')
      .where('(d.challengerId = :uid OR d.opponentId = :uid)', { uid: userId })
      .andWhere('d.winnerId = :uid', { uid: userId })
      .andWhere("d.stake = '0.00'")
      .andWhere('d.progressionAwarded = true')
      .andWhere('d.completedAt >= :start', { start: todayStart })
      .andWhere('d.id != :did', { did: duelId })
      .getCount();
  }

  private async updateStreak(user: User, duel: Duel): Promise<void> {
    const isWinner = duel.winnerId === user.id;
    const resolution = duel.resolution as DuelResolution;
    let streak: number;

    if (!isWinner || resolution === 'draw') {
      streak = 0;
    } else if (resolution === 'forfeit') {
      streak = user.duelWinStreak;
    } else {
      streak = user.duelWinStreak + 1;
    }

    await this.usersRepo.update(user.id, { duelWinStreak: streak });
  }
}
