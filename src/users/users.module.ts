import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { TournamentEntry } from '../tournaments/entities/tournament-entry.entity';
import { GameSession } from '../game-sessions/entities/game-session.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { BanksController } from './banks.controller';
import { PaystackModule } from '../services/paystack/paystack.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, TournamentEntry, GameSession]), PaystackModule],
  providers: [UsersService],
  controllers: [UsersController, BanksController],
  exports: [UsersService],
})
export class UsersModule {}
