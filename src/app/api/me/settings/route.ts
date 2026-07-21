import {
  getUserApiKey,
  removeApiKey,
  setApiKey,
  setModel,
} from "@/lib/accounts";
import { isValidModel } from "@/lib/models";
import { getCurrentUser } from "@/lib/session";

// A user's own settings (operates on the accounts DB, not per-user data).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const key = getUserApiKey(user.id);
  return Response.json({
    hasApiKey: !!key,
    keyHint: key ? key.slice(-4) : null,
    model: user.model ?? "",
    forceOwnKey: user.forceOwnKey,
  });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    apiKey?: string;
    removeKey?: boolean;
    model?: string | null;
  };

  if (body.removeKey === true) {
    removeApiKey(user.id);
  } else if (typeof body.apiKey === "string" && body.apiKey.trim()) {
    setApiKey(user.id, body.apiKey.trim());
  }

  if ("model" in body) {
    const m = body.model;
    if (m == null || m === "") setModel(user.id, null);
    else if (typeof m === "string" && isValidModel(m)) setModel(user.id, m);
    else return Response.json({ error: "invalid model" }, { status: 400 });
  }

  return Response.json({ ok: true });
}
