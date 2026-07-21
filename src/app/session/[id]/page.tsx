import { notFound, redirect } from "next/navigation";
import { getSessionData } from "@/lib/queries";
import { runWithUserDb } from "@/db/user-db";
import { requireUser } from "@/lib/session";
import SessionWorkspace from "./SessionWorkspace";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/set-password");
  const { id } = await params;
  const data = runWithUserDb(user.id, () => getSessionData(id));
  if (!data) notFound();
  return <SessionWorkspace initial={data} sessionId={id} />;
}
