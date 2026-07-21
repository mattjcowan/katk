import { createSubject, listSubjects } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const GET = withAuth(async () => Response.json(listSubjects()));

export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => null);
  if (!body?.name) return Response.json({ error: "name required" }, { status: 400 });
  const id = createSubject(body.name, body.email ?? null);
  return Response.json({ id });
});
