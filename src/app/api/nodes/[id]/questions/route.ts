import { addQuestion, listQuestions } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const GET = withAuth(async (req, { params }) => {
  const { id } = await params;
  const type = new URL(req.url).searchParams.get("type") ?? undefined;
  return Response.json(listQuestions(id, type ?? undefined));
});

export const POST = withAuth(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.prompt?.trim() || !body?.type) {
    return Response.json({ error: "type and prompt required" }, { status: 400 });
  }
  const qid = addQuestion({
    nodeId: id,
    type: body.type,
    prompt: body.prompt.trim(),
    options: body.options ?? null,
    answerIndex: body.answerIndex ?? null,
    answerGuide: body.answerGuide ?? null,
  });
  return Response.json({ id: qid });
});
