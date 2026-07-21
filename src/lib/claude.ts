import "server-only";
import type { AnthropicCtx } from "@/lib/ai";

// The "break this down" affordance (docs/DESIGN.md §4). Claude proposes child
// subcategories; the operator accepts/edits/rejects. Structured output via
// output_config.format guarantees parseable JSON. Degrades gracefully when no
// credentials are configured — the caller surfaces the error and manual
// "add child" still works.

export type ProposedChild = { title: string; description: string };
export type DecomposeResult =
  | { ok: true; children: ProposedChild[] }
  | { ok: false; error: string };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    children: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title", "description"],
      },
    },
  },
  required: ["children"],
} as const;

const SYSTEM = `You help build a knowledge-assessment taxonomy — a tree of areas of \
competence a person can be more or less proficient at (knowledge areas OR \
skills/procedures). You decompose one node into the sub-areas worth assessing.

Rules:
- Propose about the number of children requested in the message (a few more or \
fewer is fine to keep them clean and non-overlapping).
- Only split into children that a real person could score DIFFERENTLY on. If two \
proposed children would always get the same skill level, merge them.
- Children must be siblings at a comparable level of granularity.
- Do NOT duplicate the existing children you are given.
- Each description is one short sentence a non-expert can understand.
- Order from most foundational to most advanced.`;

export async function decomposeNode(
  ctx: AnthropicCtx,
  input: {
    taxonomyTitle: string;
    path: string[];
    ancestors?: { title: string; description: string }[];
    nodeTitle: string;
    nodeDescription: string;
    existingChildren: string[];
    count?: number;
    steer?: string;
  },
): Promise<DecomposeResult> {
  const n = Math.max(1, Math.min(30, Math.round(input.count ?? 6)));
  const where = [input.taxonomyTitle, ...input.path].filter(Boolean).join(" › ");
  const ancestorLines = (input.ancestors ?? [])
    .filter((a) => a.description)
    .map((a) => `- ${a.title}: ${a.description}`)
    .join("\n");
  const user = `Taxonomy: ${input.taxonomyTitle}
Location: ${where || "(root)"}${
    ancestorLines ? `\nAncestor context (root → parent):\n${ancestorLines}` : ""
  }
Node to break down: "${input.nodeTitle}"${
    input.nodeDescription ? `\nNode description: ${input.nodeDescription}` : ""
  }
Existing children (do not repeat): ${
    input.existingChildren.length ? input.existingChildren.join(", ") : "(none)"
  }${input.steer ? `\nSteer the suggestions toward: ${input.steer}` : ""}

Propose about ${n} sub-areas of "${input.nodeTitle}" worth assessing separately.`;

  try {
    const response = await ctx.client.messages.create({
      model: ctx.model,
      max_tokens: Math.min(8000, 1200 + n * 220),
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "The model declined this request." };
    }
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { ok: false, error: "No structured output returned." };
    }
    const parsed = JSON.parse(textBlock.text) as { children: ProposedChild[] };
    const existing = new Set(
      input.existingChildren.map((s) => s.trim().toLowerCase()),
    );
    const children = (parsed.children ?? []).filter(
      (c) => c.title && !existing.has(c.title.trim().toLowerCase()),
    );
    return { ok: true, children };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// --- question generation ---
type GenMcq = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};
type GenConv = { prompt: string; answerGuide: string };

export type GenQuestionsResult =
  | { ok: true; questions: (GenMcq | GenConv)[] }
  | { ok: false; error: string };

const MCQ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          prompt: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answerIndex: { type: "integer" },
          explanation: { type: "string" },
        },
        required: ["prompt", "options", "answerIndex", "explanation"],
      },
    },
  },
  required: ["questions"],
} as const;

const CONV_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          prompt: { type: "string" },
          answerGuide: { type: "string" },
        },
        required: ["prompt", "answerGuide"],
      },
    },
  },
  required: ["questions"],
} as const;

const MCQ_SYSTEM = `You write multiple-choice questions that assess real understanding of a \
topic (not trivia). Each question has exactly 4 options with exactly one correct \
answer ("answerIndex" 0-3). Vary difficulty from foundational to advanced. \
"explanation" is one sentence on why the correct option is right. Never repeat \
the existing questions provided.`;

const CONV_SYSTEM = `You write open-ended interview questions that probe genuine understanding of a \
topic. For each, "answerGuide" describes in 1-2 sentences what a strong answer \
should cover — the things an interviewer should listen for. Vary difficulty from \
foundational to advanced. Never repeat the existing questions provided.`;

export async function generateQuestions(
  ctx: AnthropicCtx,
  input: {
    taxonomyTitle: string;
    path: string[];
    nodeTitle: string;
    nodeDescription: string;
    type: "mcq" | "conversational";
    count?: number;
    steer?: string;
    existing: string[];
  },
): Promise<GenQuestionsResult> {
  const n = input.count ?? 4;
  const isMcq = input.type === "mcq";
  const where = [input.taxonomyTitle, ...input.path, input.nodeTitle]
    .filter(Boolean)
    .join(" › ");
  const user = `Topic: ${where}${
    input.nodeDescription ? `\nDescription: ${input.nodeDescription}` : ""
  }
Existing questions (do not repeat): ${
    input.existing.length
      ? input.existing.map((q) => `- ${q}`).join("\n")
      : "(none)"
  }${input.steer ? `\nSteer toward: ${input.steer}` : ""}

Write ${n} ${
    isMcq ? "multiple-choice questions" : "open-ended interview questions"
  } assessing "${input.nodeTitle}".`;

  try {
    const response = await ctx.client.messages.create({
      model: ctx.model,
      max_tokens: 3000,
      system: isMcq ? MCQ_SYSTEM : CONV_SYSTEM,
      messages: [{ role: "user", content: user }],
      output_config: {
        format: {
          type: "json_schema",
          schema: isMcq ? MCQ_SCHEMA : CONV_SCHEMA,
        },
      },
    });
    if (response.stop_reason === "refusal")
      return { ok: false, error: "The model declined this request." };
    const tb = response.content.find((b) => b.type === "text");
    if (!tb || tb.type !== "text")
      return { ok: false, error: "No structured output returned." };
    const parsed = JSON.parse(tb.text) as {
      questions: (GenMcq | GenConv)[];
    };
    return { ok: true, questions: parsed.questions ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// --- grading conversational answers ---
type Grade = { score: number; feedback: string };
export type GradeResult =
  | { ok: true; grades: Grade[] }
  | { ok: false; error: string };

const GRADE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    grades: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          score: { type: "integer" },
          feedback: { type: "string" },
        },
        required: ["score", "feedback"],
      },
    },
  },
  required: ["grades"],
} as const;

const GRADE_SYSTEM = `You grade a respondent's answers to interview questions against an answer guide \
(the guide describes what a strong answer covers). For each item:
- "score": 0-100 for how completely and correctly the answer covers the guide \
(0 = missing or wrong, 100 = fully covers it).
- "feedback": 2-4 sentences of specific, constructive feedback addressed directly \
to the respondent ("You correctly…", "You missed…"). State concretely what they \
got right, then name the key points from the guide they omitted or got wrong. \
Refer to the actual content, not generalities.
Return exactly one grade per item, in the same order as given.`;

export async function gradeConversational(
  ctx: AnthropicCtx,
  input: {
    nodeTitle: string;
    items: { prompt: string; answerGuide: string; answer: string }[];
  },
): Promise<GradeResult> {
  const user =
    `Topic: ${input.nodeTitle}\n\nGrade these ${input.items.length} answer(s):\n\n` +
    input.items
      .map(
        (it, i) =>
          `#${i + 1}\nQuestion: ${it.prompt}\nGuide (what a strong answer covers): ${it.answerGuide}\nRespondent's answer: ${it.answer}`,
      )
      .join("\n\n");
  try {
    const response = await ctx.client.messages.create({
      model: ctx.model,
      max_tokens: 2000,
      system: GRADE_SYSTEM,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema: GRADE_SCHEMA } },
    });
    if (response.stop_reason === "refusal")
      return { ok: false, error: "The model declined this request." };
    const tb = response.content.find((b) => b.type === "text");
    if (!tb || tb.type !== "text")
      return { ok: false, error: "No structured output returned." };
    const parsed = JSON.parse(tb.text) as { grades: Grade[] };
    return { ok: true, grades: parsed.grades ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
