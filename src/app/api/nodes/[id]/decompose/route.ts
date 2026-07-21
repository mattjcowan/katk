import { resolveAnthropic } from "@/lib/ai";
import { decomposeNode } from "@/lib/claude";
import { getNodeContext } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const POST = withAuth(async (req, { params }, user) => {
  const { id } = await params;
  const ctx = getNodeContext(id);
  if (!ctx) return Response.json({ error: "node not found" }, { status: 404 });

  const ai = resolveAnthropic(user);
  if (!ai.ok) return Response.json({ error: ai.error }, { status: 502 });

  const body = await req.json().catch(() => ({}));
  const result = await decomposeNode(ai, {
    taxonomyTitle: ctx.taxonomyTitle,
    path: ctx.path,
    nodeTitle: ctx.node.title,
    nodeDescription: ctx.node.description,
    existingChildren: ctx.existingChildren,
    count: body?.count,
    steer: body?.steer,
  });

  if (!result.ok) return Response.json({ error: result.error }, { status: 502 });
  return Response.json({ children: result.children });
});
