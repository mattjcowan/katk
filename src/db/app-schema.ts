import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Central accounts store (data/app.db) — separate from per-user data DBs.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"), // admin | user
  status: text("status").notNull().default("active"), // active | disabled
  mustChangePassword: integer("must_change_password", { mode: "boolean" })
    .notNull()
    .default(false),
  apiKeyCipher: text("api_key_cipher"), // encrypted Anthropic API key
  forceOwnKey: integer("force_own_key", { mode: "boolean" })
    .notNull()
    .default(false),
  model: text("model"), // preferred model (own-key users)
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Public, revocable read-only share links to a single session. Lives in the
// central app.db so an unauthenticated /share/:token request can resolve which
// user's DB and session to open. The token is an opaque, unguessable secret.
export const shares = sqliteTable("shares", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  sessionId: text("session_id").notNull(),
  label: text("label"),
  revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
