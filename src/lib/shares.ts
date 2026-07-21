import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { appDb, appSchema } from "@/db/app";
import { shareToken } from "@/lib/ids";

// Read-only share links (docs/DESIGN.md §13-adjacent). Stored in app.db so an
// unauthenticated request can map a token → (owner, session). Revocable.

export function createShare(
  userId: string,
  sessionId: string,
  label?: string | null,
): string {
  const token = shareToken();
  appDb
    .insert(appSchema.shares)
    .values({ token, userId, sessionId, label: label ?? null })
    .run();
  return token;
}

export function listSharesForSession(userId: string, sessionId: string) {
  return appDb
    .select()
    .from(appSchema.shares)
    .where(
      and(
        eq(appSchema.shares.userId, userId),
        eq(appSchema.shares.sessionId, sessionId),
      ),
    )
    .orderBy(desc(appSchema.shares.createdAt))
    .all();
}

// For the public viewer: only resolves a live (non-revoked) token.
export function getLiveShare(token: string) {
  const row = appDb
    .select()
    .from(appSchema.shares)
    .where(eq(appSchema.shares.token, token))
    .get();
  if (!row || row.revoked) return null;
  return row;
}

// Revoke, scoped to the owner so one user can't touch another's links.
export function revokeShare(userId: string, token: string) {
  appDb
    .delete(appSchema.shares)
    .where(
      and(
        eq(appSchema.shares.token, token),
        eq(appSchema.shares.userId, userId),
      ),
    )
    .run();
}
