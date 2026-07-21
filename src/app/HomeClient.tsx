"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
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

  // inline editing / import-export
  const [editSubId, setEditSubId] = useState<string | null>(null);
  const [editSubName, setEditSubName] = useState("");
  const [editTaxId, setEditTaxId] = useState<string | null>(null);
  const [editTaxTitle, setEditTaxTitle] = useState("");
  const [editTaxDesc, setEditTaxDesc] = useState("");
  const [exportTaxId, setExportTaxId] = useState<string | null>(null);
  const [expMcq, setExpMcq] = useState(true);
  const [expConv, setExpConv] = useState(true);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // read-only share links
  const [shareForId, setShareForId] = useState<string | null>(null);
  const [shareLinks, setShareLinks] = useState<
    { token: string; label: string | null }[]
  >([]);
  const [shareBusy, setShareBusy] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

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

  async function saveSubjectName(id: string) {
    const nm = editSubName.trim();
    if (!nm) return;
    await fetch(`/api/subjects/${id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ name: nm }),
    });
    setEditSubId(null);
    router.refresh();
  }

  async function saveTaxonomyEdit(id: string) {
    const title = editTaxTitle.trim();
    if (!title) return;
    await fetch(`/api/taxonomies/${id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ title, description: editTaxDesc }),
    });
    setEditTaxId(null);
    router.refresh();
  }

  function shareUrl(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/share/${token}`;
  }
  async function loadShares(sessionId: string) {
    const rows = await fetch(`/api/sessions/${sessionId}/share`).then((r) =>
      r.json(),
    );
    setShareLinks(Array.isArray(rows) ? rows : []);
  }
  async function toggleShare(sessionId: string) {
    if (shareForId === sessionId) {
      setShareForId(null);
      return;
    }
    setCopiedToken(null);
    setShareLinks([]);
    setShareForId(sessionId);
    await loadShares(sessionId);
  }
  async function createShareLink(sessionId: string) {
    setShareBusy(true);
    await fetch(`/api/sessions/${sessionId}/share`, {
      method: "POST",
      headers: H,
      body: "{}",
    });
    await loadShares(sessionId);
    setShareBusy(false);
  }
  async function revokeShareLink(sessionId: string, token: string) {
    await fetch(`/api/shares/${token}`, { method: "DELETE" });
    await loadShares(sessionId);
  }
  async function copyShare(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopiedToken(token);
    } catch {}
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/taxonomies/import", {
        method: "POST",
        headers: H,
        body: JSON.stringify({ yaml: text }),
      });
      const j = await res.json();
      if (!res.ok) alert(j.error ?? "import failed");
      else
        alert(
          `Imported into "${j.taxonomyId}": ${j.inserted} new node(s), ${j.matched} matched, ${j.questionsInserted} question(s).`,
        );
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
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
                  <li key={t.id} className="text-sm">
                    {editTaxId === t.id ? (
                      <div className="space-y-1 rounded border border-slate-200 p-2 dark:border-slate-700">
                        <input
                          value={editTaxTitle}
                          onChange={(e) => setEditTaxTitle(e.target.value)}
                          placeholder="title"
                          className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
                        />
                        <textarea
                          value={editTaxDesc}
                          onChange={(e) => setEditTaxDesc(e.target.value)}
                          rows={2}
                          placeholder="description (optional)…"
                          className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                        />
                        <div className="flex gap-2 text-xs">
                          <button
                            onClick={() => saveTaxonomyEdit(t.id)}
                            className="rounded bg-slate-800 px-2 py-0.5 text-white dark:bg-slate-200 dark:text-slate-900"
                          >
                            save
                          </button>
                          <button
                            onClick={() => setEditTaxId(null)}
                            className="text-slate-400"
                          >
                            cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            t.archived ? "text-slate-400 line-through" : ""
                          }
                          title={t.description || undefined}
                        >
                          {t.title}
                        </span>
                        <span className="ml-auto flex gap-2 text-xs text-slate-400">
                          <button
                            onClick={() => {
                              setEditTaxId(t.id);
                              setEditTaxTitle(t.title);
                              setEditTaxDesc(t.description);
                              setExportTaxId(null);
                            }}
                            className="hover:text-slate-700 dark:hover:text-slate-200"
                          >
                            edit
                          </button>
                          <button
                            onClick={() =>
                              setExportTaxId((v) => (v === t.id ? null : t.id))
                            }
                            className="hover:text-slate-700 dark:hover:text-slate-200"
                          >
                            export
                          </button>
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
                      </div>
                    )}
                    {exportTaxId === t.id && (
                      <div className="mt-1 space-y-2 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
                        <div className="text-slate-500">Include in export:</div>
                        <label className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                          <input type="checkbox" checked readOnly disabled />
                          Tree (always)
                        </label>
                        <label className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={expMcq}
                            onChange={(e) => setExpMcq(e.target.checked)}
                          />
                          Multiple-choice questions
                        </label>
                        <label className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={expConv}
                            onChange={(e) => setExpConv(e.target.checked)}
                          />
                          Conversational questions
                        </label>
                        <a
                          href={`/api/taxonomies/${t.id}/export?mcq=${
                            expMcq ? 1 : 0
                          }&conversational=${expConv ? 1 : 0}`}
                          download
                          onClick={() => setExportTaxId(null)}
                          className="inline-block rounded bg-slate-800 px-2 py-0.5 text-white dark:bg-slate-200 dark:text-slate-900"
                        >
                          Download YAML ↓
                        </a>
                      </div>
                    )}
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
              <div className="mt-2 flex items-center gap-2">
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".yaml,.yml,text/yaml,application/x-yaml"
                  onChange={onImportFile}
                  className="hidden"
                />
                <button
                  onClick={() => importInputRef.current?.click()}
                  disabled={importing}
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  {importing ? "importing…" : "↑ import taxonomy (YAML)"}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                New taxonomies start empty — open a session and add root nodes.
                Import upserts by id (additive); ratings & answers never travel.
              </p>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">
                Subjects
              </div>
              <ul className="space-y-1">
                {subjects.map((s) =>
                  editSubId === s.id ? (
                    <li key={s.id} className="flex items-center gap-1 text-sm">
                      <input
                        value={editSubName}
                        onChange={(e) => setEditSubName(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && saveSubjectName(s.id)
                        }
                        autoFocus
                        className="min-w-0 flex-1 rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
                      />
                      <button
                        onClick={() => saveSubjectName(s.id)}
                        className="rounded bg-slate-800 px-2 py-1 text-xs text-white dark:bg-slate-200 dark:text-slate-900"
                      >
                        save
                      </button>
                      <button
                        onClick={() => setEditSubId(null)}
                        className="text-xs text-slate-400"
                      >
                        ×
                      </button>
                    </li>
                  ) : (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <span>{s.name}</span>
                      <span className="ml-auto flex gap-2 text-xs text-slate-400">
                        <button
                          onClick={() => {
                            setEditSubId(s.id);
                            setEditSubName(s.name);
                          }}
                          className="hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          rename
                        </button>
                        <button
                          onClick={() => deleteSubject(s.id, s.name)}
                          className="hover:text-red-600"
                        >
                          delete
                        </button>
                      </span>
                    </li>
                  ),
                )}
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
              <li key={s.id} className="py-2">
                <div className="group flex items-center gap-3">
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
                    onClick={() => toggleShare(s.id)}
                    className={`text-xs hover:text-indigo-600 ${
                      shareForId === s.id
                        ? "text-indigo-600"
                        : "text-slate-400 opacity-0 group-hover:opacity-100"
                    }`}
                    title="share a read-only link"
                  >
                    share
                  </button>
                  <button
                    onClick={() => deleteSession(s.id)}
                    className="text-xs text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
                    title="delete session"
                  >
                    ✕
                  </button>
                </div>
                {shareForId === s.id && (
                  <div className="mt-2 space-y-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        Read-only share links
                      </span>
                      <button
                        onClick={() => createShareLink(s.id)}
                        disabled={shareBusy}
                        className="rounded bg-slate-800 px-2 py-0.5 text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
                      >
                        {shareBusy ? "…" : "+ create link"}
                      </button>
                    </div>
                    {shareLinks.length === 0 ? (
                      <p className="text-slate-400">
                        No links yet. Create one to share this session read-only.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {shareLinks.map((lk) => (
                          <li key={lk.token} className="flex items-center gap-2">
                            <input
                              readOnly
                              value={shareUrl(lk.token)}
                              onFocus={(e) => e.currentTarget.select()}
                              className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] dark:border-slate-600 dark:bg-slate-950"
                            />
                            <button
                              onClick={() => copyShare(lk.token)}
                              className="shrink-0 rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                            >
                              {copiedToken === lk.token ? "copied ✓" : "copy"}
                            </button>
                            <button
                              onClick={() => revokeShareLink(s.id, lk.token)}
                              className="shrink-0 text-slate-400 hover:text-red-600"
                            >
                              revoke
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[10px] text-slate-400">
                      Anyone with the link can view this session&apos;s tree,
                      radar, and Q&amp;A results — no login. Revoke to disable.
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
