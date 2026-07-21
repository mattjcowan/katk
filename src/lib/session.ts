import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth-crypto";
import { getUserById } from "@/lib/accounts";
import { ensureAdmin } from "@/lib/bootstrap";

export async function getCurrentUser() {
  ensureAdmin();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const uid = verifySession(token);
  if (!uid) return null;
  const u = getUserById(uid);
  if (!u || u.status !== "active") return null;
  return u;
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}
