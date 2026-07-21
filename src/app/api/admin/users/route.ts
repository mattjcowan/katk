import { createUser, getUserByEmail, listUsers } from "@/lib/accounts";
import { provisionUserDb } from "@/lib/bootstrap";
import { withAdmin } from "@/lib/route";

export const GET = withAdmin(async () => Response.json(listUsers()));

export const POST = withAdmin(async (req) => {
  const body = await req.json().catch(() => null);
  const email = body?.email?.trim();
  const displayName = body?.displayName?.trim();
  const tempPassword = body?.tempPassword;
  if (!email || !displayName || !tempPassword) {
    return Response.json(
      { error: "email, displayName and tempPassword are required" },
      { status: 400 },
    );
  }
  if (getUserByEmail(email)) {
    return Response.json(
      { error: "A user with that email already exists" },
      { status: 409 },
    );
  }
  const uid = createUser({ email, displayName, tempPassword });
  provisionUserDb(uid);
  return Response.json({ id: uid });
});
