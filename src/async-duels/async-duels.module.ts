import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChallengeModule } from '../challenges/challenge.module';
import { ProgressionModule } from '../progression/progression.module';
import { StreakModule } from '../streak/streak.module';
import { User } from '../users/entities/user.entity';
import { AsyncDuel } from './entities/async-duel.entity';
import { AsyncDuelAnswer } from './entities/async-duel-answer.entity';
import { AsyncDuelsService } from './async-duels.service';
import { AsyncDuelsController } from './async-duels.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AsyncDuel, AsyncDuelAnswer, User]),
    ChallengeModule,
    ProgressionModule,
    StreakModule,
  ],
  providers: [AsyncDuelsService],
  controllers: [AsyncDuelsController],
  exports: [AsyncDuelsService],
})
export class AsyncDuelsModule {}
