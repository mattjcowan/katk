import { resolveAnthropic } from "@/lib/ai";
import { generateQuestions } from "@/lib/claude";
import { addQuestion, getNodeContext, listQuestions } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const ctx = getNodeContext(id);
  if (!ctx) return Response.json({ error: "node not found" }, { status: 404 });

  const ai = resolveAnthropic(user);
  if (!ai.ok) return Response.json({ error: ai.error }, { status: 502 });

  const body = await req.json().catch(() => ({}));
  const type = body?.type === "conversational" ? "conversational" : "mcq";
  const existing = listQuestions(id, type).map((q) => q.prompt);

  const result = await generateQuestions(ai, {
    taxonomyTitle: ctx.taxonomyTitle,
    path: ctx.path,
    nodeTitle: ctx.node.title,
    nodeDescription: ctx.node.description,
    type,
    count: body?.count,
    steer: body?.steer,
    existing,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 502 });

  for (const q of result.questions) {
    if (type === "mcq") {
      const m = q as {
        prompt: string;
        options: string[];
        answerIndex: number;
        explanation: string;
      };
      addQuestion({
        nodeId: id,
        type: "mcq",
        prompt: m.prompt,
        options: m.options,
        answerIndex: m.answerIndex,
        answerGuide: m.explanation,
      });
    } else {
      const c = q as { prompt: string; answerGuide: string };
      addQuestion({
        nodeId: id,
        type: "conversational",
        prompt: c.prompt,
        answerGuide: c.answerGuide,
      });
    }
  }

  return Response.json({ questions: listQuestions(id, type) });
});
