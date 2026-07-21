import { deleteUserAccount, setForceOwnKey, setStatus } from "@/lib/accounts";
import { deleteUserDbFiles } from "@/db/user-db";
import { withAdmin } from "@/lib/route";

export const PATCH = withAdmin(async (req, { params }, user) => {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    forceOwnKey?: boolean;
  };
  if ("status" in body) {
    if (id === user.id) {
      return Response.json({ error: "You can't disable yourself" }, { status: 400 });
    }
    setStatus(id, body.status === "disabled" ? "disabled" : "active");
  }
  if ("forceOwnKey" in body) {
    setForceOwnKey(id, !!body.forceOwnKey);
  }
  return Response.json({ ok: true });
});

export const DELETE = withAdmin(async (_req, { params }, user) => {
  const { id } = await params;
  if (id === user.id) {
    return Response.json({ error: "You can't delete yourself" }, { status: 400 });
  }
  deleteUserAccount(id);
  deleteUserDbFiles(id);
  return Response.json({ ok: true });
});
