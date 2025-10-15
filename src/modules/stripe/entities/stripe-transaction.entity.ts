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

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing', 
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

export enum TransactionType {
  PAYMENT = 'payment',
  SUBSCRIPTION = 'subscription',
  REFUND = 'refund',
  PAYOUT = 'payout',
  SETUP = 'setup',
}

@Entity('stripe_transaction')
export class StripeTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'userId' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ nullable: true })
  @Index()
  stripePaymentIntentId?: string;

  @Column({ nullable: true })
  @Index()
  stripeSessionId?: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ length: 3, default: 'usd' })
  currency: string;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  @Index()
  status: TransactionStatus;

  @Column({
    type: 'enum',
    enum: TransactionType,
    default: TransactionType.PAYMENT,
  })
  @Index()
  transactionType: TransactionType;

  @Column('text', { nullable: true })
  description?: string;

  @Column('json', { nullable: true })
  metadata?: Record<string, any>;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  stripeFee?: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  netAmount?: number;

  @Column('text', { nullable: true })
  failureReason?: string;

  @Column({ nullable: true })
  processedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}