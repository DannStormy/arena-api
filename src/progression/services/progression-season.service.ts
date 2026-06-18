import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Season } from '../entities/season.entity';
import { ProgressionEvent } from '../entities/progression-event.entity';
import { ProgressionProjection } from '../entities/progression-projection.entity';
import { SeasonStatus } from '../types/season-status.enum';
import { Ledger } from '../types/ledger.enum';
import { EventReason } from '../types/event-reason.enum';
import { ProgressionConfigService } from './progression-config.service';
import { ProgressionProjectionService } from './progression-projection.service';

@Injectable()
export class ProgressionSeasonService {
  private readonly logger = new Logger(ProgressionSeasonService.name);

  constructor(
    @InjectRepository(Season)
    private readonly seasonsRepo: Repository<Season>,
    @InjectRepository(ProgressionEvent)
    private readonly eventsRepo: Repository<ProgressionEvent>,
    @InjectRepository(ProgressionProjection)
    private readonly projectionRepo: Repository<ProgressionProjection>,
    private readonly configService: ProgressionConfigService,
    private readonly projectionService: ProgressionProjectionService,
  ) {}

  /** Find or create the Season row for `label` (YYYY-MM). */
  async getOrCreateSeason(label: string): Promise<Season> {
    const existing = await this.seasonsRepo.findOne({ where: { label } });
    if (existing) return existing;

    const [year, month] = label.split('-').map(Number);
    const startsAt = new Date(Date.UTC(year, month - 1, 1));
    const endsAt = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const season = this.seasonsRepo.create({ label, startsAt, endsAt });
    return this.seasonsRepo.save(season);
  }

  /**
   * Closes `oldLabel` season and writes `season_reset` events for all active
   * rank players into `newLabel`. Idempotent: skips users who already have a
   * reset event for this transition.
   */
  async runMonthlyReset(oldLabel: string, newLabel: string): Promise<{ usersReset: number }> {
    const { values: cfg, versionId } = await this.configService.getEffective();
    await this.getOrCreateSeason(newLabel);

    // Mark old season closed
    await this.seasonsRepo.update({ label: oldLabel }, { status: SeasonStatus.CLOSED });

    const rankLedgers = [Ledger.DUEL_RANK, Ledger.TOURNAMENT_RANK] as const;
    let usersReset = 0;

    for (const ledger of rankLedgers) {
      // Find all users with rank events in the old season
      const usersInOldSeason = await this.eventsRepo
        .createQueryBuilder('e')
        .select('DISTINCT e.userId', 'userId')
        .where('e.ledger = :ledger AND e.seasonId = :seasonId', {
          ledger,
          seasonId: oldLabel,
        })
        .getRawMany<{ userId: string }>();

      if (!usersInOldSeason.length) continue;

      // Load their end-of-season projections
      const projections = await this.projectionRepo.find({
        where: usersInOldSeason.map((u) => ({ userId: u.userId, ledger, seasonId: oldLabel })),
      });

      const projMap = new Map(projections.map((p) => [p.userId, p]));

      const eventRows: string[] = [];
      const params: unknown[] = [];
      let pi = 1;

      for (const { userId } of usersInOldSeason) {
        const proj = projMap.get(userId);
        const endTier = proj?.tier ?? 'Spectator';
        const resetPoints = cfg.seasonResetPoints[endTier] ?? 0;

        if (resetPoints === 0) continue; // Spectator stays at 0, no reset event needed

        const push = (val: unknown): string => { params.push(val); return `$${pi++}`; };
        const uid = push(userId);
        const pts = push(resetPoints);
        const sid = push(newLabel);
        const src = push(oldLabel);
        const cv = push(versionId !== 'default' ? versionId : null);

        eventRows.push(
          `(gen_random_uuid(), ${uid}, '${ledger}', ${pts}, 'season_reset', 'season', ${src}, ${sid}, ${cv}, NOW())`,
        );
        usersReset++;
      }

      if (eventRows.length) {
        await this.eventsRepo.manager.query(
          `INSERT INTO progression_events
             (id, "userId", ledger, points, reason, "sourceType", "sourceId", "seasonId", "configVersionId", "createdAt")
           VALUES ${eventRows.join(', ')}
           ON CONFLICT ("userId", ledger, "sourceType", "sourceId", reason) DO NOTHING`,
          params,
        );

        // Rebuild projections for the new season
        await Promise.all(
          usersInOldSeason.map(({ userId }) =>
            this.projectionService.updateForUser(userId, ledger, newLabel, cfg),
          ),
        );
      }
    }

    this.logger.log(
      `Season reset: ${oldLabel} → ${newLabel}, ${usersReset} rank events written`,
    );
    return { usersReset };
  }
}
