import { requireUser } from "@/lib/session";
import SetPasswordForm from "./SetPasswordForm";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  const user = await requireUser();
  return <SetPasswordForm forced={user.mustChangePassword} />;
}
