import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('duel_configs')
export class DuelConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 30 })
  expiryMinutes: number;

  @Column({ default: 10 })
  questionsPerDuel: number;

  @Column({ default: 30 })
  forfeitTimeoutSeconds: number;

  @Column({ type: 'jsonb', default: () => "'[0,100,200,500,1000]'" })
  stakeTiers: number[];

  @UpdateDateColumn()
  updatedAt: Date;
}
