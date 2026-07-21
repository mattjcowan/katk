import { createTaxonomy, listTaxonomies } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const GET = withAuth(async (req) => {
  const all = new URL(req.url).searchParams.get("all") === "1";
  return Response.json(listTaxonomies(all));
});

export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => null);
  if (!body?.title?.trim()) {
    return Response.json({ error: "title required" }, { status: 400 });
  }
  const id = createTaxonomy(body.title.trim(), body.description);
  return Response.json({ id });
});
