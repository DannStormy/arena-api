import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Ledger } from '../types/ledger.enum';

@Entity('progression_projections')
@Index(['userId', 'ledger', 'seasonId'])
export class ProgressionProjection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'enum', enum: Ledger })
  ledger: Ledger;

  // null for level (permanent); YYYY-MM for rank ledgers
  @Column({ type: 'varchar', nullable: true })
  seasonId: string | null;

  @Column({ type: 'int', default: 0 })
  total: number;

  // Level ledger only
  @Column({ type: 'int', nullable: true })
  levelNumber: number | null;

  // Rank ledgers only — effective tier (shield applied)
  @Column({ type: 'varchar', nullable: true })
  tier: string | null;

  // Rank ledgers only — highest tier crossed above its floor this season (drives shield)
  @Column({ type: 'varchar', nullable: true })
  seasonPeakTier: string | null;

  // Rank ledgers only
  @Column({ type: 'boolean', default: false })
  demotionShieldActive: boolean;

  // Rank ledgers — highest tier ever reached across all seasons
  @Column({ type: 'varchar', nullable: true })
  allTimePeakTier: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
