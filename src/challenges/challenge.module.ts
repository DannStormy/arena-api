import { Module } from '@nestjs/common';
import { ChallengeService } from './challenge.service';
import { ChallengeController } from './challenge.controller';
import { StreakModule } from '../streak/streak.module';
import { ProgressionModule } from '../progression/progression.module';

@Module({
  imports: [StreakModule, ProgressionModule],
  controllers: [ChallengeController],
  providers: [ChallengeService],
  // Exported so DuelsModule can consume it for async matches in milestone 2.
  exports: [ChallengeService],
})
export class ChallengeModule {}
