import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { UserEntity } from '../../../users/infrastructure/persistence/relational/entities/user.entity';

export enum SubscriptionStatus {
  TRIALING = 'trialing',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  UNPAID = 'unpaid',
  INCOMPLETE = 'incomplete',
}

@Entity('user_subscription')
export class UserSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'userId' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ nullable: true, unique: true })
  @Index()
  stripeSubscriptionId?: string;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  @Index()
  status: SubscriptionStatus;

  @Column()
  @Index()
  planId: string; // price_1_monthly, price_2_monthly, etc.

  @Column({ nullable: true })
  planName?: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ length: 3, default: 'usd' })
  currency: string;

  @Column({ default: 'month' })
  interval: string; // month, year

  @Column({ type: 'int', default: 1 })
  intervalCount: number;

  @Column({ type: Date, nullable: true })
  trialStartDate?: Date;

  @Column({ type: Date, nullable: true })
  trialEndDate?: Date;

  @Column({ type: Date, nullable: true })
  currentPeriodStart?: Date;

  @Column({ type: Date, nullable: true })
  currentPeriodEnd?: Date;

  @Column({ type: Date, nullable: true })
  canceledAt?: Date;

  @Column({ type: Date, nullable: true })
  endedAt?: Date;

  @Column({ type: 'int', default: 0 })
  failedPaymentCount: number;

  @Column('json', { nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}