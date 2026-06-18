import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgressionEvent } from './entities/progression-event.entity';
import { Season } from './entities/season.entity';
import { ProgressionProjection } from './entities/progression-projection.entity';
import { ProgressionConfigVersion } from './entities/progression-config-version.entity';
import { UserProgressionBackup } from './entities/user-progression-backup.entity';
import { ProgressionConfigService } from './services/progression-config.service';
import { ProgressionProjectionService } from './services/progression-projection.service';
import { ProgressionAwardService } from './services/progression-award.service';
import { ProgressionSeasonService } from './services/progression-season.service';
import { ProgressionSeedService } from './services/progression-seed.service';
import { ProgressionController } from './progression.controller';
import { Duel } from '../duels/entities/duel.entity';
import { TournamentEntry } from '../tournaments/entities/tournament-entry.entity';
import { GameSession } from '../game-sessions/entities/game-session.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProgressionEvent,
      Season,
      ProgressionProjection,
      ProgressionConfigVersion,
      UserProgressionBackup,
      Duel,
      TournamentEntry,
      GameSession,
      User,
    ]),
  ],
  providers: [
    ProgressionConfigService,
    ProgressionProjectionService,
    ProgressionAwardService,
    ProgressionSeasonService,
    ProgressionSeedService,
  ],
  controllers: [ProgressionController],
  exports: [ProgressionAwardService, ProgressionConfigService],
})
export class ProgressionModule {}
