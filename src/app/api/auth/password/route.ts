import { setPassword } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/session";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const newPassword = body?.newPassword;
  if (!newPassword || newPassword.length < 8) {
    return Response.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }
  setPassword(user.id, newPassword, false);
  return Response.json({ ok: true });
}
