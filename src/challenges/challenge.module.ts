import { Module } from '@nestjs/common';
import { ChallengeService } from './challenge.service';
import { SeedTokenService } from './seed-token.service';
import { ChallengeController } from './challenge.controller';
import { StreakModule } from '../streak/streak.module';
import { ProgressionModule } from '../progression/progression.module';

@Module({
  imports: [StreakModule, ProgressionModule],
  controllers: [ChallengeController],
  providers: [ChallengeService, SeedTokenService],
  exports: [ChallengeService, SeedTokenService],
})
export class ChallengeModule {}
