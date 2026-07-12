import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AsyncDuel } from './async-duel.entity';

/**
 * One validated answer for one player within an async duel. Correctness and
 * score are ALWAYS server-derived via ChallengeService.validateSubmission —
 * never trusted from the client.
 */
@Entity('async_duel_answers')
@Index(['asyncDuelId', 'userId', 'index'], { unique: true })
export class AsyncDuelAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AsyncDuel, { onDelete: 'CASCADE' })
  asyncDuel: AsyncDuel;

  @Column({ type: 'varchar' })
  asyncDuelId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'int' })
  index: number;

  @Column({ type: 'jsonb', nullable: true })
  submitted: unknown;

  @Column({ type: 'boolean' })
  isCorrect: boolean;

  @Column({ type: 'int' })
  score: number;

  @Column({ type: 'int' })
  elapsedMs: number;

  @CreateDateColumn()
  answeredAt: Date;
}
