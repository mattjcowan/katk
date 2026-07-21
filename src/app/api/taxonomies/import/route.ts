import { importTaxonomyYaml } from "@/lib/taxonomy-io";
import { withAuth } from "@/lib/route";

// POST /api/taxonomies/import  { yaml: string }
// Upserts a whole taxonomy (tree + any embedded question banks) by stable id
// into the current user's DB. Additive: existing ids are left untouched.
export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => null);
  if (!body?.yaml || typeof body.yaml !== "string")
    return Response.json({ error: "yaml required" }, { status: 400 });
  const result = importTaxonomyYaml(body.yaml);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(result);
});
