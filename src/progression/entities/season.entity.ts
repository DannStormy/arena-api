import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { SeasonStatus } from '../types/season-status.enum';

@Entity('seasons')
export class Season {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 7 })
  label: string; // YYYY-MM

  @Column()
  startsAt: Date;

  @Column()
  endsAt: Date;

  @Column({ type: 'enum', enum: SeasonStatus, default: SeasonStatus.ACTIVE })
  status: SeasonStatus;

  @CreateDateColumn()
  createdAt: Date;
}
