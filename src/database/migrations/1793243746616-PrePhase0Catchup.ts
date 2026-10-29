import { MigrationInterface, QueryRunner } from "typeorm";

export class PrePhase0Catchup1793243746616 implements MigrationInterface {
    name = 'PrePhase0Catchup1793243746616'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."async_duels_mode_enum" AS ENUM('speed_math', 'brain_duel', 'memory')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."async_duels_matchtype_enum" AS ENUM('challenge_link', 'ghost')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."async_duels_status_enum" AS ENUM('awaiting_opponent', 'completed', 'cancelled')
        `);
        await queryRunner.query(`
            CREATE TABLE "async_duels" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code" character varying(6) NOT NULL,
                "matchSeed" character varying NOT NULL,
                "mode" "public"."async_duels_mode_enum" NOT NULL,
                "difficulty" integer NOT NULL,
                "challengeCount" integer NOT NULL DEFAULT '10',
                "matchType" "public"."async_duels_matchtype_enum" NOT NULL,
                "status" "public"."async_duels_status_enum" NOT NULL DEFAULT 'awaiting_opponent',
                "creatorId" character varying NOT NULL,
                "opponentId" character varying,
                "creatorScore" integer NOT NULL DEFAULT '0',
                "opponentScore" integer NOT NULL DEFAULT '0',
                "creatorCorrect" integer NOT NULL DEFAULT '0',
                "opponentCorrect" integer NOT NULL DEFAULT '0',
                "creatorElapsedMs" integer NOT NULL DEFAULT '0',
                "opponentElapsedMs" integer NOT NULL DEFAULT '0',
                "creatorCompletedAt" TIMESTAMP,
                "opponentCompletedAt" TIMESTAMP,
                "ghostEligible" boolean NOT NULL DEFAULT false,
                "winnerId" character varying,
                "resolution" character varying,
                "tiebreakDeltaMs" integer,
                "isTie" boolean NOT NULL DEFAULT false,
                "progressionAwarded" boolean NOT NULL DEFAULT false,
                "creatorXpAwarded" integer,
                "creatorSpAwarded" integer,
                "opponentXpAwarded" integer,
                "opponentSpAwarded" integer,
                "creatorProgression" jsonb,
                "opponentProgression" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "completedAt" TIMESTAMP,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_87befb60dd76c3c94b25519a5b3" UNIQUE ("code"),
                CONSTRAINT "PK_4785a8eb2671dba1592c42bdfd6" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_091f6d9a85674648c328af5ad1" ON "async_duels" ("mode", "difficulty", "status")
        `);
        await queryRunner.query(`
            CREATE TABLE "async_duel_answers" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "asyncDuelId" uuid NOT NULL,
                "userId" character varying NOT NULL,
                "index" integer NOT NULL,
                "submitted" jsonb,
                "isCorrect" boolean NOT NULL,
                "score" integer NOT NULL,
                "elapsedMs" integer NOT NULL,
                "answeredAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_558d635a2f7ed36658c6fed3452" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_a8806fc4ea602ab2e0fd324566" ON "async_duel_answers" ("asyncDuelId", "userId", "index")
        `);
        await queryRunner.query(`
            CREATE TABLE "daily_results" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "date" date NOT NULL,
                "score" integer NOT NULL DEFAULT '0',
                "correctCount" integer NOT NULL DEFAULT '0',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_580d3894d78471d67a70dd7d739" UNIQUE ("userId", "date"),
                CONSTRAINT "PK_650764f25b2cae171112ac25c28" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ac274cd92fd3f02e24159ddfc4" ON "daily_results" ("date", "score")
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "currentDailyStreak" integer NOT NULL DEFAULT '0'
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "longestDailyStreak" integer NOT NULL DEFAULT '0'
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "lastPlayedOn" date
        `);
        await queryRunner.query(`
            ALTER TABLE "duel_configs"
            ALTER COLUMN "stakeTiers"
            SET DEFAULT '[0,100,200,500,1000]'
        `);
        await queryRunner.query(`
            ALTER TABLE "game_sessions" DROP CONSTRAINT "FK_4fa37b6649feb118785237853e5"
        `);
        await queryRunner.query(`
            ALTER TABLE "game_sessions"
            ALTER COLUMN "tournamentId" DROP NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "progression_events" DROP CONSTRAINT "UQ_be1718a4a5d7954377c99df0b2e"
        `);
        await queryRunner.query(`
            ALTER TYPE "public"."progression_events_reason_enum"
            ADD VALUE 'solo_practice'
        `);
        await queryRunner.query(`
            ALTER TABLE "progression_events"
            ADD CONSTRAINT "UQ_be1718a4a5d7954377c99df0b2e" UNIQUE (
                    "userId",
                    "ledger",
                    "sourceType",
                    "sourceId",
                    "reason"
                )
        `);
        await queryRunner.query(`
            ALTER TABLE "async_duel_answers"
            ADD CONSTRAINT "FK_89ee4a530eb03e6b2b3ff84f983" FOREIGN KEY ("asyncDuelId") REFERENCES "async_duels"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "game_sessions"
            ADD CONSTRAINT "FK_4fa37b6649feb118785237853e5" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "game_sessions" DROP CONSTRAINT "FK_4fa37b6649feb118785237853e5"
        `);
        await queryRunner.query(`
            ALTER TABLE "async_duel_answers" DROP CONSTRAINT "FK_89ee4a530eb03e6b2b3ff84f983"
        `);
        await queryRunner.query(`
            ALTER TABLE "progression_events" DROP CONSTRAINT "UQ_be1718a4a5d7954377c99df0b2e"
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."progression_events_reason_enum_old" AS ENUM(
                'duel_win',
                'duel_loss',
                'duel_draw',
                'tournament_finish',
                'season_reset',
                'adjustment',
                'seed'
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "progression_events"
            ALTER COLUMN "reason" TYPE "public"."progression_events_reason_enum_old" USING "reason"::"text"::"public"."progression_events_reason_enum_old"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."progression_events_reason_enum"
        `);
        await queryRunner.query(`
            ALTER TYPE "public"."progression_events_reason_enum_old"
            RENAME TO "progression_events_reason_enum"
        `);
        await queryRunner.query(`
            ALTER TABLE "progression_events"
            ADD CONSTRAINT "UQ_be1718a4a5d7954377c99df0b2e" UNIQUE (
                    "userId",
                    "ledger",
                    "reason",
                    "sourceType",
                    "sourceId"
                )
        `);
        await queryRunner.query(`
            ALTER TABLE "game_sessions"
            ALTER COLUMN "tournamentId"
            SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "game_sessions"
            ADD CONSTRAINT "FK_4fa37b6649feb118785237853e5" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "duel_configs"
            ALTER COLUMN "stakeTiers"
            SET DEFAULT '[0, 100, 200, 500, 1000]'
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "lastPlayedOn"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "longestDailyStreak"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "currentDailyStreak"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_ac274cd92fd3f02e24159ddfc4"
        `);
        await queryRunner.query(`
            DROP TABLE "daily_results"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a8806fc4ea602ab2e0fd324566"
        `);
        await queryRunner.query(`
            DROP TABLE "async_duel_answers"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_091f6d9a85674648c328af5ad1"
        `);
        await queryRunner.query(`
            DROP TABLE "async_duels"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."async_duels_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."async_duels_matchtype_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."async_duels_mode_enum"
        `);
    }

}
