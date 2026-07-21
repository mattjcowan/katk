import "server-only";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import { appDb, appSchema } from "@/db/app";
import { id } from "@/lib/ids";
import { hashPassword } from "@/lib/auth-crypto";
import { getUserDb, userDbPath } from "@/db/user-db";
import { importTaxonomy } from "@/lib/seed-import";
import { DATA_DIR } from "@/lib/paths";

// Seed the shared taxonomies into a freshly provisioned user DB.
export function provisionUserDb(userId: string) {
  const db = getUserDb(userId); // ensures schema
  const dir = "seeds";
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".yaml") || f.endsWith(".yml")) {
      try {
        importTaxonomy(db, `${dir}/${f}`, { writeBack: false });
      } catch (e) {
        console.error(`seed ${f} failed:`, e);
      }
    }
  }
}

let bootstrapped = false;

// Idempotent: create the env-configured admin if missing, and migrate any legacy
// single-user data (data/katk.db) into the admin's per-user DB.
export function ensureAdmin() {
  if (bootstrapped) return;
  bootstrapped = true;

  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Admin";
  if (!email || !password) return; // no admin configured yet

  const existing = appDb
    .select()
    .from(appSchema.users)
    .where(eq(appSchema.users.email, email))
    .get();
  if (existing) return;

  const uid = id("usr");
  appDb
    .insert(appSchema.users)
    .values({
      id: uid,
      email,
      displayName: name,
      passwordHash: hashPassword(password),
      role: "admin",
      status: "active",
      mustChangePassword: false,
    })
    .run();

  const legacy = process.env.KATK_DB ?? `${DATA_DIR}/katk.db`;
  const target = userDbPath(uid);
  if (existsSync(legacy) && !existsSync(target)) {
    try {
      const src = new Database(legacy);
      src.pragma("wal_checkpoint(TRUNCATE)");
      src.close();
      mkdirSync(`${DATA_DIR}/users`, { recursive: true });
      copyFileSync(legacy, target);
      getUserDb(uid); // ensure schema on the copied file
      console.log(`Migrated ${legacy} → ${target} for admin ${email}`);
    } catch (e) {
      console.error("legacy migration failed, provisioning fresh:", e);
      provisionUserDb(uid);
    }
  } else {
    provisionUserDb(uid);
  }
}
