import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { USER_SCHEMA_SQL } from "./ddl";
import { DATA_DIR } from "@/lib/paths";

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export function ensureUserSchema(sqlite: Database.Database) {
  sqlite.exec(USER_SCHEMA_SQL);
  // Lightweight additive migrations (ignored if the column already exists).
  for (const stmt of [
    "alter table answers add column score integer",
    "alter table answers add column feedback text",
  ]) {
    try {
      sqlite.exec(stmt);
    } catch {}
  }
}

export function userDbPath(userId: string): string {
  return `${DATA_DIR}/users/${userId}.db`;
}

const als = new AsyncLocalStorage<DrizzleDb>();
const g = globalThis as unknown as { __userDbCache?: Map<string, DrizzleDb> };
const cache = g.__userDbCache ?? (g.__userDbCache = new Map());

export function getUserDb(userId: string): DrizzleDb {
  const hit = cache.get(userId);
  if (hit) return hit;
  mkdirSync(`${DATA_DIR}/users`, { recursive: true });
  const sqlite = new Database(userDbPath(userId));
  sqlite.pragma("journal_mode = WAL");
  ensureUserSchema(sqlite);
  const d = drizzle(sqlite, { schema });
  cache.set(userId, d);
  return d;
}

export function runWithUserDb<T>(userId: string, fn: () => T): T {
  return als.run(getUserDb(userId), fn);
}

export function currentDb(): DrizzleDb {
  const d = als.getStore();
  if (!d)
    throw new Error(
      "No database in request context — data accessed without an authenticated user.",
    );
  return d;
}

export function deleteUserDbFiles(userId: string) {
  cache.delete(userId);
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = userDbPath(userId) + suffix;
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {}
  }
}
