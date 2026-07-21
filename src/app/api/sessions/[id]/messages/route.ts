import { addMessage, listMessages } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const GET = withAuth(async (req, { params }) => {
  const { id } = await params;
  const nodeId = new URL(req.url).searchParams.get("nodeId");
  return Response.json(listMessages(id, nodeId));
});

export const POST = withAuth(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.content || !body?.role) {
    return Response.json({ error: "role and content required" }, { status: 400 });
  }
  const mid = addMessage(id, body.nodeId ?? null, body.role, body.content);
  return Response.json({ id: mid });
});
