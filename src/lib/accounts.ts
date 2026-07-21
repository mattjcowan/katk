import "server-only";
import { asc, eq } from "drizzle-orm";
import { appDb, appSchema } from "@/db/app";
import { id } from "@/lib/ids";
import { decryptSecret, encryptSecret, hashPassword } from "@/lib/auth-crypto";

export type Account = typeof appSchema.users.$inferSelect;

export function getUserByEmail(email: string) {
  return appDb
    .select()
    .from(appSchema.users)
    .where(eq(appSchema.users.email, email.toLowerCase()))
    .get();
}

export function getUserById(uid: string) {
  return appDb
    .select()
    .from(appSchema.users)
    .where(eq(appSchema.users.id, uid))
    .get();
}

export function listUsers() {
  return appDb
    .select({
      id: appSchema.users.id,
      email: appSchema.users.email,
      displayName: appSchema.users.displayName,
      role: appSchema.users.role,
      status: appSchema.users.status,
      mustChangePassword: appSchema.users.mustChangePassword,
      forceOwnKey: appSchema.users.forceOwnKey,
      createdAt: appSchema.users.createdAt,
    })
    .from(appSchema.users)
    .orderBy(asc(appSchema.users.createdAt))
    .all();
}

export function createUser(input: {
  email: string;
  displayName: string;
  tempPassword: string;
  role?: string;
}): string {
  const uid = id("usr");
  const role = input.role ?? "user";
  appDb
    .insert(appSchema.users)
    .values({
      id: uid,
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      passwordHash: hashPassword(input.tempPassword),
      role,
      status: "active",
      mustChangePassword: role !== "admin",
    })
    .run();
  return uid;
}

export function setPassword(uid: string, newPw: string, mustChange: boolean) {
  appDb
    .update(appSchema.users)
    .set({
      passwordHash: hashPassword(newPw),
      mustChangePassword: mustChange,
      updatedAt: new Date(),
    })
    .where(eq(appSchema.users.id, uid))
    .run();
}

export function setStatus(uid: string, status: string) {
  appDb
    .update(appSchema.users)
    .set({ status, updatedAt: new Date() })
    .where(eq(appSchema.users.id, uid))
    .run();
}

export function deleteUserAccount(uid: string) {
  appDb.delete(appSchema.users).where(eq(appSchema.users.id, uid)).run();
}

export function setForceOwnKey(uid: string, force: boolean) {
  appDb
    .update(appSchema.users)
    .set({ forceOwnKey: force, updatedAt: new Date() })
    .where(eq(appSchema.users.id, uid))
    .run();
}

export function setApiKey(uid: string, plaintext: string) {
  appDb
    .update(appSchema.users)
    .set({ apiKeyCipher: encryptSecret(plaintext), updatedAt: new Date() })
    .where(eq(appSchema.users.id, uid))
    .run();
}

export function removeApiKey(uid: string) {
  appDb
    .update(appSchema.users)
    .set({ apiKeyCipher: null, updatedAt: new Date() })
    .where(eq(appSchema.users.id, uid))
    .run();
}

export function setModel(uid: string, model: string | null) {
  appDb
    .update(appSchema.users)
    .set({ model, updatedAt: new Date() })
    .where(eq(appSchema.users.id, uid))
    .run();
}

export function getUserApiKey(uid: string): string | null {
  const u = getUserById(uid);
  if (!u?.apiKeyCipher) return null;
  return decryptSecret(u.apiKeyCipher);
}
