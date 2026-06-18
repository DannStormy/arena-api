import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProgressionEvent } from '../entities/progression-event.entity';
import { UserProgressionBackup } from '../entities/user-progression-backup.entity';
import { Ledger } from '../types/ledger.enum';
import { ProgressionConfigService } from './progression-config.service';
import { ProgressionProjectionService } from './progression-projection.service';
import { DEFAULT_PROGRESSION_CONFIG } from '../types/progression-config.types';
import { currentSeasonId } from '../../duels/duel-progression';

@Injectable()
export class ProgressionSeedService {
  private readonly logger = new Logger(ProgressionSeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(ProgressionEvent)
    private readonly eventsRepo: Repository<ProgressionEvent>,
    @InjectRepository(UserProgressionBackup)
    private readonly backupRepo: Repository<UserProgressionBackup>,
    private readonly configService: ProgressionConfigService,
    private readonly projectionService: ProgressionProjectionService,
  ) {}

  /**
   * One-time migration from User.lifetimeXp / User.seasonPoints to the event ledger.
   * Idempotent: skips users who already have a seed event.
   * Writes a backup row before seeding each user.
   */
  async runSeed(): Promise<{ seeded: number; skipped: number }> {
    const { values: cfg } = await this.configService.getEffective().catch(() => ({
      values: DEFAULT_PROGRESSION_CONFIG,
      versionId: 'default',
    }));

    const seasonId = currentSeasonId();
    const users = await this.usersRepo.find();

    let seeded = 0;
    let skipped = 0;

    for (const user of users) {
      // Check if already seeded (any seed event for this user)
      const existingSeed = await this.eventsRepo.findOne({
        where: { userId: user.id, reason: 'seed' as any },
      });
      if (existingSeed) {
        skipped++;
        continue;
      }

      // Write backup (skip if already backed up)
      const alreadyBacked = await this.backupRepo.findOne({ where: { userId: user.id } });
      if (!alreadyBacked) {
        await this.backupRepo.save(
          this.backupRepo.create({
            userId: user.id,
            lifetimeXp: String(user.lifetimeXp),
            seasonPoints: user.seasonPoints,
            seasonId: user.seasonId,
            allTimeHighestRank: user.allTimeHighestRank,
          }),
        );
      }

      const lifetimeXp = Number(user.lifetimeXp);
      const seasonPoints = user.seasonPoints;
      const userSeasonId = user.seasonId ?? seasonId;

      // Write seed events
      await this.eventsRepo.manager.query(
        `INSERT INTO progression_events
           (id, "userId", ledger, points, reason, "sourceType", "sourceId", "seasonId", "configVersionId", "createdAt")
         VALUES
           (gen_random_uuid(), $1, 'level',     $2, 'seed', 'user', $1, NULL,        NULL, NOW()),
           (gen_random_uuid(), $1, 'duel_rank', $3, 'seed', 'user', $1, $4,          NULL, NOW())
         ON CONFLICT ("userId", ledger, "sourceType", "sourceId", reason) DO NOTHING`,
        [user.id, lifetimeXp, seasonPoints, userSeasonId],
      );

      // Build initial projections
      await Promise.all([
        this.projectionService.updateForUser(user.id, Ledger.LEVEL, null, cfg),
        this.projectionService.updateForUser(user.id, Ledger.DUEL_RANK, userSeasonId, cfg),
      ]);

      seeded++;
    }

    this.logger.log(`Progression seed complete: seeded=${seeded} skipped=${skipped}`);
    return { seeded, skipped };
  }
}
