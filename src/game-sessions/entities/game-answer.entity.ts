import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { GameSession } from './game-session.entity';
import { Question } from '../../questions/entities/question.entity';

@Entity('game_answers')
export class GameAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => GameSession, { onDelete: 'CASCADE' })
  session: GameSession;

  @Column()
  sessionId: string;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  question: Question;

  @Column()
  questionId: string;

  @Column()
  selectedAnswer: number;

  @Column()
  isCorrect: boolean;

  @CreateDateColumn()
  answeredAt: Date;

  @Column({ type: 'bigint', nullable: true })
  clientTimestamp: string;

  @Column({ type: 'bigint' })
  serverTimestamp: string;

  @Column({ nullable: true })
  timeTakenMs: number;
}
