import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase0Integrity1793243763156 implements MigrationInterface {
    name = 'Phase0Integrity1793243763156'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await assertNoDuplicates(queryRunner);
        await queryRunner.query(`
            CREATE TYPE "public"."payouts_status_enum" AS ENUM(
                'pending',
                'processing',
                'sent',
                'confirmed',
                'failed'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "payouts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "entryId" character varying NOT NULL,
                "userId" character varying NOT NULL,
                "amountKobo" integer NOT NULL,
                "status" "public"."payouts_status_enum" NOT NULL DEFAULT 'pending',
                "attempts" integer NOT NULL DEFAULT '0',
                "transferReference" character varying,
                "transferCode" character varying,
                "failureReason" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_f117b1377120bb4af7182dbd402" UNIQUE ("entryId"),
                CONSTRAINT "UQ_25de1101c220cbef1c67633ef58" UNIQUE ("transferReference"),
                CONSTRAINT "PK_76855dc4f0a6c18c72eea302e87" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "bankDetailsChangedAt" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_duel_answer_once" ON "duel_answers" ("duelId", "userId", "questionId", "isSteal")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_session_per_tournament_entry" ON "game_sessions" ("tournamentId", "userId")
            WHERE "tournamentId" IS NOT NULL
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_wallet_tx_reference" ON "wallet_transactions" ("reference")
            WHERE reference IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."UQ_wallet_tx_reference"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_session_per_tournament_entry"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_duel_answer_once"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "bankDetailsChangedAt"
        `);
        await queryRunner.query(`
            DROP TABLE "payouts"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."payouts_status_enum"
        `);
    }

}

// The new unique indexes would fail on rows written before Phase 0. Name the
// offenders instead of letting Postgres fail with an opaque index error.
async function assertNoDuplicates(queryRunner: QueryRunner): Promise<void> {
    const checks: [string, string][] = [
        ['duel_answers', `SELECT "duelId", "userId", "questionId", "isSteal" FROM duel_answers GROUP BY 1, 2, 3, 4 HAVING COUNT(*) > 1`],
        ['game_sessions', `SELECT "tournamentId", "userId" FROM game_sessions WHERE "tournamentId" IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1`],
        ['wallet_transactions', `SELECT reference FROM wallet_transactions WHERE reference IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1`],
    ];
    for (const [table, sql] of checks) {
        const rows: unknown[] = await queryRunner.query(sql);
        if (rows.length) {
            throw new Error(`Phase0Integrity: ${rows.length} duplicate group(s) in ${table}; resolve them before migrating. Query: ${sql}`);
        }
    }
}
