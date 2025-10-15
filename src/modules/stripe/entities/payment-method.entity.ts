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

@Entity('payment_method')
export class PaymentMethodEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'userId' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ unique: true })
  stripePaymentMethodId: string;

  @Column({ default: 'card' })
  type: string;

  @Column({ length: 4, nullable: true })
  last4?: string;

  @Column({ nullable: true })
  brand?: string;

  @Column({ nullable: true })
  expMonth?: number;

  @Column({ nullable: true })
  expYear?: number;

  @Column({ default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}