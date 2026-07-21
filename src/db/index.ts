import "server-only";
import { currentDb, type DrizzleDb } from "./user-db";
import * as schema from "./schema";

// `db` proxies to the current request's per-user database, set via
// AsyncLocalStorage by withAuth / runWithUserDb (see user-db.ts). Every existing
// query in queries.ts keeps working unchanged.
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const d = currentDb() as unknown as Record<string | symbol, unknown>;
    const value = d[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(d)
      : value;
  },
});

export { schema };
