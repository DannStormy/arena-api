import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * Standalone TypeORM DataSource for the migration CLI.
 *
 * The running app uses the inline `TypeOrmModule.forRootAsync` config in
 * app.module.ts; the CLI cannot read that, so this file mirrors the SAME
 * env-driven connection (and the same SSL logic) for `migration:generate`,
 * `migration:run`, and `migration:revert`.
 *
 * `synchronize` is ALWAYS false here — the CLI must never auto-sync schema;
 * migrations are the only path that touches the schema.
 *
 * This file is loaded in two execution contexts, so the entity/migration
 * globs follow the tree we're running from:
 *   - via ts-node (migration:generate/revert) -> data-source.ts in src/
 *   - compiled (migration:run against dist)    -> data-source.js in dist/
 */
const isTs = __filename.endsWith('.ts');
const root = isTs ? 'src' : 'dist';
const ext = isTs ? 'ts' : 'js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: false,
  entities: [`${root}/**/*.entity.${ext}`],
  migrations: [`${root}/database/migrations/*.${ext}`],
});
