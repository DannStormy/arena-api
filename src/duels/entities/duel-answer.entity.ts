import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Duel } from './duel.entity';
import { Question } from '../../questions/entities/question.entity';

@Entity('duel_answers')
export class DuelAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Duel, { onDelete: 'CASCADE' })
  duel: Duel;

  @Column({ type: 'varchar' })
  duelId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  question: Question;

  @Column({ type: 'varchar' })
  questionId: string;

  @Column()
  selectedAnswer: number;

  @Column()
  isCorrect: boolean;

  @Column({ default: false })
  isSteal: boolean;

  @Column({ type: 'boolean', nullable: true })
  stealSuccess: boolean | null;

  @Column({ type: 'int', nullable: true })
  timeTakenMs: number | null;

  @CreateDateColumn()
  answeredAt: Date;
}
