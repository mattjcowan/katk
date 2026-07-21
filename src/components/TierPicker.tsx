"use client";

import type { Tier } from "@/lib/tiers";

export default function TierPicker({
  tiers,
  value,
  onChange,
  accent,
}: {
  tiers: Tier[];
  value: number | null;
  onChange: (v: number | null) => void;
  accent: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {tiers.map((t) => {
        const active = value === t.n;
        return (
          <button
            key={t.n}
            title={`${t.label} · ~${t.years} yr · ${t.hours} h`}
            onClick={() => onChange(active ? null : t.n)}
            className={`h-7 w-7 rounded text-xs font-medium border transition-colors ${
              active
                ? "text-white border-transparent"
                : "border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500"
            }`}
            style={active ? { background: accent } : undefined}
          >
            {t.n}
          </button>
        );
      })}
    </div>
  );
}
