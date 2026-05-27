import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Question } from './question.entity';

@Entity('user_question_history')
@Unique(['userId', 'questionId'])
export class UserQuestionHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  question: Question;

  @Column()
  questionId: string;

  @Column()
  shownAt: Date;

  @Column()
  answeredCorrectly: boolean;
}
