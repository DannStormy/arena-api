import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameSession } from './entities/game-session.entity';
import { GameAnswer } from './entities/game-answer.entity';
import { User } from '../users/entities/user.entity';
import { Duel } from '../duels/entities/duel.entity';
import { GameSessionsService } from './game-sessions.service';
import { GameSessionsController } from './game-sessions.controller';
import { QuestionsModule } from '../questions/questions.module';
import { TournamentsModule } from '../tournaments/tournaments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameSession, GameAnswer, User, Duel]),
    QuestionsModule,
    TournamentsModule,
  ],
  providers: [GameSessionsService],
  controllers: [GameSessionsController],
})
export class GameSessionsModule {}
