import "server-only";
import { runWithUserDb } from "@/db/user-db";
import { getCurrentUser } from "@/lib/session";
import type { Account } from "@/lib/accounts";

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (
  req: Request,
  ctx: Ctx,
  user: Account,
) => Promise<Response> | Response;

// Data routes: require a logged-in user and run the handler with that user's
// per-user database bound (via AsyncLocalStorage).
export function withAuth(handler: Handler) {
  return async (req: Request, ctx: Ctx) => {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
    return runWithUserDb(user.id, () => handler(req, ctx, user));
  };
}

// Admin routes: operate on the central accounts DB, no per-user DB context.
export function withAdmin(handler: Handler) {
  return async (req: Request, ctx: Ctx) => {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (user.role !== "admin")
      return Response.json({ error: "forbidden" }, { status: 403 });
    return handler(req, ctx, user);
  };
}
