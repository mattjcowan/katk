import { addNode } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => null);
  if (!body?.taxonomyId || !body?.title) {
    return Response.json(
      { error: "taxonomyId and title required" },
      { status: 400 },
    );
  }
  const id = addNode({
    taxonomyId: body.taxonomyId,
    parentId: body.parentId ?? null,
    title: body.title,
    description: body.description,
    source: body.source ?? "manual",
    sessionId: body.sessionId ?? null,
  });
  return Response.json({ id });
});
