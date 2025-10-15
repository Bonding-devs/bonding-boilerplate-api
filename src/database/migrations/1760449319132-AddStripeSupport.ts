import { MigrationInterface, QueryRunner, TableColumn, Table } from 'typeorm';

export class AddStripeSupport1760449319132 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add stripe_customer_id to users table
    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'stripeCustomerId',
        type: 'varchar',
        isNullable: true,
        isUnique: true,
      }),
    );

    // 2. Create payment_methods table
    await queryRunner.createTable(
      new Table({
        name: 'payment_method',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'stripePaymentMethodId',
            type: 'varchar',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'type',
            type: 'varchar',
            default: "'card'",
          },
          {
            name: 'last4',
            type: 'varchar',
            length: '4',
            isNullable: true,
          },
          {
            name: 'brand',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'expMonth',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'expYear',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'isDefault',
            type: 'boolean',
            default: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedTableName: 'user',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
        indices: [
          {
            name: 'IDX_payment_method_user',
            columnNames: ['userId'],
          },
          {
            name: 'IDX_payment_method_stripe',
            columnNames: ['stripePaymentMethodId'],
          },
        ],
      }),
    );

    // 3. Create stripe_transactions table
    await queryRunner.createTable(
      new Table({
        name: 'stripe_transaction',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'stripePaymentIntentId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'stripeSessionId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '3',
            default: "'usd'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
            default: "'pending'",
          },
          {
            name: 'transactionType',
            type: 'enum',
            enum: ['payment', 'subscription', 'refund', 'payout', 'setup'],
            default: "'payment'",
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'stripeFee',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'netAmount',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'failureReason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'processedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedTableName: 'user',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
        indices: [
          {
            name: 'IDX_stripe_transaction_user',
            columnNames: ['userId'],
          },
          {
            name: 'IDX_stripe_transaction_intent',
            columnNames: ['stripePaymentIntentId'],
          },
          {
            name: 'IDX_stripe_transaction_session',
            columnNames: ['stripeSessionId'],
          },
          {
            name: 'IDX_stripe_transaction_status',
            columnNames: ['status'],
          },
          {
            name: 'IDX_stripe_transaction_type',
            columnNames: ['transactionType'],
          },
        ],
      }),
    );

    // 4. Create webhook_events table for auditing
    await queryRunner.createTable(
      new Table({
        name: 'webhook_event',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'stripeEventId',
            type: 'varchar',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'eventType',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'processingStatus',
            type: 'enum',
            enum: ['pending', 'completed', 'failed', 'retrying'],
            default: "'pending'",
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'retryCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'rawPayload',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'processedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
        indices: [
          {
            name: 'IDX_webhook_event_stripe_id',
            columnNames: ['stripeEventId'],
          },
          {
            name: 'IDX_webhook_event_type',
            columnNames: ['eventType'],
          },
          {
            name: 'IDX_webhook_event_status',
            columnNames: ['processingStatus'],
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order
    await queryRunner.dropTable('webhook_event');
    await queryRunner.dropTable('stripe_transaction');
    await queryRunner.dropTable('payment_method');
    
    // Remove column from users table
    await queryRunner.dropColumn('user', 'stripeCustomerId');
  }
}
