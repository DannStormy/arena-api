import { issueSeedToken, verifySeedToken } from './seed-token';
import { ChallengeMode } from './types/challenge-mode.enum';

const grant = {
  seed: 'abc-123',
  userId: 'u1',
  mode: ChallengeMode.SPEED_MATH,
  difficulty: 4,
  count: 10,
  expiresAt: 2_000,
};

describe('seed tokens', () => {
  it('round-trips for the right user before expiry', () => {
    const token = issueSeedToken('s', grant);
    expect(token).not.toContain('abc-123');
    expect(verifySeedToken('s', token, 'u1', 1_000)).toEqual(grant);
  });

  it('rejects other users, expiry, wrong secrets and tampering', () => {
    const token = issueSeedToken('s', grant);
    expect(verifySeedToken('s', token, 'u2', 1_000)).toBeNull();
    expect(verifySeedToken('s', token, 'u1', 3_000)).toBeNull();
    expect(verifySeedToken('other', token, 'u1', 1_000)).toBeNull();

    const [prefix, , sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ s: 'mine', u: 'u1', m: 'speed_math', d: 1, n: 50, x: 9e12 }),
    ).toString('base64url');
    expect(verifySeedToken('s', `${prefix}.${forged}.${sig}`, 'u1', 1_000)).toBeNull();
    expect(verifySeedToken('s', 'daily:2026-07-14', 'u1', 1_000)).toBeNull();
  });
});
