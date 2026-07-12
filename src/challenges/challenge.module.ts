import { Module } from '@nestjs/common';
import { ChallengeService } from './challenge.service';
import { ChallengeController } from './challenge.controller';
import { StreakModule } from '../streak/streak.module';

@Module({
  imports: [StreakModule],
  controllers: [ChallengeController],
  providers: [ChallengeService],
  // Exported so DuelsModule can consume it for async matches in milestone 2.
  exports: [ChallengeService],
})
export class ChallengeModule {}
