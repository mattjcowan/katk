"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const NEXT: Record<Theme, Theme> = {
  light: "dark",
  dark: "system",
  system: "light",
};
const LABEL: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = (localStorage.getItem("katk-theme") as Theme) || "system";
    setTheme(t);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("katk-theme", theme);
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, mounted]);

  if (!mounted) return null;

  return (
    <button
      onClick={() => setTheme(NEXT[theme])}
      title={`Theme: ${LABEL[theme]} — click to change`}
      aria-label={`Theme: ${LABEL[theme]}`}
      className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/80 px-3 py-1.5 text-xs text-slate-600 shadow-sm backdrop-blur transition-colors hover:bg-white dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-900"
    >
      <ThemeIcon theme={theme} />
      <span>{LABEL[theme]}</span>
    </button>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  const p = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (theme === "light")
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (theme === "dark")
    return (
      <svg {...p}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    );
  return (
    <svg {...p}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
