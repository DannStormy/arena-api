import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_progression_backup')
export class UserProgressionBackup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @Column({ type: 'bigint', default: 0 })
  lifetimeXp: string;

  @Column({ type: 'int', default: 0 })
  seasonPoints: number;

  @Column({ type: 'varchar', nullable: true })
  seasonId: string | null;

  @Column({ type: 'varchar', nullable: true })
  allTimeHighestRank: string | null;

  @CreateDateColumn()
  snapshotAt: Date;
}
