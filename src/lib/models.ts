// Models offered in the per-user model dropdown. Plain module (client + server).
export const MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — fastest, cheapest" },
  { id: "claude-sonnet-5", label: "Sonnet 5 — balanced" },
  { id: "claude-opus-4-8", label: "Opus 4.8 — most capable, priciest" },
] as const;

export function isValidModel(id: string): boolean {
  return MODELS.some((m) => m.id === id);
}

export function serverDefaultModel(): string {
  return process.env.KATK_MODEL ?? "claude-opus-4-8";
}
