import { deleteSession, getSessionData, updateSession } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const GET = withAuth(async (_req, { params }) => {
  const { id } = await params;
  const data = getSessionData(id);
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(data);
});

export const PATCH = withAuth(async (req, { params }) => {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};
  updateSession(id, { mode: body.mode, status: body.status });
  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (_req, { params }) => {
  const { id } = await params;
  deleteSession(id);
  return Response.json({ ok: true });
});
