import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChallengeModule } from '../challenges/challenge.module';
import { ProgressionModule } from '../progression/progression.module';
import { User } from '../users/entities/user.entity';
import { DailyResult } from './entities/daily-result.entity';
import { DailyService } from './daily.service';
import { DailyController } from './daily.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyResult, User]),
    ChallengeModule,
    ProgressionModule,
  ],
  providers: [DailyService],
  controllers: [DailyController],
  exports: [DailyService],
})
export class DailyModule {}
