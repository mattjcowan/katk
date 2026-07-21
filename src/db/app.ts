import "server-only";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as appSchema from "./app-schema";
import { DATA_DIR } from "@/lib/paths";

const APP_SQL = `
create table if not exists users (
  id text primary key not null,
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  role text not null default 'user',
  status text not null default 'active',
  must_change_password integer not null default 0,
  api_key_cipher text,
  force_own_key integer not null default 0,
  model text,
  created_at integer not null,
  updated_at integer not null
);
create table if not exists shares (
  token text primary key not null,
  user_id text not null,
  session_id text not null,
  label text,
  revoked integer not null default 0,
  created_at integer not null
);`;

const g = globalThis as unknown as {
  __appDb?: ReturnType<typeof drizzle<typeof appSchema>>;
};

function open() {
  mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(process.env.KATK_APP_DB ?? `${DATA_DIR}/app.db`);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(APP_SQL);
  // Additive migrations for existing app.db (ignored if column already exists).
  for (const s of [
    "alter table users add column api_key_cipher text",
    "alter table users add column force_own_key integer not null default 0",
    "alter table users add column model text",
  ]) {
    try {
      sqlite.exec(s);
    } catch {}
  }
  return drizzle(sqlite, { schema: appSchema });
}

export const appDb = g.__appDb ?? (g.__appDb = open());
export { appSchema };
