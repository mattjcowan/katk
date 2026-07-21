import { addNote, listNotes } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const GET = withAuth(async (req, { params }) => {
  const { id } = await params;
  const nodeId = new URL(req.url).searchParams.get("nodeId");
  return Response.json(listNotes(id, nodeId));
});

export const POST = withAuth(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.body?.trim()) {
    return Response.json({ error: "body required" }, { status: 400 });
  }
  const nid = addNote(id, body.nodeId ?? null, body.body.trim());
  return Response.json({ id: nid });
});
