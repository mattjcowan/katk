import { runWithUserDb } from "@/db/user-db";
import { getSessionBundle } from "@/lib/queries";
import { getLiveShare } from "@/lib/shares";
import SharedSessionViewer from "./SharedSessionViewer";

// Public, unauthenticated read-only view of a single session. The token maps to
// (owner, session) in app.db; we open that owner's DB read-only and preload the
// whole session so the client viewer makes no authenticated calls.
export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = getLiveShare(token);
  const bundle = share
    ? runWithUserDb(share.userId, () => getSessionBundle(share.sessionId))
    : null;

  if (!bundle) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-6 text-center dark:bg-slate-950">
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Link unavailable
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            This shared link is invalid or has been revoked.
          </p>
        </div>
      </main>
    );
  }

  return <SharedSessionViewer bundle={bundle} />;
}
