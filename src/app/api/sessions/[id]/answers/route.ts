import { listAnswers, upsertAnswer } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const GET = withAuth(async (req, { params }) => {
  const { id } = await params;
  const nodeId = new URL(req.url).searchParams.get("nodeId");
  if (!nodeId) return Response.json([]);
  return Response.json(listAnswers(id, nodeId));
});

export const PUT = withAuth(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.questionId) {
    return Response.json({ error: "questionId required" }, { status: 400 });
  }
  const patch: { choice?: number | null; text?: string | null } = {};
  if ("choice" in body) patch.choice = body.choice;
  if ("text" in body) patch.text = body.text;
  upsertAnswer(id, body.questionId, patch);
  return Response.json({ ok: true });
});
