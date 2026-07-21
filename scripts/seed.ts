import { resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema";
import { USER_SCHEMA_SQL } from "../src/db/ddl";
import { importTaxonomy } from "../src/lib/seed-import";

// CLI seeder: creates a standalone SQLite DB (default data/katk.db) and imports a
// taxonomy YAML, backfilling stable ids into the file. Used for authoring seed
// content — the app provisions per-user DBs on its own (see user-db.ts).
const SEED_FILE = process.argv[2] ?? "seeds/general-software-engineering.yaml";
const dbPath = process.env.KATK_DB ?? "data/katk.db";

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.exec(USER_SCHEMA_SQL);
const db = drizzle(sqlite, { schema });

const r = importTaxonomy(db, resolve(process.cwd(), SEED_FILE), {
  writeBack: true,
});
console.log(
  `✓ ${r.taxonomyId}: ${r.inserted} inserted, ${r.matched} unchanged` +
    (r.dirty ? ", ids backfilled into YAML." : "."),
);
