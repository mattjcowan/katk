import { cookies } from "next/headers";
import { SESSION_COOKIE, signSession, verifyPassword } from "@/lib/auth-crypto";
import { getUserByEmail } from "@/lib/accounts";
import { ensureAdmin } from "@/lib/bootstrap";

export async function POST(req: Request) {
  ensureAdmin();
  const body = await req.json().catch(() => null);
  const email = body?.email?.trim();
  const password = body?.password;
  if (!email || !password) {
    return Response.json({ error: "email and password required" }, { status: 400 });
  }
  const u = getUserByEmail(email);
  if (!u || u.status !== "active" || !verifyPassword(password, u.passwordHash)) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }
  (await cookies()).set(SESSION_COOKIE, signSession(u.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 3600,
  });
  return Response.json({
    ok: true,
    mustChangePassword: u.mustChangePassword,
    role: u.role,
  });
}
