import { redirect } from "next/navigation";
import { getUserApiKey } from "@/lib/accounts";
import { requireUser } from "@/lib/session";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/set-password");
  const key = getUserApiKey(user.id);
  return (
    <SettingsForm
      initial={{
        hasApiKey: !!key,
        keyHint: key ? key.slice(-4) : null,
        model: user.model ?? "",
        forceOwnKey: user.forceOwnKey,
        serverKeyAvailable: !!process.env.ANTHROPIC_API_KEY,
      }}
    />
  );
}
