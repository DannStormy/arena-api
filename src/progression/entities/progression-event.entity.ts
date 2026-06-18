import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Ledger } from '../types/ledger.enum';
import { EventReason } from '../types/event-reason.enum';

@Entity('progression_events')
// One award per user per ledger per source per reason — prevents double-awarding on replay.
@Unique(['userId', 'ledger', 'sourceType', 'sourceId', 'reason'])
@Index(['userId', 'ledger', 'seasonId'])
export class ProgressionEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'enum', enum: Ledger })
  ledger: Ledger;

  @Column({ type: 'int' })
  points: number;

  @Column({ type: 'enum', enum: EventReason })
  reason: EventReason;

  @Column({ type: 'varchar', nullable: true })
  sourceType: string | null;

  @Column({ type: 'varchar', nullable: true })
  sourceId: string | null;

  @Column({ type: 'varchar', nullable: true })
  seasonId: string | null;

  @Column({ type: 'uuid', nullable: true })
  configVersionId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
