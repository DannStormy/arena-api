import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tournament } from '../tournaments/entities/tournament.entity';
import { TournamentEntry } from '../tournaments/entities/tournament-entry.entity';
import { GameSession } from '../game-sessions/entities/game-session.entity';
import { WalletTransaction } from '../wallet/entities/wallet-transaction.entity';
import { User } from '../users/entities/user.entity';
import { Question } from '../questions/entities/question.entity';
import { GameAnswer } from '../game-sessions/entities/game-answer.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PaystackModule } from '../services/paystack/paystack.module';
import { WalletModule } from '../wallet/wallet.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { DuelsModule } from '../duels/duels.module';
import { QuestionsModule } from '../questions/questions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tournament, TournamentEntry, GameSession, WalletTransaction, User, Question, GameAnswer]),
    PaystackModule,
    WalletModule,
    TournamentsModule,
    DuelsModule,
    QuestionsModule,
  ],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
