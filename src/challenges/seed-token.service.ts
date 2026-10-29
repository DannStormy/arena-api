import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dailySeedFor, issueSeedToken, SeedGrant, verifySeedToken } from './seed-token';

@Injectable()
export class SeedTokenService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    const secret = config.get<string>('SEED_TOKEN_SECRET') ?? config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('SEED_TOKEN_SECRET (or JWT_SECRET) must be set');
    this.secret = secret;
  }

  issue(grant: SeedGrant): string {
    return issueSeedToken(this.secret, grant);
  }

  verify(token: string, userId: string): SeedGrant | null {
    return verifySeedToken(this.secret, token, userId);
  }

  dailySeed(dateKey: string): string {
    return dailySeedFor(this.secret, dateKey);
  }
}
