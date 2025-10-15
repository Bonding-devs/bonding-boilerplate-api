import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePlansTable1760560382136 implements MigrationInterface {
    name = 'CreatePlansTable1760560382136'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_webhook_event_stripe_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_webhook_event_type"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_webhook_event_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_subscription_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_subscription_stripe_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_subscription_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_subscription_plan"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_stripe_transaction_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_stripe_transaction_intent"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_stripe_transaction_session"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_stripe_transaction_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_stripe_transaction_type"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_payment_method_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_payment_method_stripe"`);
        await queryRunner.query(`CREATE TABLE "plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "stripePriceId" character varying NOT NULL, "stripeProductId" character varying, "name" character varying NOT NULL, "description" character varying, "amount" numeric(10,2) NOT NULL, "currency" character varying(3) NOT NULL, "interval" character varying NOT NULL, "intervalCount" integer NOT NULL DEFAULT '1', "isActive" boolean NOT NULL DEFAULT true, "trialPeriodDays" integer, "features" json, "metadata" json, "sortOrder" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_b671aaeeecb098232ba628bf2e6" UNIQUE ("stripePriceId"), CONSTRAINT "PK_3720521a81c7c24fe9b7202ba61" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b671aaeeecb098232ba628bf2e" ON "plans" ("stripePriceId") `);
        await queryRunner.query(`CREATE INDEX "IDX_164893ceb7b239abab62bc1c34" ON "plans" ("isActive") `);
        await queryRunner.query(`CREATE INDEX "IDX_c09577a1ec0bac90e59b56818c" ON "webhook_event" ("stripeEventId") `);
        await queryRunner.query(`CREATE INDEX "IDX_db84c8f3b1f0241e1c0535e2e2" ON "webhook_event" ("eventType") `);
        await queryRunner.query(`CREATE INDEX "IDX_2dd4a32ae024e7fa3f4ffa68d5" ON "webhook_event" ("processingStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_c9c4ae23ac24a9e530234d890d" ON "user_subscription" ("stripeSubscriptionId") `);
        await queryRunner.query(`CREATE INDEX "IDX_ba5595d271cc80777db6d13df9" ON "user_subscription" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_51df5b3f20f1871dbce5e90ce4" ON "user_subscription" ("planId") `);
        await queryRunner.query(`CREATE INDEX "IDX_afdc3435b7d976949e8896471c" ON "stripe_transaction" ("stripePaymentIntentId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c17e1dd195220af6d669b12c96" ON "stripe_transaction" ("stripeSessionId") `);
        await queryRunner.query(`CREATE INDEX "IDX_4704da08e05edc1b8440157eca" ON "stripe_transaction" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_e8013d1363b586a3c1e83277c3" ON "stripe_transaction" ("transactionType") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_e8013d1363b586a3c1e83277c3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4704da08e05edc1b8440157eca"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c17e1dd195220af6d669b12c96"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_afdc3435b7d976949e8896471c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_51df5b3f20f1871dbce5e90ce4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ba5595d271cc80777db6d13df9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c9c4ae23ac24a9e530234d890d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2dd4a32ae024e7fa3f4ffa68d5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_db84c8f3b1f0241e1c0535e2e2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c09577a1ec0bac90e59b56818c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_164893ceb7b239abab62bc1c34"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b671aaeeecb098232ba628bf2e"`);
        await queryRunner.query(`DROP TABLE "plans"`);
        await queryRunner.query(`CREATE INDEX "IDX_payment_method_stripe" ON "payment_method" ("stripePaymentMethodId") `);
        await queryRunner.query(`CREATE INDEX "IDX_payment_method_user" ON "payment_method" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_stripe_transaction_type" ON "stripe_transaction" ("transactionType") `);
        await queryRunner.query(`CREATE INDEX "IDX_stripe_transaction_status" ON "stripe_transaction" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_stripe_transaction_session" ON "stripe_transaction" ("stripeSessionId") `);
        await queryRunner.query(`CREATE INDEX "IDX_stripe_transaction_intent" ON "stripe_transaction" ("stripePaymentIntentId") `);
        await queryRunner.query(`CREATE INDEX "IDX_stripe_transaction_user" ON "stripe_transaction" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_user_subscription_plan" ON "user_subscription" ("planId") `);
        await queryRunner.query(`CREATE INDEX "IDX_user_subscription_status" ON "user_subscription" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_user_subscription_stripe_id" ON "user_subscription" ("stripeSubscriptionId") `);
        await queryRunner.query(`CREATE INDEX "IDX_user_subscription_user_id" ON "user_subscription" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_webhook_event_status" ON "webhook_event" ("processingStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_webhook_event_type" ON "webhook_event" ("eventType") `);
        await queryRunner.query(`CREATE INDEX "IDX_webhook_event_stripe_id" ON "webhook_event" ("stripeEventId") `);
    }

}
