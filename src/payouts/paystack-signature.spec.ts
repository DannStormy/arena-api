import { createHmac } from 'crypto';
import { isValidPaystackSignature } from './paystack-signature';

describe('isValidPaystackSignature', () => {
  const body = Buffer.from(
    JSON.stringify({ event: 'transfer.success', data: { reference: 'abc' } }),
  );
  const sign = (secret: string, b: Buffer) => createHmac('sha512', secret).update(b).digest('hex');

  it('accepts the exact body signed with the secret', () => {
    expect(isValidPaystackSignature('sk_test', body, sign('sk_test', body))).toBe(true);
  });

  it('rejects missing, wrong-secret and tampered signatures', () => {
    expect(isValidPaystackSignature('sk_test', body, undefined)).toBe(false);
    expect(isValidPaystackSignature('sk_test', body, sign('other', body))).toBe(false);
    const tampered = Buffer.from(body.toString().replace('abc', 'xyz'));
    expect(isValidPaystackSignature('sk_test', tampered, sign('sk_test', body))).toBe(false);
  });
});
