import { deleteSubject, updateSubject } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const PATCH = withAuth(async (req, { params }) => {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};
  const patch: { name?: string; email?: string | null } = {};
  if (typeof body.name === "string" && body.name.trim())
    patch.name = body.name.trim();
  if ("email" in body)
    patch.email = body.email ? String(body.email).trim() : null;
  updateSubject(id, patch);
  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (_req, { params }) => {
  const { id } = await params;
  deleteSubject(id);
  return Response.json({ ok: true });
});
