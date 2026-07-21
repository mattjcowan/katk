import {
  deleteNodeCascade,
  moveNode,
  placeNode,
  renameNode,
  reorderNode,
  setNodeArchived,
  updateNodeDescription,
} from "@/lib/queries";
import { withAuth } from "@/lib/route";

const DIRS = ["up", "down", "top", "bottom"] as const;

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
  if (DIRS.includes(body.reorder)) {
    const r = reorderNode(id, body.reorder);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  }
  if (typeof body.placeBefore === "string") {
    const r = placeNode(id, body.placeBefore, "before");
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  }
  if (typeof body.placeAfter === "string") {
    const r = placeNode(id, body.placeAfter, "after");
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  }
  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (_req, { params }) => {
  const { id } = await params;
  deleteNodeCascade(id);
  return Response.json({ ok: true });
});
