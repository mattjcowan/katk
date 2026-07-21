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
