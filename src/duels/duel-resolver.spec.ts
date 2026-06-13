import { resolveDuel, DuelAnswerLike } from './duel-resolver';

const C = 'challenger-id';
const O = 'opponent-id';

function makeAnswers(
  items: Array<{ userId: string; isCorrect: boolean; timeTakenMs: number | null }>,
): DuelAnswerLike[] {
  return items;
}

describe('resolveDuel', () => {
  describe('A. Trivia 9–9, challenger correct-time 41200ms, opponent 42600ms', () => {
    it('challenger wins by speed tiebreak with delta 1400ms', () => {
      const answers = makeAnswers([
        { userId: C, isCorrect: true, timeTakenMs: 41200 },
        { userId: O, isCorrect: true, timeTakenMs: 42600 },
      ]);
      const result = resolveDuel({
        challengerId: C,
        opponentId: O,
        challengerScore: 9,
        opponentScore: 9,
        answers,
      });
      expect(result.winnerId).toBe(C);
      expect(result.resolution).toBe('speed_tiebreak');
      expect(result.tiebreakDeltaMs).toBe(1400);
    });
  });

  describe('B. Same scores, opponent faster', () => {
    it('opponent wins by speed tiebreak with delta 1400ms', () => {
      const answers = makeAnswers([
        { userId: C, isCorrect: true, timeTakenMs: 42600 },
        { userId: O, isCorrect: true, timeTakenMs: 41200 },
      ]);
      const result = resolveDuel({
        challengerId: C,
        opponentId: O,
        challengerScore: 9,
        opponentScore: 9,
        answers,
      });
      expect(result.winnerId).toBe(O);
      expect(result.resolution).toBe('speed_tiebreak');
      expect(result.tiebreakDeltaMs).toBe(1400);
    });
  });

  describe('C. Trivia 12–7', () => {
    it('higher scorer wins by score', () => {
      const result = resolveDuel({
        challengerId: C,
        opponentId: O,
        challengerScore: 12,
        opponentScore: 7,
        answers: [],
      });
      expect(result.winnerId).toBe(C);
      expect(result.resolution).toBe('score');
      expect(result.tiebreakDeltaMs).toBe(0);
    });

    it('opponent wins when opponent score is higher', () => {
      const result = resolveDuel({
        challengerId: C,
        opponentId: O,
        challengerScore: 7,
        opponentScore: 12,
        answers: [],
      });
      expect(result.winnerId).toBe(O);
      expect(result.resolution).toBe('score');
    });
  });

  describe('D. Sudden Death, opponent broke first', () => {
    it('challenger wins via sudden_death resolution', () => {
      const result = resolveDuel({
        challengerId: C,
        opponentId: O,
        challengerScore: 1,
        opponentScore: 0,
        answers: [],
        suddenDeathLoserId: O,
      });
      expect(result.winnerId).toBe(C);
      expect(result.loserId).toBe(O);
      expect(result.resolution).toBe('sudden_death');
    });
  });

  describe('E. Forfeit by opponent who had the higher score', () => {
    it('non-forfeiting challenger wins regardless of score', () => {
      const result = resolveDuel({
        challengerId: C,
        opponentId: O,
        challengerScore: 3,
        opponentScore: 9,
        answers: [],
        forfeitedBy: O,
      });
      expect(result.winnerId).toBe(C);
      expect(result.loserId).toBe(O);
      expect(result.resolution).toBe('forfeit');
    });
  });

  describe('F. 9–9 with identical correct-answer time', () => {
    it('results in a draw with null winnerId', () => {
      const answers = makeAnswers([
        { userId: C, isCorrect: true, timeTakenMs: 5000 },
        { userId: O, isCorrect: true, timeTakenMs: 5000 },
      ]);
      const result = resolveDuel({
        challengerId: C,
        opponentId: O,
        challengerScore: 9,
        opponentScore: 9,
        answers,
      });
      expect(result.winnerId).toBeNull();
      expect(result.loserId).toBeNull();
      expect(result.resolution).toBe('draw');
      expect(result.tiebreakDeltaMs).toBe(0);
    });
  });

  describe('G. 9–9 where one player has null timeTakenMs', () => {
    it('treats null as 0ms and resolves to a winner without crashing', () => {
      const answers = makeAnswers([
        { userId: C, isCorrect: true, timeTakenMs: null },
        { userId: O, isCorrect: true, timeTakenMs: 3000 },
      ]);
      const result = resolveDuel({
        challengerId: C,
        opponentId: O,
        challengerScore: 9,
        opponentScore: 9,
        answers,
      });
      // null treated as 0ms → challenger has 0ms, opponent has 3000ms → challenger faster
      expect(result.winnerId).toBe(C);
      expect(result.resolution).toBe('speed_tiebreak');
      expect(result.tiebreakDeltaMs).toBe(3000);
    });
  });

  describe('forfeit overrides suddenDeathLoserId', () => {
    it('forfeit takes priority when both forfeitedBy and suddenDeathLoserId are set', () => {
      const result = resolveDuel({
        challengerId: C,
        opponentId: O,
        challengerScore: 5,
        opponentScore: 5,
        answers: [],
        forfeitedBy: C,
        suddenDeathLoserId: O,
      });
      expect(result.resolution).toBe('forfeit');
      expect(result.winnerId).toBe(O);
    });
  });
});
