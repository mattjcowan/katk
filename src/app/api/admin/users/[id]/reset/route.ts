import { setPassword } from "@/lib/accounts";
import { withAdmin } from "@/lib/route";

export const POST = withAdmin(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const tempPassword = body?.tempPassword;
  if (!tempPassword) {
    return Response.json({ error: "tempPassword required" }, { status: 400 });
  }
  setPassword(id, tempPassword, true);
  return Response.json({ ok: true });
});
