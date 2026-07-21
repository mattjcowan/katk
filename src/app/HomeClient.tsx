"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Subject = { id: string; name: string; email: string | null };
type Taxonomy = {
  id: string;
  title: string;
  description: string;
  archived: boolean;
};
type Session = {
  id: string;
  mode: string;
  status: string;
  createdAt: string | number | Date;
  subjectId: string;
  taxonomyId: string;
  subjectName: string;
  taxonomyTitle: string;
};

const H = { "content-type": "application/json" };

function fmtDate(v: string | number | Date): string {
  const d = new Date(v);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HomeClient({
  subjects,
  taxonomies,
  sessions,
  user,
}: {
  subjects: Subject[];
  taxonomies: Taxonomy[];
  sessions: Session[];
  user: { displayName: string; role: string };
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  const active = taxonomies.filter((t) => !t.archived);

  const [name, setName] = useState("");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [taxonomyId, setTaxonomyId] = useState(active[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [newTax, setNewTax] = useState("");

  // filters
  const [fSubject, setFSubject] = useState("");
  const [fTaxonomy, setFTaxonomy] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [q, setQ] = useState("");

  const categories = useMemo(
    () => [...new Set(sessions.map((s) => s.mode).filter(Boolean))].sort(),
    [sessions],
  );

  const filtered = sessions.filter((s) => {
    if (fSubject && s.subjectId !== fSubject) return false;
    if (fTaxonomy && s.taxonomyId !== fTaxonomy) return false;
    if (fCategory && s.mode !== fCategory) return false;
    if (
      q &&
      !`${s.subjectName} ${s.taxonomyTitle} ${s.mode}`
        .toLowerCase()
        .includes(q.toLowerCase())
    )
      return false;
    return true;
  });

  async function addSubject() {
    if (!name.trim()) return;
    const { id } = await fetch("/api/subjects", {
      method: "POST",
      headers: H,
      body: JSON.stringify({ name: name.trim() }),
    }).then((r) => r.json());
    setName("");
    setSubjectId(id);
    router.refresh();
  }

  async function deleteSubject(id: string, subjName: string) {
    if (
      !confirm(`Delete "${subjName}" and ALL their sessions? This cannot be undone.`)
    )
      return;
    await fetch(`/api/subjects/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function start() {
    if (!subjectId || !taxonomyId) return;
    setBusy(true);
    const { id } = await fetch("/api/sessions", {
      method: "POST",
      headers: H,
      body: JSON.stringify({ subjectId, taxonomyId }),
    }).then((r) => r.json());
    router.push(`/session/${id}`);
  }

  async function addTaxonomy() {
    if (!newTax.trim()) return;
    await fetch("/api/taxonomies", {
      method: "POST",
      headers: H,
      body: JSON.stringify({ title: newTax.trim() }),
    });
    setNewTax("");
    router.refresh();
  }

  async function toggleTaxArchived(t: Taxonomy) {
    await fetch(`/api/taxonomies/${t.id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ archived: !t.archived }),
    });
    router.refresh();
  }

  async function deleteTaxonomy(t: Taxonomy) {
    if (
      !confirm(
        `Delete taxonomy "${t.title}", its whole tree, and every session on it? This cannot be undone.`,
      )
    )
      return;
    await fetch(`/api/taxonomies/${t.id}`, { method: "DELETE" });
    router.refresh();
  }

  async function deleteSession(id: string) {
    if (!confirm("Delete this session and its ratings/notes?")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">KATK</h1>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          {user.role === "admin" && (
            <Link
              href="/admin"
              className="hover:text-slate-800 dark:hover:text-slate-200"
            >
              Admin
            </Link>
          )}
          <Link
            href="/settings"
            className="hover:text-slate-800 dark:hover:text-slate-200"
          >
            Settings
          </Link>
          <Link
            href="/set-password"
            className="hover:text-slate-800 dark:hover:text-slate-200"
          >
            Change password
          </Link>
          <span>{user.displayName}</span>
          <button
            onClick={logout}
            className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Knowledge Assessment Toolkit — conversational assessment with a live gap
        radar.
      </p>

      {/* start a session */}
      <section className="mt-8 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold">Start a session</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-500">
            Subject
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="mt-1 block rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
            >
              {subjects.length === 0 && <option value="">— none —</option>}
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Taxonomy
            <select
              value={taxonomyId}
              onChange={(e) => setTaxonomyId(e.target.value)}
              className="mt-1 block rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
            >
              {active.length === 0 && <option value="">— none —</option>}
              {active.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={start}
            disabled={busy || !subjectId || !taxonomyId}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-slate-200 dark:text-slate-900"
          >
            {busy ? "…" : "Start →"}
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSubject()}
            placeholder="new subject name…"
            className="rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
          />
          <button
            onClick={addSubject}
            className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600"
          >
            + add subject
          </button>
          <button
            onClick={() => setShowManage((v) => !v)}
            className="ml-auto text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            {showManage ? "hide manage" : "manage"}
          </button>
        </div>

        {showManage && (
          <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 dark:border-slate-800 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">
                Taxonomies
              </div>
              <ul className="space-y-1">
                {taxonomies.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <span
                      className={
                        t.archived ? "text-slate-400 line-through" : ""
                      }
                    >
                      {t.title}
                    </span>
                    <span className="ml-auto flex gap-2 text-xs text-slate-400">
                      <button
                        onClick={() => toggleTaxArchived(t)}
                        className="hover:text-slate-700 dark:hover:text-slate-200"
                      >
                        {t.archived ? "unhide" : "hide"}
                      </button>
                      <button
                        onClick={() => deleteTaxonomy(t)}
                        className="hover:text-red-600"
                      >
                        delete
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-1">
                <input
                  value={newTax}
                  onChange={(e) => setNewTax(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTaxonomy()}
                  placeholder="new taxonomy…"
                  className="flex-1 rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                />
                <button
                  onClick={addTaxonomy}
                  className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600"
                >
                  +
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                New taxonomies start empty — open a session and add root nodes.
              </p>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">
                Subjects
              </div>
              <ul className="space-y-1">
                {subjects.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <span>{s.name}</span>
                    <button
                      onClick={() => deleteSubject(s.id, s.name)}
                      className="ml-auto text-xs text-slate-400 hover:text-red-600"
                    >
                      delete
                    </button>
                  </li>
                ))}
                {subjects.length === 0 && (
                  <li className="text-xs text-slate-400">none</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* sessions */}
      <section className="mt-8">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Sessions</h2>
          <span className="text-xs text-slate-400">
            {filtered.length}/{sessions.length}
          </span>
        </div>

        {sessions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              value={fSubject}
              onChange={(e) => setFSubject(e.target.value)}
              className="rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
            >
              <option value="">all subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={fTaxonomy}
              onChange={(e) => setFTaxonomy(e.target.value)}
              className="rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
            >
              <option value="">all taxonomies</option>
              {taxonomies.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            {categories.length > 0 && (
              <select
                value={fCategory}
                onChange={(e) => setFCategory(e.target.value)}
                className="rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
              >
                <option value="">all categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search…"
              className="rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
            />
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No sessions.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
            {filtered.map((s) => (
              <li key={s.id} className="group flex items-center gap-3 py-2">
                <Link
                  href={`/session/${s.id}`}
                  className="flex flex-1 items-center gap-3 text-sm hover:opacity-70"
                >
                  <span className="font-medium">{s.subjectName}</span>
                  <span className="text-slate-400">{s.taxonomyTitle}</span>
                  {s.mode && (
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {s.mode}
                    </span>
                  )}
                  <span
                    className="ml-auto text-xs text-slate-400"
                    suppressHydrationWarning
                  >
                    {fmtDate(s.createdAt)}
                  </span>
                </Link>
                <button
                  onClick={() => deleteSession(s.id)}
                  className="text-xs text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
                  title="delete session"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
