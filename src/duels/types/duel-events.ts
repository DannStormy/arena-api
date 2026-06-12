export const DuelEvents = {
  // client → server
  JOIN_DUEL: 'join_duel',
  SUBMIT_ANSWER: 'submit_answer',
  FORFEIT: 'forfeit',

  // server → client
  DUEL_READY: 'duel_ready',
  QUESTION_READY: 'question_ready',
  ANSWER_RESULT: 'answer_result',
  OPPONENT_ANSWERED: 'opponent_answered',
  STEAL_OPPORTUNITY: 'steal_opportunity',
  STEAL_RESULT: 'steal_result',
  DUEL_COMPLETE: 'duel_complete',
  OPPONENT_DISCONNECTED: 'opponent_disconnected',
  DUEL_FORFEITED: 'duel_forfeited',
} as const;
