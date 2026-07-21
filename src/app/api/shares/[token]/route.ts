import { revokeShare } from "@/lib/shares";
import { withAuth } from "@/lib/route";

// Revoke a read-only share link (scoped to the owner).
export const DELETE = withAuth(async (_req, { params }, user) => {
  const { token } = await params;
  revokeShare(user.id, token);
  return Response.json({ ok: true });
});
