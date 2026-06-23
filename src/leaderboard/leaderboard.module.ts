import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TournamentEntry } from '../tournaments/entities/tournament-entry.entity';
import { User } from '../users/entities/user.entity';
import { Duel } from '../duels/entities/duel.entity';
import { ProgressionProjection } from '../progression/entities/progression-projection.entity';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardController } from './leaderboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TournamentEntry, User, Duel, ProgressionProjection])],
  providers: [LeaderboardService],
  controllers: [LeaderboardController],
})
export class LeaderboardModule {}
