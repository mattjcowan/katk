"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type U = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
  forceOwnKey: boolean;
};
const H = { "content-type": "application/json" };

export default function AdminConsole({
  users,
  meId,
}: {
  users: U[];
  meId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: H,
      body: JSON.stringify({ email, displayName, tempPassword }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(j.error ?? "Failed to create user");
    setEmail("");
    setDisplayName("");
    setTempPassword("");
    router.refresh();
  }

  async function resetPw(u: U) {
    const temp = window.prompt(`New temporary password for ${u.email}:`);
    if (!temp) return;
    await fetch(`/api/admin/users/${u.id}/reset`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ tempPassword: temp }),
    });
    router.refresh();
  }

  async function toggleDisabled(u: U) {
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({
        status: u.status === "disabled" ? "active" : "disabled",
      }),
    });
    router.refresh();
  }

  async function toggleForceKey(u: U) {
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ forceOwnKey: !u.forceOwnKey }),
    });
    router.refresh();
  }

  async function del(u: U) {
    if (
      !confirm(
        `Delete ${u.email} and ALL their data (their entire database)? This cannot be undone.`,
      )
    )
      return;
    await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-600">
          ← KATK
        </Link>
        <h1 className="text-2xl font-bold">Users</h1>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold">Create user</h2>
        <form onSubmit={createUser} className="mt-3 flex flex-wrap items-end gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="email"
            required
            className="rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
          />
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="display name"
            required
            className="rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
          />
          <input
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            placeholder="temporary password"
            required
            className="rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
          />
          <button className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white dark:bg-slate-200 dark:text-slate-900">
            Create
          </button>
        </form>
        {err && <p className="mt-2 text-sm text-red-500">{err}</p>}
        <p className="mt-2 text-[11px] text-slate-400">
          The user signs in with this temporary password and must set their own
          on first login.
        </p>
      </section>

      <ul className="mt-6 divide-y divide-slate-200 dark:divide-slate-800">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <span className="font-medium">{u.displayName}</span>
            <span className="text-slate-400">{u.email}</span>
            {u.role === "admin" && (
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                admin
              </span>
            )}
            {u.status === "disabled" && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                disabled
              </span>
            )}
            {u.mustChangePassword && (
              <span className="text-xs text-slate-400">must set password</span>
            )}
            <label
              className="flex items-center gap-1 text-xs text-slate-500"
              title="Force this user to supply their own Anthropic API key (the shared server key won't be used for them)"
            >
              <input
                type="checkbox"
                checked={u.forceOwnKey}
                onChange={() => toggleForceKey(u)}
                className="accent-slate-600"
              />
              own key
            </label>
            {u.id !== meId && (
              <span className="ml-auto flex gap-3 text-xs text-slate-400">
                <button
                  onClick={() => resetPw(u)}
                  className="hover:text-slate-700 dark:hover:text-slate-200"
                >
                  reset pw
                </button>
                <button
                  onClick={() => toggleDisabled(u)}
                  className="hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {u.status === "disabled" ? "enable" : "disable"}
                </button>
                <button onClick={() => del(u)} className="hover:text-red-600">
                  delete
                </button>
              </span>
            )}
            {u.id === meId && (
              <span className="ml-auto text-xs text-slate-400">you</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
