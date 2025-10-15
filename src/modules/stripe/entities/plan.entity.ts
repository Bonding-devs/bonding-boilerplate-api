import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('plans')
export class PlanEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  stripePriceId: string;

  @Column({ nullable: true })
  stripeProductId?: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ length: 3 })
  currency: string;

  @Column()
  interval: string; // month, year, week, day

  @Column({ default: 1 })
  intervalCount: number;

  @Column({ default: true })
  @Index()
  isActive: boolean;

  @Column({ nullable: true })
  trialPeriodDays?: number;

  @Column('json', { nullable: true })
  features?: string[];

  @Column('json', { nullable: true })
  metadata?: Record<string, any>;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}