import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1782163537807 implements MigrationInterface {
    name = 'InitialSchema1782163537807'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Required by the schema below: uuid_generate_v4() PK defaults need
        // uuid-ossp; the questions.content citext column needs citext. A fresh
        // prod DB has neither, so create them before any table/type.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "citext"`);
        await queryRunner.query(`
            CREATE TYPE "public"."duels_mode_enum" AS ENUM(
                'trivia',
                'sudden_death',
                'blitz',
                'streak',
                'steal'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."duels_arena_enum" AS ENUM(
                'naija_street_smarts',
                'sports_arena',
                'entertainment_zone',
                'brain_box',
                'faith_and_values',
                'tech_and_hustle'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."duels_status_enum" AS ENUM(
                'pending',
                'active',
                'completed',
                'cancelled',
                'sudden_death_round'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "duels" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code" character varying(6) NOT NULL,
                "mode" "public"."duels_mode_enum" NOT NULL,
                "arena" "public"."duels_arena_enum" NOT NULL,
                "stake" numeric(10, 2) NOT NULL DEFAULT '0',
                "status" "public"."duels_status_enum" NOT NULL DEFAULT 'pending',
                "questionIds" jsonb NOT NULL,
                "currentQuestionIndex" integer NOT NULL DEFAULT '0',
                "challengerId" character varying NOT NULL,
                "opponentId" character varying,
                "challengerScore" integer NOT NULL DEFAULT '0',
                "opponentScore" integer NOT NULL DEFAULT '0',
                "challengerStreak" integer NOT NULL DEFAULT '0',
                "opponentStreak" integer NOT NULL DEFAULT '0',
                "challengerMaxStreak" integer NOT NULL DEFAULT '0',
                "opponentMaxStreak" integer NOT NULL DEFAULT '0',
                "winnerId" character varying,
                "resolution" character varying,
                "tiebreakDeltaMs" integer,
                "isFlagged" boolean NOT NULL DEFAULT false,
                "progressionAwarded" boolean NOT NULL DEFAULT false,
                "challengerXpAwarded" integer,
                "challengerSpAwarded" integer,
                "opponentXpAwarded" integer,
                "opponentSpAwarded" integer,
                "challengerProgression" jsonb,
                "opponentProgression" jsonb,
                "isTie" boolean NOT NULL DEFAULT false,
                "suddenDeathRound" integer NOT NULL DEFAULT '0',
                "stealOpportunityUserId" character varying,
                "stealQuestionId" character varying,
                "expiresAt" TIMESTAMP,
                "startedAt" TIMESTAMP,
                "completedAt" TIMESTAMP,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_9fdb398a04c935fa21fc9f431d3" UNIQUE ("code"),
                CONSTRAINT "PK_138743a525868817b14d09a0d3e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."questions_category_enum" AS ENUM(
                'naija_street_smarts',
                'sports_arena',
                'entertainment_zone',
                'brain_box',
                'faith_and_values',
                'tech_and_hustle'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."questions_difficulty_enum" AS ENUM('easy', 'medium', 'hard')
        `);
        await queryRunner.query(`
            CREATE TABLE "questions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "content" citext NOT NULL,
                "options" jsonb NOT NULL,
                "correctAnswer" integer NOT NULL,
                "category" "public"."questions_category_enum" NOT NULL,
                "difficulty" "public"."questions_difficulty_enum" NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_aa6ac5bf02fb6a8a79c95f14c78" UNIQUE ("content", "category"),
                CONSTRAINT "PK_08a6d4b0f49ff300bf3a0ca60ac" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "duel_answers" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "duelId" uuid NOT NULL,
                "userId" character varying NOT NULL,
                "questionId" uuid NOT NULL,
                "selectedAnswer" integer NOT NULL,
                "isCorrect" boolean NOT NULL,
                "isSteal" boolean NOT NULL DEFAULT false,
                "stealSuccess" boolean,
                "timeTakenMs" integer,
                "answeredAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_0ac92f74ccdc90a5f47ec97d893" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "duel_configs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "expiryMinutes" integer NOT NULL DEFAULT '30',
                "questionsPerDuel" integer NOT NULL DEFAULT '10',
                "forfeitTimeoutSeconds" integer NOT NULL DEFAULT '30',
                "stakeTiers" jsonb NOT NULL DEFAULT '[0,100,200,500,1000]',
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6c674d393afdca302ad3a96d40b" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."tournaments_arena_enum" AS ENUM(
                'naija_street_smarts',
                'sports_arena',
                'entertainment_zone',
                'brain_box',
                'faith_and_values',
                'tech_and_hustle'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."tournaments_gametype_enum" AS ENUM('lightning_trivia', 'last_man_standing')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."tournaments_status_enum" AS ENUM(
                'draft',
                'open',
                'in_progress',
                'completed',
                'cancelled'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "tournaments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "title" character varying NOT NULL,
                "arena" "public"."tournaments_arena_enum" NOT NULL,
                "gameType" "public"."tournaments_gametype_enum" NOT NULL,
                "entryFee" numeric(10, 2) NOT NULL DEFAULT '0',
                "prizeFirst" numeric(10, 2) NOT NULL,
                "prizeSecond" numeric(10, 2),
                "prizeThird" numeric(10, 2),
                "maxPlayers" integer,
                "minPlayers" integer NOT NULL DEFAULT '10',
                "status" "public"."tournaments_status_enum" NOT NULL DEFAULT 'draft',
                "scheduledAt" TIMESTAMP,
                "startedAt" TIMESTAMP,
                "completedAt" TIMESTAMP,
                "isFunded" boolean NOT NULL DEFAULT false,
                "createdBy" character varying NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6d5d129da7a80cf99e8ad4833a9" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."game_sessions_gametype_enum" AS ENUM('lightning_trivia', 'last_man_standing')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."game_sessions_status_enum" AS ENUM('active', 'completed', 'abandoned', 'flagged')
        `);
        await queryRunner.query(`
            CREATE TABLE "game_sessions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tournamentId" uuid NOT NULL,
                "userId" character varying NOT NULL,
                "gameType" "public"."game_sessions_gametype_enum" NOT NULL,
                "status" "public"."game_sessions_status_enum" NOT NULL DEFAULT 'active',
                "questionIds" jsonb NOT NULL,
                "currentIndex" integer NOT NULL DEFAULT '0',
                "score" integer NOT NULL DEFAULT '0',
                "correctAnswers" integer NOT NULL DEFAULT '0',
                "totalAnswered" integer NOT NULL DEFAULT '0',
                "isFlagged" boolean NOT NULL DEFAULT false,
                "flagReason" character varying,
                "progressionAwarded" boolean NOT NULL DEFAULT false,
                "sessionProgression" jsonb,
                "startedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "completedAt" TIMESTAMP,
                CONSTRAINT "PK_e25fa82d55744e55000c3288fdc" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "game_answers" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sessionId" uuid NOT NULL,
                "questionId" uuid NOT NULL,
                "selectedAnswer" integer NOT NULL,
                "isCorrect" boolean NOT NULL,
                "answeredAt" TIMESTAMP NOT NULL DEFAULT now(),
                "clientTimestamp" bigint,
                "serverTimestamp" bigint NOT NULL,
                "timeTakenMs" integer,
                CONSTRAINT "PK_a1a057394e3f6341f3212f1ef38" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "progression_config_versions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "values" jsonb NOT NULL,
                "effectiveFrom" TIMESTAMP NOT NULL,
                "changedBy" character varying,
                "notes" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_5f037e03511b8e491626b952660" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."progression_events_ledger_enum" AS ENUM('level', 'duel_rank', 'tournament_rank')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."progression_events_reason_enum" AS ENUM(
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
            CREATE TABLE "progression_events" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "ledger" "public"."progression_events_ledger_enum" NOT NULL,
                "points" integer NOT NULL,
                "reason" "public"."progression_events_reason_enum" NOT NULL,
                "sourceType" character varying,
                "sourceId" character varying,
                "seasonId" character varying,
                "configVersionId" uuid,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_be1718a4a5d7954377c99df0b2e" UNIQUE (
                    "userId",
                    "ledger",
                    "sourceType",
                    "sourceId",
                    "reason"
                ),
                CONSTRAINT "PK_317da6f4f0b564110a47719603e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_278c3b9281436bf837c631c356" ON "progression_events" ("userId", "ledger", "seasonId")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."progression_projections_ledger_enum" AS ENUM('level', 'duel_rank', 'tournament_rank')
        `);
        await queryRunner.query(`
            CREATE TABLE "progression_projections" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "ledger" "public"."progression_projections_ledger_enum" NOT NULL,
                "seasonId" character varying,
                "total" integer NOT NULL DEFAULT '0',
                "levelNumber" integer,
                "tier" character varying,
                "seasonPeakTier" character varying,
                "demotionShieldActive" boolean NOT NULL DEFAULT false,
                "allTimePeakTier" character varying,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_57dad60f7ac114329f15798ff16" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_41fe9ec6bd35d52beb932dc6ed" ON "progression_projections" ("userId", "ledger", "seasonId")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."seasons_status_enum" AS ENUM('active', 'closed')
        `);
        await queryRunner.query(`
            CREATE TABLE "seasons" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "label" character varying(7) NOT NULL,
                "startsAt" TIMESTAMP NOT NULL,
                "endsAt" TIMESTAMP NOT NULL,
                "status" "public"."seasons_status_enum" NOT NULL DEFAULT 'active',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_151c3fce96248e44db3a233f3a6" UNIQUE ("label"),
                CONSTRAINT "PK_cb8ed53b5fe109dcd4a4449ec9d" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "user_progression_backup" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "lifetimeXp" bigint NOT NULL DEFAULT '0',
                "seasonPoints" integer NOT NULL DEFAULT '0',
                "seasonId" character varying,
                "allTimeHighestRank" character varying,
                "snapshotAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_e96adb32654c3c57c52792f04b6" UNIQUE ("userId"),
                CONSTRAINT "PK_ca922d380c192b7b265d8fd3de5" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."question_reports_reason_enum" AS ENUM('wrong_answer', 'outdated', 'unclear')
        `);
        await queryRunner.query(`
            CREATE TABLE "question_reports" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "questionId" uuid NOT NULL,
                "userId" character varying NOT NULL,
                "reason" "public"."question_reports_reason_enum" NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_8fcfb4dc8bda44207ef73a30282" UNIQUE ("questionId", "userId"),
                CONSTRAINT "PK_c7faf6d4edfc5ca11ea16c67f3f" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "user_question_history" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "questionId" uuid NOT NULL,
                "shownAt" TIMESTAMP NOT NULL,
                "answeredCorrectly" boolean NOT NULL,
                CONSTRAINT "UQ_c5818d9996e624f06686da0cc93" UNIQUE ("userId", "questionId"),
                CONSTRAINT "PK_6e6fa90c930de1684bb4f5413ec" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "email" character varying NOT NULL,
                "username" character varying NOT NULL,
                "password" character varying NOT NULL,
                "phone" character varying,
                "avatarUrl" character varying,
                "bankAccountNumber" character varying,
                "bankCode" character varying,
                "bankAccountName" character varying,
                "referralCode" character varying NOT NULL,
                "referredBy" character varying,
                "isVerified" boolean NOT NULL DEFAULT false,
                "isActive" boolean NOT NULL DEFAULT true,
                "isAdmin" boolean NOT NULL DEFAULT false,
                "lifetimeXp" bigint NOT NULL DEFAULT '0',
                "seasonPoints" integer NOT NULL DEFAULT '0',
                "seasonId" character varying,
                "duelWinStreak" integer NOT NULL DEFAULT '0',
                "allTimeHighestRank" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
                CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"),
                CONSTRAINT "UQ_b7f8278f4e89249bb75c9a15899" UNIQUE ("referralCode"),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."tournament_entries_status_enum" AS ENUM(
                'registered',
                'active',
                'eliminated',
                'completed'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "tournament_entries" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tournamentId" uuid NOT NULL,
                "userId" uuid NOT NULL,
                "score" integer NOT NULL DEFAULT '0',
                "rank" integer,
                "prizeWon" numeric(10, 2),
                "entryFeePaid" numeric(10, 2) NOT NULL DEFAULT '0',
                "status" "public"."tournament_entries_status_enum" NOT NULL DEFAULT 'registered',
                "joinedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_e5a9fdc5b3040f06f5f616bc04d" UNIQUE ("tournamentId", "userId"),
                CONSTRAINT "PK_6787159985071e204cbc079bbd8" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "wallets" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_2ecdb33f23e9a6fc392025c0b97" UNIQUE ("userId"),
                CONSTRAINT "PK_8402e5df5a30a229380e83e4f7e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."wallet_transactions_type_enum" AS ENUM(
                'deposit',
                'withdrawal',
                'entry_fee',
                'prize_payout',
                'refund'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "wallet_transactions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "walletId" uuid NOT NULL,
                "type" "public"."wallet_transactions_type_enum" NOT NULL,
                "amount" numeric(10, 2) NOT NULL,
                "reference" character varying,
                "description" character varying,
                "meta" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_5120f131bde2cda940ec1a621db" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "duel_answers"
            ADD CONSTRAINT "FK_9476250fa572319f42667efea4d" FOREIGN KEY ("duelId") REFERENCES "duels"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "duel_answers"
            ADD CONSTRAINT "FK_e9291c3e40cae111bbb5bb104b1" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "game_sessions"
            ADD CONSTRAINT "FK_4fa37b6649feb118785237853e5" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "game_answers"
            ADD CONSTRAINT "FK_4ad6fe8cce5822e7e9aee697b32" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "game_answers"
            ADD CONSTRAINT "FK_b42854bba1efc6fe2dfeda35b6b" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "question_reports"
            ADD CONSTRAINT "FK_1ceced1c04fff43678aa8f91788" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "user_question_history"
            ADD CONSTRAINT "FK_92556237dace8eaf9f09159ec62" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "tournament_entries"
            ADD CONSTRAINT "FK_fc95f98576b760a2f3322be22b9" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "tournament_entries"
            ADD CONSTRAINT "FK_11cf29c118032c5c43e31215d44" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "wallet_transactions"
            ADD CONSTRAINT "FK_8a94d9d61a2b05123710b325fbf" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "wallet_transactions" DROP CONSTRAINT "FK_8a94d9d61a2b05123710b325fbf"
        `);
        await queryRunner.query(`
            ALTER TABLE "tournament_entries" DROP CONSTRAINT "FK_11cf29c118032c5c43e31215d44"
        `);
        await queryRunner.query(`
            ALTER TABLE "tournament_entries" DROP CONSTRAINT "FK_fc95f98576b760a2f3322be22b9"
        `);
        await queryRunner.query(`
            ALTER TABLE "user_question_history" DROP CONSTRAINT "FK_92556237dace8eaf9f09159ec62"
        `);
        await queryRunner.query(`
            ALTER TABLE "question_reports" DROP CONSTRAINT "FK_1ceced1c04fff43678aa8f91788"
        `);
        await queryRunner.query(`
            ALTER TABLE "game_answers" DROP CONSTRAINT "FK_b42854bba1efc6fe2dfeda35b6b"
        `);
        await queryRunner.query(`
            ALTER TABLE "game_answers" DROP CONSTRAINT "FK_4ad6fe8cce5822e7e9aee697b32"
        `);
        await queryRunner.query(`
            ALTER TABLE "game_sessions" DROP CONSTRAINT "FK_4fa37b6649feb118785237853e5"
        `);
        await queryRunner.query(`
            ALTER TABLE "duel_answers" DROP CONSTRAINT "FK_e9291c3e40cae111bbb5bb104b1"
        `);
        await queryRunner.query(`
            ALTER TABLE "duel_answers" DROP CONSTRAINT "FK_9476250fa572319f42667efea4d"
        `);
        await queryRunner.query(`
            DROP TABLE "wallet_transactions"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."wallet_transactions_type_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "wallets"
        `);
        await queryRunner.query(`
            DROP TABLE "tournament_entries"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."tournament_entries_status_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "users"
        `);
        await queryRunner.query(`
            DROP TABLE "user_question_history"
        `);
        await queryRunner.query(`
            DROP TABLE "question_reports"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."question_reports_reason_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "user_progression_backup"
        `);
        await queryRunner.query(`
            DROP TABLE "seasons"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."seasons_status_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_41fe9ec6bd35d52beb932dc6ed"
        `);
        await queryRunner.query(`
            DROP TABLE "progression_projections"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."progression_projections_ledger_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_278c3b9281436bf837c631c356"
        `);
        await queryRunner.query(`
            DROP TABLE "progression_events"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."progression_events_reason_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."progression_events_ledger_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "progression_config_versions"
        `);
        await queryRunner.query(`
            DROP TABLE "game_answers"
        `);
        await queryRunner.query(`
            DROP TABLE "game_sessions"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."game_sessions_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."game_sessions_gametype_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "tournaments"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."tournaments_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."tournaments_gametype_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."tournaments_arena_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "duel_configs"
        `);
        await queryRunner.query(`
            DROP TABLE "duel_answers"
        `);
        await queryRunner.query(`
            DROP TABLE "questions"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."questions_difficulty_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."questions_category_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "duels"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."duels_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."duels_arena_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."duels_mode_enum"
        `);
    }

}
