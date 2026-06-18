import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { ProgressionConfigValues } from '../types/progression-config.types';

@Entity('progression_config_versions')
export class ProgressionConfigVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb' })
  values: ProgressionConfigValues;

  @Column()
  effectiveFrom: Date;

  @Column({ type: 'varchar', nullable: true })
  changedBy: string | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
