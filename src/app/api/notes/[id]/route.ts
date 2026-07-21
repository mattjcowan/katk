import { deleteNote, updateNote } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const PATCH = withAuth(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.body === "string") updateNote(id, body.body);
  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (_req, { params }) => {
  const { id } = await params;
  deleteNote(id);
  return Response.json({ ok: true });
});
