import { join } from 'path';
import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WalletModule } from './wallet/wallet.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { QuestionsModule } from './questions/questions.module';
import { GameSessionsModule } from './game-sessions/game-sessions.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { PaystackModule } from './services/paystack/paystack.module';
import { AdminModule } from './admin/admin.module';
import { DuelsModule } from './duels/duels.module';
import { ProgressionModule } from './progression/progression.module';
import { ChallengeModule } from './challenges/challenge.module';
import { StreakModule } from './streak/streak.module';
import { AsyncDuelsModule } from './async-duels/async-duels.module';

@Module({
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get('DB_USERNAME'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_NAME'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') !== 'production',
        // Migrations are registered so the app is aware of them, but
        // migrationsRun is intentionally NOT enabled yet — the release/run
        // strategy is decided and wired in Stage 3. The glob resolves relative
        // to this module's location (dist in prod, src under ts-node).
        migrations: [join(__dirname, 'database', 'migrations', '*{.ts,.js}')],
        ssl: config.get('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),
    AuthModule,
    UsersModule,
    WalletModule,
    TournamentsModule,
    QuestionsModule,
    GameSessionsModule,
    LeaderboardModule,
    PaystackModule,
    AdminModule,
    DuelsModule,
    ProgressionModule,
    ChallengeModule,
    AsyncDuelsModule,
    StreakModule,
  ],
})
export class AppModule {}
