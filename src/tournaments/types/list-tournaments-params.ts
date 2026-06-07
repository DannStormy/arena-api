import { TournamentArena } from './tournament-arena.enum';
import { TournamentStatus } from './tournament-status.enum';
import { GameType } from '../../game-sessions/types/game-type.enum';

export interface ListTournamentsParams {
  page: number;
  limit: number;
  order: 'asc' | 'desc';
  search?: string;
  arena?: TournamentArena;
  status?: TournamentStatus;
  gameType?: GameType;
  userId?: string;
}
