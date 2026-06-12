import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Question } from './question.entity';
import { ReportReason } from '../types/report-reason.enum';

@Entity('question_reports')
@Unique(['questionId', 'userId'])
export class QuestionReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  question: Question;

  @Column({ type: 'varchar' })
  questionId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'enum', enum: ReportReason })
  reason: ReportReason;

  @CreateDateColumn()
  createdAt: Date;
}
