import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DuelConfig } from './entities/duel-config.entity';
import { Duel } from './entities/duel.entity';
import { DuelAnswer } from './entities/duel-answer.entity';
import { TournamentEntry } from '../tournaments/entities/tournament-entry.entity';
import { User } from '../users/entities/user.entity';
import { DuelsService } from './duels.service';
import { DuelConfigService } from './duel-config.service';
import { DuelProgressionService } from './duel-progression.service';
import { DuelsGateway } from './duels.gateway';
import { DuelsController } from './duels.controller';
import { QuestionsModule } from '../questions/questions.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DuelConfig, Duel, DuelAnswer, TournamentEntry, User]),
    QuestionsModule,
    WalletModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [DuelsService, DuelConfigService, DuelProgressionService, DuelsGateway],
  controllers: [DuelsController],
  exports: [DuelsService, DuelConfigService],
})
export class DuelsModule implements OnModuleInit {
  constructor(private readonly duelsService: DuelsService) {}

  onModuleInit(): void {
    void this.duelsService.expirePendingDuels();
    setInterval(() => void this.duelsService.expirePendingDuels(), 5 * 60 * 1000);
  }
}
