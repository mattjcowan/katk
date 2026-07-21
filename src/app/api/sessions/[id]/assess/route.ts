import { resolveAnthropic } from "@/lib/ai";
import { gradeConversational } from "@/lib/claude";
import {
  getNode,
  getTierScale,
  questionsWithAnswers,
  setAnswerGrade,
  upsertRating,
} from "@/lib/queries";
import { withAuth } from "@/lib/route";

// Auto-assess a node from the respondent's answers this session:
// MCQ scored by correctness, conversational graded by Claude vs the answer
// guide, combined into an assessed tier that fills the expert assessment.
export const POST = withAuth(async (req, { params }, user) => {
  const { id: sessionId } = await params;
  const body = await req.json().catch(() => null);
  const nodeId = body?.nodeId;
  if (!nodeId) return Response.json({ error: "nodeId required" }, { status: 400 });

  const node = getNode(nodeId);
  if (!node) return Response.json({ error: "node not found" }, { status: 404 });
  const tiers = getTierScale(node.taxonomyId);
  const tierMax = tiers.reduce((m, t) => Math.max(m, t.n), 0);

  const qa = questionsWithAnswers(sessionId, nodeId);
  const mcq = qa.filter(
    (q) => q.type === "mcq" && q.answer && q.answer.choice != null,
  );
  const conv = qa.filter(
    (q) =>
      q.type === "conversational" && q.answer && (q.answer.text ?? "").trim(),
  );

  const scores: number[] = []; // 0..1 per answered question
  let mcqCorrect = 0;
  for (const q of mcq) {
    const ok = q.answer!.choice === q.answerIndex;
    if (ok) mcqCorrect++;
    scores.push(ok ? 1 : 0);
  }

  let convGraded = 0;
  let convError: string | undefined;
  if (conv.length) {
    const ai = resolveAnthropic(user);
    const res = ai.ok
      ? await gradeConversational(ai, {
          nodeTitle: node.title,
          items: conv.map((q) => ({
            prompt: q.prompt,
            answerGuide: q.answerGuide ?? "",
            answer: q.answer!.text ?? "",
          })),
        })
      : ai;
    if (res.ok) {
      res.grades.forEach((g, idx) => {
        const s = Math.min(100, Math.max(0, g.score));
        scores.push(s / 100);
        const q = conv[idx];
        if (q) setAnswerGrade(sessionId, q.id, s, g.feedback);
      });
      convGraded = res.grades.length;
    } else {
      convError = res.error;
    }
  }

  if (scores.length === 0) {
    return Response.json(
      { error: "No answers to evaluate yet." },
      { status: 400 },
    );
  }

  const frac = scores.reduce((a, b) => a + b, 0) / scores.length;
  const tier = Math.round(frac * tierMax);
  const rationale = `Auto-assessed ${Math.round(frac * 100)}% → tier ${tier} (${mcqCorrect}/${mcq.length} MCQ correct${
    conv.length ? `, ${convGraded} conversational graded` : ""
  }).`;
  upsertRating(sessionId, nodeId, { assessedTier: tier, rationale });

  return Response.json({
    tier,
    mcq: { correct: mcqCorrect, total: mcq.length },
    conversational: { graded: convGraded, total: conv.length, error: convError },
  });
});
