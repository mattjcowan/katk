import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Account } from "@/lib/accounts";
import { decryptSecret } from "@/lib/auth-crypto";
import { isValidModel, serverDefaultModel } from "@/lib/models";

export type AnthropicCtx = { client: Anthropic; model: string };

export type ResolveResult =
  | { ok: true; client: Anthropic; model: string; usingOwnKey: boolean }
  | { ok: false; error: string };

// Resolve which key + model to use for a user's AI call:
// - own key wins and unlocks their model preference;
// - otherwise the shared server key (unless forced) with the cheap server model;
// - else a friendly error.
export function resolveAnthropic(user: Account): ResolveResult {
  let key: string | null = null;
  let usingOwnKey = false;
  if (user.apiKeyCipher) {
    key = decryptSecret(user.apiKeyCipher);
    if (key) usingOwnKey = true;
  }
  if (!key && !user.forceOwnKey && process.env.ANTHROPIC_API_KEY) {
    key = process.env.ANTHROPIC_API_KEY;
  }
  if (!key) {
    return {
      ok: false,
      error: user.forceOwnKey
        ? "Your admin requires you to add your own Anthropic API key (Settings)."
        : "No Anthropic API key configured.",
    };
  }
  const model =
    usingOwnKey && user.model && isValidModel(user.model)
      ? user.model
      : serverDefaultModel();
  return {
    ok: true,
    client: new Anthropic({ apiKey: key }),
    model,
    usingOwnKey,
  };
}
