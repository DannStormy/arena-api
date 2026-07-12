import { SeededRng } from './seeded-rng';

describe('SeededRng', () => {
  it('is deterministic: the same seed yields the same sequence', () => {
    const a = new SeededRng('match-123');
    const b = new SeededRng('match-123');
    const seqA = Array.from({ length: 20 }, () => a.nextFloat());
    const seqB = Array.from({ length: 20 }, () => b.nextFloat());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 20 }, ((r) => () => r.nextFloat())(new SeededRng('seed-a')));
    const b = Array.from({ length: 20 }, ((r) => () => r.nextFloat())(new SeededRng('seed-b')));
    expect(a).not.toEqual(b);
  });

  it('nextInt stays within the inclusive bounds', () => {
    const rng = new SeededRng('bounds');
    for (let i = 0; i < 1000; i++) {
      const n = rng.nextInt(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('pick returns an element of the array', () => {
    const rng = new SeededRng('pick');
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items));
    }
  });
});
