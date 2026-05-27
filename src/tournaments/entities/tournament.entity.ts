import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TournamentArena } from '../types/tournament-arena.enum';
import { TournamentStatus } from '../types/tournament-status.enum';
import { GameType } from '../../game-sessions/types/game-type.enum';

@Entity('tournaments')
export class Tournament {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'enum', enum: TournamentArena })
  arena: TournamentArena;

  @Column({ type: 'enum', enum: GameType })
  gameType: GameType;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  entryFee: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  prizeFirst: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  prizeSecond: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  prizeThird: string;

  @Column({ nullable: true })
  maxPlayers: number;

  @Column({ default: 10 })
  minPlayers: number;

  @Column({ type: 'enum', enum: TournamentStatus, default: TournamentStatus.DRAFT })
  status: TournamentStatus;

  @Column({ nullable: true })
  scheduledAt: Date;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ default: false })
  isFunded: boolean;

  @Column()
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
