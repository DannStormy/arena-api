import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tournament } from './entities/tournament.entity';
import { TournamentEntry } from './entities/tournament-entry.entity';
import { GameSession } from '../game-sessions/entities/game-session.entity';
import { TournamentsService } from './tournaments.service';
import { TournamentsController } from './tournaments.controller';
import { WalletModule } from '../wallet/wallet.module';
import { ProgressionModule } from '../progression/progression.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tournament, TournamentEntry, GameSession]),
    WalletModule,
    ProgressionModule,
  ],
  providers: [TournamentsService],
  controllers: [TournamentsController],
  exports: [TournamentsService],
})
export class TournamentsModule {}
