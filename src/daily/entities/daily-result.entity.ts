import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * One recorded run of the shared Daily Challenge. Everyone gets the identical
 * seeded set on a given UTC day; each user may record exactly ONE result per day
 * (enforced by the (userId, date) unique constraint) — a Wordle-style one-shot.
 *
 * `date` is a calendar day (Postgres `date`), always the UTC day key
 * "YYYY-MM-DD". Stored as a string so there is no timezone drift between write
 * and read — the value round-trips exactly as generated server-side in UTC.
 */
@Entity('daily_results')
@Unique(['userId', 'date'])
@Index(['date', 'score'])
export class DailyResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 0 })
  score: number;

  @Column({ type: 'int', default: 0 })
  correctCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
