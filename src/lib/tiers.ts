// The shared tier scale for a taxonomy. See docs/DESIGN.md §2.
// Each tier is anchored by BOTH equivalent years and cumulative hours, so a
// spoke measures a knowledge area or a skill/procedure equally well.

export type Tier = {
  n: number;
  label: string;
  years: string;
  hours: string;
};

export const DEFAULT_TIERS: Tier[] = [
  { n: 0, label: "None", years: "0", hours: "0" },
  { n: 1, label: "Novice", years: "<1", hours: "<50" },
  { n: 2, label: "Competent", years: "2–5", hours: "500–2k" },
  { n: 3, label: "Proficient", years: "5–10", hours: "2k–5k" },
  { n: 4, label: "Expert", years: "10–20", hours: "5k–10k" },
  { n: 5, label: "Master", years: "20–30+", hours: ">10k" },
];

export const TIER_MIN = 0;
export const TIER_MAX = 5;

export function tierLabel(tiers: Tier[], n: number | null | undefined): string {
  if (n == null) return "—";
  return tiers.find((t) => t.n === n)?.label ?? String(n);
}
