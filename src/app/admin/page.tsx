import { redirect } from "next/navigation";
import { listUsers } from "@/lib/accounts";
import { requireUser } from "@/lib/session";
import AdminConsole from "./AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return <AdminConsole users={listUsers()} meId={user.id} />;
}
