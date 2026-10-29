import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PayoutStatus } from '../payout-status.enum';

@Entity('payouts')
export class Payout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  entryId: string;

  @Column()
  userId: string;

  @Column({ type: 'int' })
  amountKobo: number;

  @Column({ type: 'enum', enum: PayoutStatus, default: PayoutStatus.PENDING })
  status: PayoutStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'varchar', nullable: true, unique: true })
  transferReference: string | null;

  @Column({ type: 'varchar', nullable: true })
  transferCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  failureReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
