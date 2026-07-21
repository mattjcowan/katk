"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MODELS } from "@/lib/models";

const H = { "content-type": "application/json" };

type Initial = {
  hasApiKey: boolean;
  keyHint: string | null;
  model: string;
  forceOwnKey: boolean;
  serverKeyAvailable: boolean;
};

export default function SettingsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [hasApiKey, setHasApiKey] = useState(initial.hasApiKey);
  const [keyHint, setKeyHint] = useState(initial.keyHint);
  const [keyInput, setKeyInput] = useState("");
  const [model, setModel] = useState(initial.model);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveKey() {
    if (!keyInput.trim()) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/me/settings", {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ apiKey: keyInput.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return setMsg(j.error ?? "Failed to save key");
    }
    setHasApiKey(true);
    setKeyHint(keyInput.trim().slice(-4));
    setKeyInput("");
    setMsg("API key saved.");
    router.refresh();
  }

  async function removeKey() {
    if (!confirm("Remove your API key?")) return;
    setBusy(true);
    setMsg(null);
    await fetch("/api/me/settings", {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ removeKey: true }),
    });
    setBusy(false);
    setHasApiKey(false);
    setKeyHint(null);
    setMsg("API key removed.");
    router.refresh();
  }

  async function saveModel(next: string) {
    setModel(next);
    await fetch("/api/me/settings", {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ model: next || null }),
    });
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-600">
          ← KATK
        </Link>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {initial.forceOwnKey && !hasApiKey && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Your administrator requires you to use your own Anthropic API key. AI
          features (decompose, question generation, auto-assessment) are disabled
          until you add one below.
        </p>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold">Anthropic API key</h2>
        <p className="mt-1 text-xs text-slate-500">
          Stored encrypted at rest. Powers the AI features.
          {initial.serverKeyAvailable && !initial.forceOwnKey
            ? " If you don't add one, a shared server key is used."
            : ""}
        </p>
        {hasApiKey && (
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              key set ••••{keyHint}
            </span>
            <button
              onClick={removeKey}
              disabled={busy}
              className="text-xs text-slate-400 hover:text-red-600"
            >
              remove
            </button>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
            className="w-72 rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
          />
          <button
            onClick={saveKey}
            disabled={busy || !keyInput.trim()}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-slate-200 dark:text-slate-900"
          >
            {hasApiKey ? "Replace" : "Save"}
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold">Model</h2>
        <p className="mt-1 text-xs text-slate-500">
          Applies when using your own key. On the shared server key, the
          server&apos;s default (cost-controlled) model is always used.
        </p>
        <select
          value={model}
          onChange={(e) => saveModel(e.target.value)}
          disabled={!hasApiKey}
          className="mt-3 rounded border border-slate-300 bg-transparent px-2 py-1 text-sm disabled:opacity-50 dark:border-slate-600"
        >
          <option value="">Server default</option>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {!hasApiKey && (
          <p className="mt-2 text-[11px] text-slate-400">
            Add your own API key to choose a model.
          </p>
        )}
      </section>

      {msg && <p className="mt-4 text-sm text-slate-500">{msg}</p>}
    </main>
  );
}
