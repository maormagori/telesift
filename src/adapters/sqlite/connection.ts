import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";

// `process.getBuiltinModule` (not a static import) sidesteps a Vite/Vitest
// bug where "node:sqlite" isn't recognized as a builtin and fails to resolve
// under the test runner.
const { DatabaseSync: DatabaseSyncCtor } = process.getBuiltinModule("node:sqlite");

export function openDatabase(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSyncCtor(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}
