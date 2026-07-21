import { deleteQuestion } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const DELETE = withAuth(async (_req, { params }) => {
  const { id } = await params;
  deleteQuestion(id);
  return Response.json({ ok: true });
});
