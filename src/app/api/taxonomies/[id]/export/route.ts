import { exportTaxonomyYaml } from "@/lib/taxonomy-io";
import { withAuth } from "@/lib/route";

// GET /api/taxonomies/:id/export?mcq=1&conversational=1
// Streams a YAML file for the taxonomy. Query flags choose whether authored
// question banks travel along; the tree always does.
export const GET = withAuth(async (req, { params }) => {
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const result = exportTaxonomyYaml(id, {
    mcq: sp.get("mcq") === "1",
    conversational: sp.get("conversational") === "1",
  });
  if (!result)
    return Response.json({ error: "taxonomy not found" }, { status: 404 });
  return new Response(result.yaml, {
    headers: {
      "content-type": "text/yaml; charset=utf-8",
      "content-disposition": `attachment; filename="${result.filename}"`,
    },
  });
});
