import { sessionExists } from "@/lib/queries";
import { createShare, listSharesForSession } from "@/lib/shares";
import { withAuth } from "@/lib/route";

// List the current user's read-only share links for this session.
export const GET = withAuth(async (_req, { params }, user) => {
  const { id } = await params;
  if (!sessionExists(id))
    return Response.json({ error: "session not found" }, { status: 404 });
  return Response.json(listSharesForSession(user.id, id));
});

// Mint a new read-only share link for this session.
export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  if (!sessionExists(id))
    return Response.json({ error: "session not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const label = typeof body?.label === "string" ? body.label.trim() : null;
  const token = createShare(user.id, id, label || null);
  return Response.json({ token, path: `/share/${token}` });
});
