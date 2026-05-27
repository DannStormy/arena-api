import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Tournament } from './tournament.entity';
import { User } from '../../users/entities/user.entity';

export enum EntryStatus {
  REGISTERED = 'registered',
  ACTIVE = 'active',
  ELIMINATED = 'eliminated',
  COMPLETED = 'completed',
}

@Entity('tournament_entries')
@Unique(['tournamentId', 'userId'])
export class TournamentEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tournament, { onDelete: 'CASCADE' })
  tournament: Tournament;

  @Column()
  tournamentId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ default: 0 })
  score: number;

  @Column({ nullable: true })
  rank: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  prizeWon: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  entryFeePaid: string;

  @Column({ type: 'enum', enum: EntryStatus, default: EntryStatus.REGISTERED })
  status: EntryStatus;

  @CreateDateColumn()
  joinedAt: Date;
}
