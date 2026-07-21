import { z } from "zod";

// Zod validation at the YAML boundary (import/export). See docs/DESIGN.md §6.1.
// `id` is optional in authored YAML — the importer mints and writes it back so
// future imports upsert instead of duplicating (docs/DESIGN.md §7.2).

// Per-node authored questions (mcq / conversational), carried in export/import
// round-trips. See docs/DESIGN.md §12. `id` is the stable key used to upsert.
export type QuestionSeed = {
  id?: string;
  type: "mcq" | "conversational";
  prompt: string;
  options?: string[];
  answerIndex?: number;
  answerGuide?: string;
};

export const questionSeedSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["mcq", "conversational"]),
  prompt: z.string().min(1),
  options: z.array(z.string()).optional(),
  answerIndex: z.number().optional(),
  answerGuide: z.string().optional(),
});

export type NodeSeed = {
  id?: string;
  slug?: string;
  title: string;
  description?: string;
  weight?: number;
  tierRubric?: Record<string, string>;
  questions?: QuestionSeed[];
  children?: NodeSeed[];
};

export const nodeSeedSchema: z.ZodType<NodeSeed> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    slug: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    weight: z.number().optional(),
    tierRubric: z.record(z.string(), z.string()).optional(),
    questions: z.array(questionSeedSchema).optional(),
    children: z.array(nodeSeedSchema).optional(),
  }),
);

export const tierSchema = z.object({
  n: z.number(),
  label: z.string(),
  years: z.string(),
  hours: z.string(),
});

export const taxonomySeedSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  tiers: z.array(tierSchema).optional(),
  tree: z.array(nodeSeedSchema),
});

export type TaxonomySeed = z.infer<typeof taxonomySeedSchema>;
