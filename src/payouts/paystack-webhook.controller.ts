import { SkipThrottle } from '@nestjs/throttler';
import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { PayoutsService } from './payouts.service';
import { isValidPaystackSignature } from './paystack-signature';

interface PaystackEvent {
  event: string;
  data?: { reference?: string; reason?: string };
}

@SkipThrottle()
@ApiExcludeController()
@Controller('payments/paystack')
export class PaystackWebhookController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly config: ConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY') ?? '';
    if (!secret || !req.rawBody || !isValidPaystackSignature(secret, req.rawBody, signature)) {
      throw new UnauthorizedException('invalid signature');
    }
    const event = JSON.parse(req.rawBody.toString('utf8')) as PaystackEvent;
    await this.payouts.handleTransferEvent(event.event, event.data?.reference, event.data?.reason);
    return { received: true };
  }
}
