import { redirect } from "next/navigation";
import { listSessions, listSubjects, listTaxonomies } from "@/lib/queries";
import { runWithUserDb } from "@/db/user-db";
import { requireUser } from "@/lib/session";
import HomeClient from "./HomeClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/set-password");
  const data = runWithUserDb(user.id, () => ({
    subjects: listSubjects(),
    taxonomies: listTaxonomies(true),
    sessions: listSessions(),
  }));
  return (
    <HomeClient
      subjects={data.subjects}
      taxonomies={data.taxonomies}
      sessions={data.sessions}
      user={{ displayName: user.displayName, role: user.role }}
    />
  );
}
