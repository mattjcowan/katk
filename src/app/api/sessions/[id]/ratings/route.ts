import { upsertRating } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const PUT = withAuth(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.nodeId) {
    return Response.json({ error: "nodeId required" }, { status: 400 });
  }
  const patch: {
    selfTier?: number | null;
    assessedTier?: number | null;
    note?: string | null;
  } = {};
  if ("selfTier" in body) patch.selfTier = body.selfTier;
  if ("assessedTier" in body) patch.assessedTier = body.assessedTier;
  if ("note" in body) patch.note = body.note;
  upsertRating(id, body.nodeId, patch);
  return Response.json({ ok: true });
});
