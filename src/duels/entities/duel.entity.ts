import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DuelMode } from '../types/duel-mode.enum';
import { DuelStatus } from '../types/duel-status.enum';
import { TournamentArena } from '../../tournaments/types/tournament-arena.enum';

@Entity('duels')
export class Duel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 6 })
  code: string;

  @Column({ type: 'enum', enum: DuelMode })
  mode: DuelMode;

  @Column({ type: 'enum', enum: TournamentArena })
  arena: TournamentArena;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  stake: string;

  @Column({ type: 'enum', enum: DuelStatus, default: DuelStatus.PENDING })
  status: DuelStatus;

  @Column({ type: 'jsonb' })
  questionIds: string[];

  @Column({ default: 0 })
  currentQuestionIndex: number;

  @Column({ type: 'varchar' })
  challengerId: string;

  @Column({ type: 'varchar', nullable: true })
  opponentId: string | null;

  @Column({ default: 0 })
  challengerScore: number;

  @Column({ default: 0 })
  opponentScore: number;

  @Column({ default: 0 })
  challengerStreak: number;

  @Column({ default: 0 })
  opponentStreak: number;

  @Column({ default: 0 })
  challengerMaxStreak: number;

  @Column({ default: 0 })
  opponentMaxStreak: number;

  @Column({ type: 'varchar', nullable: true })
  winnerId: string | null;

  @Column({ type: 'varchar', nullable: true })
  resolution: 'score' | 'speed_tiebreak' | 'sudden_death' | 'forfeit' | 'draw' | null;

  @Column({ type: 'int', nullable: true })
  tiebreakDeltaMs: number | null;

  @Column({ type: 'boolean', default: false })
  isFlagged: boolean;

  @Column({ type: 'boolean', default: false })
  progressionAwarded: boolean;

  @Column({ type: 'int', nullable: true })
  challengerXpAwarded: number | null;

  @Column({ type: 'int', nullable: true })
  challengerSpAwarded: number | null;

  @Column({ type: 'int', nullable: true })
  opponentXpAwarded: number | null;

  @Column({ type: 'int', nullable: true })
  opponentSpAwarded: number | null;

  @Column({ type: 'boolean', default: false })
  isTie: boolean;

  @Column({ default: 0 })
  suddenDeathRound: number;

  @Column({ type: 'varchar', nullable: true })
  stealOpportunityUserId: string | null;

  @Column({ type: 'varchar', nullable: true })
  stealQuestionId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
