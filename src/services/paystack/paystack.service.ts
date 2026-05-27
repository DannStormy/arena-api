import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaystackInitializeResponse, PaystackVerifyResponse } from './types/paystack.types';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private readonly config: ConfigService) {}

  async initializePayment(
    email: string,
    amountKobo: number,
    reference: string,
  ): Promise<PaystackInitializeResponse> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');

    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, amount: amountKobo, reference }),
    });

    const data = (await response.json()) as PaystackInitializeResponse;

    this.logger.log(`Paystack initialize: ref=${reference} status=${data.status}`);

    return data;
  }

  async verifyPayment(reference: string): Promise<PaystackVerifyResponse> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');

    const response = await fetch(`${this.baseUrl}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });

    const data = (await response.json()) as PaystackVerifyResponse;

    this.logger.log(`Paystack verify: ref=${reference} status=${data.data?.status}`);

    return data;
  }
}
