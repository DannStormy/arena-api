import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ChallengeGenerator } from './generators/challenge-generator.interface';
import { MathGenerator } from './generators/math.generator';
import { ChallengeType } from './types/challenge-type.enum';
import { ChallengeMode } from './types/challenge-mode.enum';
import { Challenge, GeneratedChallenge } from './types/challenge.interface';
import { SeededRng } from './util/seeded-rng';

const MAX_SET_SIZE = 50;

export interface GenerateSetParams {
  matchSeed: string;
  mode: ChallengeMode;
  count: number;
  difficulty: number;
}

export interface ValidateParams {
  matchSeed: string;
  mode: ChallengeMode;
  difficulty: number;
  index: number;
  submitted: unknown;
  elapsedMs: number;
}

export interface ValidationResult {
  index: number;
  correct: boolean;
  score: number;
}

/**
 * Produces and validates challenge sets. Modes are filters over the registered
 * generators; generation is deterministic per (matchSeed, index) so validation
 * re-derives the challenge instead of storing it.
 */
@Injectable()
export class ChallengeService {
  private readonly logger = new Logger(ChallengeService.name);
  private readonly generators: Map<ChallengeType, ChallengeGenerator>;

  constructor() {
    // Register generators here. Adding one makes it available to BRAIN_DUEL.
    const registered: ChallengeGenerator[] = [new MathGenerator()];
    this.generators = new Map(registered.map((g) => [g.type, g]));
    this.logger.log(`Registered generators: ${[...this.generators.keys()].join(', ')}`);
  }

  /** Client-safe set (answers stripped). */
  generateSet(params: GenerateSetParams): Challenge[] {
    return this.generateInternalSet(params).map(toClientChallenge);
  }

  /**
   * Re-derives the challenge at `index` from the seed and checks the answer.
   * Because generation is deterministic, nothing is stored between serving a
   * challenge and validating its answer — this is server-authoritative scoring.
   */
  validateSubmission(params: ValidateParams): ValidationResult {
    const { matchSeed, mode, difficulty, index, submitted, elapsedMs } = params;
    if (index < 0) throw new BadRequestException('index must be >= 0');

    const types = this.typesForMode(mode);
    const generator = this.generatorForIndex(matchSeed, types, index);
    const challenge = generator.generate(rngFor(matchSeed, index), difficulty, index);

    return {
      index,
      correct: generator.validate(challenge, submitted),
      score: generator.score(challenge, submitted, elapsedMs),
    };
  }

  private generateInternalSet(params: GenerateSetParams): GeneratedChallenge[] {
    const { matchSeed, mode, count, difficulty } = params;
    if (!matchSeed) throw new BadRequestException('matchSeed is required');
    if (count < 1 || count > MAX_SET_SIZE) {
      throw new BadRequestException(`count must be between 1 and ${MAX_SET_SIZE}`);
    }

    const types = this.typesForMode(mode);
    const set: GeneratedChallenge[] = [];
    for (let index = 0; index < count; index++) {
      const generator = this.generatorForIndex(matchSeed, types, index);
      set.push(generator.generate(rngFor(matchSeed, index), difficulty, index));
    }
    return set;
  }

  /** Modes are filters over the registered generators. */
  private typesForMode(mode: ChallengeMode): ChallengeType[] {
    let wanted: ChallengeType[];
    switch (mode) {
      case ChallengeMode.SPEED_MATH:
        wanted = [ChallengeType.MATH];
        break;
      case ChallengeMode.BRAIN_DUEL:
        // every deterministic generator currently registered
        wanted = [...this.generators.keys()];
        break;
      default:
        throw new BadRequestException(`Unsupported mode: ${mode as string}`);
    }

    const available = wanted.filter((t) => this.generators.has(t));
    if (available.length === 0) {
      throw new BadRequestException(`No generators registered for mode: ${mode}`);
    }
    return available;
  }

  private generatorForIndex(
    matchSeed: string,
    types: ChallengeType[],
    index: number,
  ): ChallengeGenerator {
    // A separate rng stream so choosing the type doesn't perturb the problem.
    const type = new SeededRng(`${matchSeed}:type:${index}`).pick(types);
    const generator = this.generators.get(type);
    if (!generator) {
      // types are pre-filtered to registered generators — unreachable in practice
      throw new BadRequestException(`No generator for type: ${type}`);
    }
    return generator;
  }
}

function rngFor(matchSeed: string, index: number): SeededRng {
  return new SeededRng(`${matchSeed}:${index}`);
}

function toClientChallenge(challenge: GeneratedChallenge): Challenge {
  const { answer: _answer, ...safe } = challenge;
  return safe;
}
