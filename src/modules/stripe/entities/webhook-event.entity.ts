import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum WebhookProcessingStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

@Entity('webhook_event')
export class WebhookEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  stripeEventId: string;

  @Column()
  @Index()
  eventType: string;

  @Column({
    type: 'enum',
    enum: WebhookProcessingStatus,
    default: WebhookProcessingStatus.PENDING,
  })
  @Index()
  processingStatus: WebhookProcessingStatus;

  @Column('text', { nullable: true })
  errorMessage?: string;

  @Column({ default: 0 })
  retryCount: number;

  @Column('json', { nullable: true })
  rawPayload?: Record<string, any>;

  @Column({ nullable: true })
  processedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}