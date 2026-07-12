import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { StreakService } from './streak.service';
import { StreakController } from './streak.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [StreakController],
  providers: [StreakService],
  // Exported so gameplay modules (challenges, async-duels) can record activity.
  exports: [StreakService],
})
export class StreakModule {}
