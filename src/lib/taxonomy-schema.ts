import { z } from "zod";

// Zod validation at the YAML boundary (import/export). See docs/DESIGN.md §6.1.
// `id` is optional in authored YAML — the importer mints and writes it back so
// future imports upsert instead of duplicating (docs/DESIGN.md §7.2).

export type NodeSeed = {
  id?: string;
  slug?: string;
  title: string;
  description?: string;
  weight?: number;
  tierRubric?: Record<string, string>;
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
