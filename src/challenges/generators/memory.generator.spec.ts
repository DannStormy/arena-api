import { MemoryGenerator } from './memory.generator';
import { ChallengeType } from '../types/challenge-type.enum';
import { SeededRng } from '../util/seeded-rng';

describe('MemoryGenerator', () => {
  const gen = new MemoryGenerator();

  const generate = (seed: string, difficulty = 3, index = 0) =>
    gen.generate(new SeededRng(`${seed}:${index}`), difficulty, index);

  it('produces the documented shape', () => {
    const c = generate('seed-mem', 3, 0);
    expect(c.type).toBe(ChallengeType.MEMORY);
    expect(c.answerType).toBe('sequence');
    expect(c.maxScore).toBe(1000);
    expect(c.timeLimitMs).toBeGreaterThan(0);

    const prompt = c.prompt as { sequence: number[]; gridSize: number };
    expect(prompt.gridSize).toBe(9);
    expect(Array.isArray(prompt.sequence)).toBe(true);
    // answer mirrors prompt.sequence exactly
    expect(c.answer).toEqual(prompt.sequence);
    // every tile index is within the grid
    for (const tile of prompt.sequence) {
      expect(tile).toBeGreaterThanOrEqual(0);
      expect(tile).toBeLessThan(9);
      expect(Number.isInteger(tile)).toBe(true);
    }
  });

  it('is fully deterministic for a fixed seed', () => {
    const a = generate('fixed-seed', 5, 2);
    const b = generate('fixed-seed', 5, 2);
    expect(a).toEqual(b);
    expect((a.prompt as { sequence: number[] }).sequence).toEqual(
      (b.prompt as { sequence: number[] }).sequence,
    );
  });

  it('grows the sequence length as the set progresses, clamped to 3..8', () => {
    const len = (index: number) =>
      (generate('grow', 3, index).prompt as { sequence: number[] }).sequence.length;
    expect(len(0)).toBe(3);
    expect(len(1)).toBe(4);
    expect(len(4)).toBe(7);
    // clamped at 8 for large indices
    expect(len(10)).toBe(8);
    expect(len(50)).toBe(8);
  });

  it('validates a correct tapped sequence (number[] and comma-string)', () => {
    const c = generate('validate-seed', 4, 1);
    const seq = (c.prompt as { sequence: number[] }).sequence;

    expect(gen.validate(c, seq)).toBe(true);
    expect(gen.validate(c, seq.join(','))).toBe(true);
  });

  it('rejects an incorrect or malformed sequence', () => {
    const c = generate('validate-seed', 4, 1);
    const seq = (c.prompt as { sequence: number[] }).sequence;

    // wrong order / value
    expect(gen.validate(c, [...seq].reverse().concat(99))).toBe(false);
    // truncated
    expect(gen.validate(c, seq.slice(0, seq.length - 1))).toBe(false);
    // garbage
    expect(gen.validate(c, 'not-a-sequence')).toBe(false);
    expect(gen.validate(c, null)).toBe(false);
    expect(gen.validate(c, '')).toBe(false);
  });

  it('scores 0 when wrong and a speed-scaled positive value when right', () => {
    const c = generate('score-seed', 3, 0);
    const seq = (c.prompt as { sequence: number[] }).sequence;

    expect(gen.score(c, seq.slice(0, 1), 100)).toBe(0);

    const fast = gen.score(c, seq, 100);
    const slow = gen.score(c, seq, c.timeLimitMs);
    expect(fast).toBeGreaterThan(0);
    expect(fast).toBeLessThanOrEqual(c.maxScore);
    // Speed floor: a correct-but-slow answer still earns 40% of max.
    expect(slow).toBe(Math.round(c.maxScore * 0.4));
    expect(fast).toBeGreaterThan(slow);
  });
});
