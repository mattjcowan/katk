import "server-only";
import * as YAML from "yaml";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { id as mintId } from "@/lib/ids";
import { slugify } from "@/lib/tree";
import { DEFAULT_TIERS, type Tier } from "@/lib/tiers";
import {
  taxonomySeedSchema,
  type NodeSeed,
  type QuestionSeed,
  type TaxonomySeed,
} from "@/lib/taxonomy-schema";

// YAML is the interchange format for a whole taxonomy — the mechanism that
// moves a tree (and, optionally, its authored question banks) between KATK
// installs. See docs/DESIGN.md §6.1 / §7 / §12.
//
// What travels: the tree (definitions) + optionally per-node MCQ and/or
// conversational questions. What does NOT: ratings, answers, notes, messages —
// those are per-subject/session runtime data, not portable content.

export type IncludeOpts = { mcq?: boolean; conversational?: boolean };

// Export an active taxonomy tree to YAML, with node ids so a re-import upserts
// by stable id instead of duplicating. Returns null if the taxonomy is unknown.
export function exportTaxonomyYaml(
  taxonomyId: string,
  include: IncludeOpts,
): { yaml: string; filename: string } | null {
  const tax = db
    .select()
    .from(schema.taxonomies)
    .where(eq(schema.taxonomies.id, taxonomyId))
    .get();
  if (!tax) return null;

  const nodes = db
    .select()
    .from(schema.nodes)
    .where(
      and(
        eq(schema.nodes.taxonomyId, taxonomyId),
        eq(schema.nodes.archived, false),
      ),
    )
    .orderBy(asc(schema.nodes.orderIndex))
    .all();

  const qByNode = new Map<string, QuestionSeed[]>();
  const wantMcq = !!include.mcq;
  const wantConv = !!include.conversational;
  if ((wantMcq || wantConv) && nodes.length) {
    const rows = db
      .select()
      .from(schema.questions)
      .where(
        inArray(
          schema.questions.nodeId,
          nodes.map((n) => n.id),
        ),
      )
      .orderBy(asc(schema.questions.orderIndex), asc(schema.questions.createdAt))
      .all();
    for (const q of rows) {
      if (q.type === "mcq" && !wantMcq) continue;
      if (q.type === "conversational" && !wantConv) continue;
      const seed: QuestionSeed = {
        id: q.id,
        type: q.type as "mcq" | "conversational",
        prompt: q.prompt,
      };
      if (q.type === "mcq") {
        if (q.options) seed.options = q.options;
        if (q.answerIndex != null) seed.answerIndex = q.answerIndex;
      }
      if (q.answerGuide) seed.answerGuide = q.answerGuide;
      const arr = qByNode.get(q.nodeId);
      if (arr) arr.push(seed);
      else qByNode.set(q.nodeId, [seed]);
    }
  }

  const byParent = new Map<string | null, typeof nodes>();
  for (const n of nodes) {
    const k = n.parentId ?? null;
    const arr = byParent.get(k);
    if (arr) arr.push(n);
    else byParent.set(k, [n]);
  }

  function build(parentId: string | null): NodeSeed[] {
    return (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((n) => {
        const seed: NodeSeed = { id: n.id, slug: n.slug, title: n.title };
        if (n.description) seed.description = n.description;
        if (n.weight !== 1) seed.weight = n.weight;
        if (n.tierRubric) seed.tierRubric = n.tierRubric;
        const qs = qByNode.get(n.id);
        if (qs && qs.length) seed.questions = qs;
        const children = build(n.id);
        if (children.length) seed.children = children;
        return seed;
      });
  }

  const doc: Record<string, unknown> = { id: tax.id, title: tax.title };
  if (tax.description) doc.description = tax.description;
  doc.tiers = (tax.tierScale as Tier[]) ?? DEFAULT_TIERS;
  doc.tree = build(null);

  const yaml = YAML.stringify(doc, { lineWidth: 0 });
  return { yaml, filename: `${slugify(tax.title) || tax.id}.yaml` };
}

export type ImportResult =
  | {
      ok: true;
      taxonomyId: string;
      inserted: number;
      matched: number;
      questionsInserted: number;
    }
  | { ok: false; error: string };

// Idempotent upsert-by-id import of a taxonomy YAML into the current user's DB.
// Additive by default (docs/DESIGN.md §7.3): existing nodes/questions are left
// as-is; only new ids insert. Question banks travel only if present in the file.
export function importTaxonomyYaml(yamlText: string): ImportResult {
  let parsed: TaxonomySeed;
  try {
    parsed = taxonomySeedSchema.parse(YAML.parse(yamlText));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid YAML" };
  }
  const tiers = parsed.tiers ?? DEFAULT_TIERS;

  const existingTax = db
    .select({ id: schema.taxonomies.id })
    .from(schema.taxonomies)
    .where(eq(schema.taxonomies.id, parsed.id))
    .get();
  if (existingTax) {
    db.update(schema.taxonomies)
      .set({
        title: parsed.title,
        description: parsed.description ?? "",
        tierScale: tiers,
      })
      .where(eq(schema.taxonomies.id, parsed.id))
      .run();
  } else {
    db.insert(schema.taxonomies)
      .values({
        id: parsed.id,
        title: parsed.title,
        description: parsed.description ?? "",
        tierScale: tiers,
      })
      .run();
  }

  let inserted = 0;
  let matched = 0;
  let questionsInserted = 0;

  function importQuestions(nodeId: string, questions: QuestionSeed[]) {
    for (const q of questions) {
      const qid = q.id ?? mintId("q");
      const qExists = q.id
        ? db
            .select({ id: schema.questions.id })
            .from(schema.questions)
            .where(eq(schema.questions.id, qid))
            .get()
        : undefined;
      if (qExists) continue;
      const sib = db
        .select({ orderIndex: schema.questions.orderIndex })
        .from(schema.questions)
        .where(eq(schema.questions.nodeId, nodeId))
        .all();
      const nextOrder =
        sib.reduce((m, s) => Math.max(m, s.orderIndex), -1) + 1;
      db.insert(schema.questions)
        .values({
          id: qid,
          nodeId,
          type: q.type,
          prompt: q.prompt,
          options: q.options ?? null,
          answerIndex: q.answerIndex ?? null,
          answerGuide: q.answerGuide ?? null,
          orderIndex: nextOrder,
        })
        .run();
      questionsInserted++;
    }
  }

  function walk(seeds: NodeSeed[], parentId: string | null) {
    seeds.forEach((seed, i) => {
      const slug = seed.slug || slugify(seed.title);
      let nid = seed.id ?? null;
      let existing = nid
        ? db.select().from(schema.nodes).where(eq(schema.nodes.id, nid)).get()
        : undefined;
      if (!existing && !nid) {
        existing = db
          .select()
          .from(schema.nodes)
          .where(
            and(
              eq(schema.nodes.taxonomyId, parsed.id),
              eq(schema.nodes.slug, slug),
            ),
          )
          .get();
        if (existing) nid = existing.id;
      }
      if (!nid) nid = mintId("n");

      if (existing) {
        matched++;
      } else {
        db.insert(schema.nodes)
          .values({
            id: nid,
            taxonomyId: parsed.id,
            parentId,
            slug,
            title: seed.title,
            description: seed.description ?? "",
            weight: seed.weight ?? 1,
            tierRubric: seed.tierRubric ?? null,
            orderIndex: i,
            source: "import",
          })
          .run();
        inserted++;
      }

      if (seed.questions && seed.questions.length)
        importQuestions(nid, seed.questions);

      if (seed.children && seed.children.length) walk(seed.children, nid);
    });
  }

  walk(parsed.tree, null);

  return {
    ok: true,
    taxonomyId: parsed.id,
    inserted,
    matched,
    questionsInserted,
  };
}
