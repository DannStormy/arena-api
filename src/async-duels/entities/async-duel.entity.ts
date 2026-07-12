import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChallengeMode } from '../../challenges/types/challenge-mode.enum';
import { DuelResolution } from '../../duels/duel-resolver';
import { ProgressionSnapshot } from '../../duels/duel-progression';
import { AsyncDuelMatchType } from '../types/async-duel-match-type.enum';
import { AsyncDuelStatus } from '../types/async-duel-status.enum';

/**
 * An asynchronous duel: two players race the SAME deterministic challenge set
 * without being online at the same time. Free-to-play (no stakes/wallet).
 *
 * The "creator" is always the live player who opened the match. The "opponent"
 * is either the friend who plays the shared link, or — for a ghost match — the
 * original player whose recorded run is being raced.
 */
@Entity('async_duels')
@Index(['mode', 'difficulty', 'status'])
export class AsyncDuel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 6 })
  code: string;

  @Column({ type: 'varchar' })
  matchSeed: string;

  @Column({ type: 'enum', enum: ChallengeMode })
  mode: ChallengeMode;

  @Column({ type: 'int' })
  difficulty: number;

  @Column({ type: 'int', default: 10 })
  challengeCount: number;

  @Column({ type: 'enum', enum: AsyncDuelMatchType })
  matchType: AsyncDuelMatchType;

  @Column({ type: 'enum', enum: AsyncDuelStatus, default: AsyncDuelStatus.AWAITING_OPPONENT })
  status: AsyncDuelStatus;

  @Column({ type: 'varchar' })
  creatorId: string;

  @Column({ type: 'varchar', nullable: true })
  opponentId: string | null;

  @Column({ type: 'int', default: 0 })
  creatorScore: number;

  @Column({ type: 'int', default: 0 })
  opponentScore: number;

  @Column({ type: 'int', default: 0 })
  creatorCorrect: number;

  @Column({ type: 'int', default: 0 })
  opponentCorrect: number;

  @Column({ type: 'int', default: 0 })
  creatorElapsedMs: number;

  @Column({ type: 'int', default: 0 })
  opponentElapsedMs: number;

  @Column({ type: 'timestamp', nullable: true })
  creatorCompletedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  opponentCompletedAt: Date | null;

  /** Whether the creator's completed run can serve as a ghost for others. */
  @Column({ type: 'boolean', default: false })
  ghostEligible: boolean;

  @Column({ type: 'varchar', nullable: true })
  winnerId: string | null;

  @Column({ type: 'varchar', nullable: true })
  resolution: DuelResolution | null;

  @Column({ type: 'int', nullable: true })
  tiebreakDeltaMs: number | null;

  @Column({ type: 'boolean', default: false })
  isTie: boolean;

  // ── Progression (mirrors Duel; only the live players get awarded) ──
  @Column({ type: 'boolean', default: false })
  progressionAwarded: boolean;

  @Column({ type: 'int', nullable: true })
  creatorXpAwarded: number | null;

  @Column({ type: 'int', nullable: true })
  creatorSpAwarded: number | null;

  @Column({ type: 'int', nullable: true })
  opponentXpAwarded: number | null;

  @Column({ type: 'int', nullable: true })
  opponentSpAwarded: number | null;

  @Column({ type: 'jsonb', nullable: true })
  creatorProgression: ProgressionSnapshot | null;

  @Column({ type: 'jsonb', nullable: true })
  opponentProgression: ProgressionSnapshot | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
