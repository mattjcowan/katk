import {
  deleteTaxonomy,
  renameTaxonomy,
  setTaxonomyArchived,
} from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const PATCH = withAuth(async (req, { params }) => {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};
  if (typeof body.title === "string" && body.title.trim())
    renameTaxonomy(id, body.title.trim());
  if ("archived" in body) setTaxonomyArchived(id, !!body.archived);
  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (_req, { params }) => {
  const { id } = await params;
  deleteTaxonomy(id);
  return Response.json({ ok: true });
});
