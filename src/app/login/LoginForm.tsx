"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(j.error ?? "Login failed");
      setBusy(false);
      return;
    }
    router.push(j.mustChangePassword ? "/set-password" : "/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">KATK</h1>
      <p className="mt-1 text-sm text-slate-500">Sign in to continue.</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          autoFocus
          required
          className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-600"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          required
          className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-600"
        />
        {err && <p className="text-sm text-red-500">{err}</p>}
        <button
          disabled={busy}
          className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
        >
          {busy ? "…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
