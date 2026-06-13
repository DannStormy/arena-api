import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ type: 'varchar', nullable: true })
  bankAccountNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  bankCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  bankAccountName: string | null;

  @Column({ unique: true })
  referralCode: string;

  @Column({ nullable: true })
  referredBy: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isAdmin: boolean;

  @Column({
    type: 'bigint',
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) },
  })
  lifetimeXp: number;

  @Column({ type: 'int', default: 0 })
  seasonPoints: number;

  @Column({ type: 'varchar', nullable: true })
  seasonId: string | null;

  @Column({ type: 'int', default: 0 })
  duelWinStreak: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
