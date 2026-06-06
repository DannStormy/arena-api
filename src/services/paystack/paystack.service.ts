import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaystackBank,
  PaystackBanksResponse,
  PaystackInitializeResponse,
  PaystackResolveAccountResponse,
  PaystackVerifyResponse,
} from './types/paystack.types';

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

  async getBanks(): Promise<PaystackBank[]> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');

    const response = await fetch(`${this.baseUrl}/bank?currency=NGN`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });

    const data = (await response.json()) as PaystackBanksResponse;

    return data.data.map(({ name, code }) => ({ name, code }));
  }

  async resolveAccount(accountNumber: string, bankCode: string): Promise<string> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');

    bankCode = this.config.get<string>('NODE_ENV') !== 'production' ? '001' : bankCode;
    const url = `${this.baseUrl}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });

    const data = (await response.json()) as PaystackResolveAccountResponse;

    if (!data.status) {
      throw new Error(data.message);
    }

    return data.data.account_name;
  }
}
