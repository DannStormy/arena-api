import { createHmac, timingSafeEqual } from 'crypto';
import { ChallengeMode } from './types/challenge-mode.enum';

export const OFFLINE_SEED_PREFIX = 'offline:';
const TOKEN_PREFIX = 'st1';

export interface SeedGrant {
  seed: string;
  userId: string;
  mode: ChallengeMode;
  difficulty: number;
  count: number;
  expiresAt: number;
}

interface WireGrant {
  s: string;
  u: string;
  m: ChallengeMode;
  d: number;
  n: number;
  x: number;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

function sign(secret: string, body: string): string {
  return b64url(createHmac('sha256', secret).update(body).digest());
}

// The client only ever sees this opaque token, never the seed, so it can't
// re-derive answers with the generator it ships for offline play.
export function issueSeedToken(secret: string, grant: SeedGrant): string {
  const wire: WireGrant = {
    s: grant.seed,
    u: grant.userId,
    m: grant.mode,
    d: grant.difficulty,
    n: grant.count,
    x: grant.expiresAt,
  };
  const body = b64url(Buffer.from(JSON.stringify(wire)));
  return `${TOKEN_PREFIX}.${body}.${sign(secret, body)}`;
}

export function verifySeedToken(
  secret: string,
  token: string,
  userId: string,
  now = Date.now(),
): SeedGrant | null {
  const [prefix, body, sig] = token.split('.');
  if (prefix !== TOKEN_PREFIX || !body || !sig) return null;

  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let wire: WireGrant;
  try {
    wire = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as WireGrant;
  } catch {
    return null;
  }
  if (wire.u !== userId || wire.x < now) return null;
  return {
    seed: wire.s,
    userId: wire.u,
    mode: wire.m,
    difficulty: wire.d,
    count: wire.n,
    expiresAt: wire.x,
  };
}

export function dailySeedFor(secret: string, dateKey: string): string {
  return `daily:${createHmac('sha256', secret).update(`daily:${dateKey}`).digest('hex').slice(0, 24)}`;
}
