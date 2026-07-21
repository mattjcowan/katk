import {
  deleteNodeCascade,
  moveNode,
  renameNode,
  setNodeArchived,
  updateNodeDescription,
} from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const PATCH = withAuth(async (req, { params }) => {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};
  if (typeof body.title === "string" && body.title.trim())
    renameNode(id, body.title.trim());
  if (typeof body.description === "string")
    updateNodeDescription(id, body.description);
  if ("archived" in body) setNodeArchived(id, !!body.archived);
  if ("parentId" in body) {
    const r = moveNode(id, body.parentId ?? null);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  }
  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (_req, { params }) => {
  const { id } = await params;
  deleteNodeCascade(id);
  return Response.json({ ok: true });
});
