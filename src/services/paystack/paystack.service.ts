import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaystackBank,
  PaystackBanksResponse,
  PaystackResolveAccountResponse,
  PaystackTransferRecipientResponse,
  PaystackTransferResponse,
} from './types/paystack.types';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private readonly config: ConfigService) {}

  // NOTE: Payment initialization / verification (money IN / deposits) has been removed.
  // This is a payout-only, free-to-play platform: Paystack is used solely for OUTBOUND
  // transfers (prize payouts / withdrawals) and bank-account resolution.

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

  async createTransferRecipient(name: string, accountNumber: string, bankCode: string): Promise<string> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');

    const response = await fetch(`${this.baseUrl}/transferrecipient`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'nuban',
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: 'NGN',
      }),
    });

    const data = (await response.json()) as PaystackTransferRecipientResponse;

    if (!data.status) {
      throw new Error(data.message);
    }

    return data.data.recipient_code;
  }

  async initiateTransfer(recipientCode: string, amountKobo: number, reason: string): Promise<string> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');

    const response = await fetch(`${this.baseUrl}/transfer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'balance',
        amount: amountKobo,
        recipient: recipientCode,
        reason,
      }),
    });

    const data = (await response.json()) as PaystackTransferResponse;

    if (!data.status) {
      throw new Error(data.message);
    }

    return data.data.transfer_code;
  }
}
