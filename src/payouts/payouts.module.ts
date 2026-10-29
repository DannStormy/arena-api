import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payout } from './entities/payout.entity';
import { PayoutsService } from './payouts.service';
import { PaystackWebhookController } from './paystack-webhook.controller';
import { TournamentEntry } from '../tournaments/entities/tournament-entry.entity';
import { WalletModule } from '../wallet/wallet.module';
import { PaystackModule } from '../services/paystack/paystack.module';

@Module({
  imports: [TypeOrmModule.forFeature([Payout, TournamentEntry]), WalletModule, PaystackModule],
  controllers: [PaystackWebhookController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
