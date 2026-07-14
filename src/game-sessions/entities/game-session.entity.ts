import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tournament } from '../../tournaments/entities/tournament.entity';
import { GameType } from '../types/game-type.enum';
import { SessionStatus } from '../types/session-status.enum';
import { ProgressionSnapshot } from '../../duels/duel-progression';

@Entity('game_sessions')
export class GameSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nullable: solo sessions have no tournament (POST /game-sessions/solo).
  @ManyToOne(() => Tournament, { onDelete: 'CASCADE', nullable: true })
  tournament: Tournament | null;

  @Column({ nullable: true })
  tournamentId: string | null;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: GameType })
  gameType: GameType;

  @Column({ type: 'enum', enum: SessionStatus, default: SessionStatus.ACTIVE })
  status: SessionStatus;

  @Column({ type: 'jsonb' })
  questionIds: string[];

  @Column({ default: 0 })
  currentIndex: number;

  @Column({ default: 0 })
  score: number;

  @Column({ default: 0 })
  correctAnswers: number;

  @Column({ default: 0 })
  totalAnswered: number;

  @Column({ default: false })
  isFlagged: boolean;

  @Column({ nullable: true })
  flagReason: string;

  @Column({ type: 'boolean', default: false })
  progressionAwarded: boolean;

  @Column({ type: 'jsonb', nullable: true })
  sessionProgression: ProgressionSnapshot | null;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;
}
