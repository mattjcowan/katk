import { readFileSync, writeFileSync } from "node:fs";
import * as YAML from "yaml";
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { id } from "./ids";
import { DEFAULT_TIERS } from "./tiers";
import { taxonomySeedSchema } from "./taxonomy-schema";

type DB = BetterSQLite3Database<typeof schema>;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Idempotent upsert-by-id import of a taxonomy YAML into a drizzle DB.
// writeBack backfills minted ids into the source file (CLI authoring); when
// provisioning a user DB from already-id'd seed files, pass writeBack: false.
export function importTaxonomy(
  db: DB,
  yamlPath: string,
  opts: { writeBack?: boolean } = {},
) {
  const doc = YAML.parseDocument(readFileSync(yamlPath, "utf8"));
  const parsed = taxonomySeedSchema.parse(doc.toJS());
  const tiers = parsed.tiers ?? DEFAULT_TIERS;

  const tax = db
    .select()
    .from(schema.taxonomies)
    .where(eq(schema.taxonomies.id, parsed.id))
    .get();
  if (tax) {
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
  let dirty = false;

  function walk(seq: YAML.YAMLSeq, parentId: string | null) {
    seq.items.forEach((item, i) => {
      const map = item as YAML.YAMLMap;
      const title = String(map.get("title"));
      const slug = map.get("slug") ? String(map.get("slug")) : slugify(title);
      let nid = map.get("id") ? String(map.get("id")) : null;

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
      if (!nid) nid = id("n");
      if (!map.get("id")) {
        map.set("id", nid);
        dirty = true;
      }

      if (existing) {
        matched++;
      } else {
        const desc = map.get("description");
        const weight = map.get("weight");
        db.insert(schema.nodes)
          .values({
            id: nid,
            taxonomyId: parsed.id,
            parentId,
            slug,
            title,
            description: desc != null ? String(desc) : "",
            weight: weight != null ? Number(weight) : 1,
            orderIndex: i,
            source: "import",
          })
          .run();
        inserted++;
      }

      const children = map.get("children");
      if (YAML.isSeq(children)) walk(children, nid);
    });
  }

  const tree = doc.get("tree");
  if (YAML.isSeq(tree)) walk(tree, null);

  if (dirty && opts.writeBack) writeFileSync(yamlPath, doc.toString(), "utf8");

  return { taxonomyId: parsed.id, inserted, matched, dirty };
}
