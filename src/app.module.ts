import { randomUUID } from 'crypto';
import { join } from 'path';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { Module, RequestMethod } from '@nestjs/common';
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
import { DailyModule } from './daily/daily.module';
import { PayoutsModule } from './payouts/payouts.module';
import { HealthController } from './health/health.controller';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
  ],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    LoggerModule.forRoot({
      forRoutes: [{ path: '*path', method: RequestMethod.ALL }],
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
        redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
        transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
      },
    }),
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
        // Migrations own the schema everywhere; they run on boot.
        synchronize: false,
        migrationsRun: true,
        migrations: [join(__dirname, 'database', 'migrations', '*{.ts,.js}')],
        ssl: config.get('DB_SSL') === 'true' ? { rejectUnauthorized: true } : false,
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
    DailyModule,
    PayoutsModule,
  ],
})
export class AppModule {}
