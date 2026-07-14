/**
 * A mode is just a filter over the registered challenge generators.
 * SPEED_MATH pulls only MATH; BRAIN_DUEL mixes every deterministic generator.
 */
export enum ChallengeMode {
  SPEED_MATH = 'speed_math',
  BRAIN_DUEL = 'brain_duel',
  MEMORY = 'memory',
}
