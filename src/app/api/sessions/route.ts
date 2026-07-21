import { createSession } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => null);
  if (!body?.subjectId || !body?.taxonomyId) {
    return Response.json(
      { error: "subjectId and taxonomyId required" },
      { status: 400 },
    );
  }
  const id = createSession(
    body.subjectId,
    body.taxonomyId,
    body.mode ?? "interview",
  );
  return Response.json({ id });
});
