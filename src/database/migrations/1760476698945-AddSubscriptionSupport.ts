import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class AddSubscriptionSupport1760476698945 implements MigrationInterface {
    name = 'AddSubscriptionSupport1760476698945'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create user_subscription table (optional for subscription-based apps)
        await queryRunner.createTable(
            new Table({
                name: 'user_subscription',
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
                        // Multiple subscriptions per user allowed
                    },
                    {
                        name: 'stripeSubscriptionId',
                        type: 'varchar',
                        isNullable: true,
                        isUnique: true,
                    },
                    {
                        name: 'status',
                        type: 'enum',
                        enum: ['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete'],
                        default: "'active'",
                    },
                    {
                        name: 'planId',
                        type: 'varchar',
                        isNullable: false,
                    },
                    {
                        name: 'planName',
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
                        name: 'interval',
                        type: 'varchar',
                        default: "'month'",
                    },
                    {
                        name: 'intervalCount',
                        type: 'int',
                        default: 1,
                    },
                    {
                        name: 'trialStartDate',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'trialEndDate',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'currentPeriodStart',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'currentPeriodEnd',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'canceledAt',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'endedAt',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'failedPaymentCount',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'metadata',
                        type: 'json',
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
                indices: [
                    {
                        name: 'IDX_user_subscription_user_id',
                        columnNames: ['userId'],
                    },
                    {
                        name: 'IDX_user_subscription_stripe_id',
                        columnNames: ['stripeSubscriptionId'],
                    },
                    {
                        name: 'IDX_user_subscription_status',
                        columnNames: ['status'],
                    },
                    {
                        name: 'IDX_user_subscription_plan',
                        columnNames: ['planId'],
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
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop user_subscription table
        await queryRunner.dropTable('user_subscription');
    }

}
