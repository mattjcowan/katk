"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SetPasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    if (pw !== confirm) return setErr("Passwords don't match.");
    setBusy(true);
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newPassword: pw }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(j.error ?? "Failed");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">Set your password</h1>
      <p className="mt-1 text-sm text-slate-500">
        {forced
          ? "Choose a new password to finish setting up your account."
          : "Update your password."}
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="new password"
          autoFocus
          className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-600"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="confirm password"
          className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-600"
        />
        {err && <p className="text-sm text-red-500">{err}</p>}
        <button
          disabled={busy}
          className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
        >
          {busy ? "…" : "Save password"}
        </button>
        {!forced && (
          <Link
            href="/"
            className="block text-center text-xs text-slate-400 hover:text-slate-600"
          >
            Cancel
          </Link>
        )}
      </form>
    </main>
  );
}
