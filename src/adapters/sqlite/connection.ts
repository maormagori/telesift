import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { DB } from "./schema.js";

export function openDatabase(path: string): BetterSqlite3.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new BetterSqlite3(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}

export function createKyselyDb(db: BetterSqlite3.Database): Kysely<DB> {
  return new Kysely<DB>({ dialect: new SqliteDialect({ database: db }) });
}
