"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { RatingLite, SessionData, TreeNode } from "@/lib/types";
import { effectiveTier, findNode, pathTo } from "@/lib/tree";
import { tierLabel } from "@/lib/tiers";
import TierPicker from "@/components/TierPicker";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

const GapRadar = dynamic(() => import("@/components/GapRadar"), { ssr: false });

const SELF = "#6366f1";
const ASSESSED = "#0d9488";
const H = { "content-type": "application/json" };

type Msg = { id: string; role: string; content: string; nodeId: string | null };
type NoteItem = { id: string; body: string };
type Proposal = { title: string; description: string };
type Q = {
  id: string;
  type: string;
  prompt: string;
  options: string[] | null;
  answerIndex: number | null;
  answerGuide: string | null;
};
type AnswerRow = {
  questionId: string;
  choice: number | null;
  text: string | null;
  score: number | null;
  feedback: string | null;
};

function answersToMap(rows: AnswerRow[]) {
  return Object.fromEntries(
    rows.map((a) => [
      a.questionId,
      { choice: a.choice, text: a.text, score: a.score, feedback: a.feedback },
    ]),
  );
}

function withRating(
  roots: TreeNode[],
  nodeId: string,
  patch: Partial<RatingLite>,
): TreeNode[] {
  return roots.map((n) => {
    if (n.id === nodeId) {
      const base: RatingLite = n.rating ?? {
        selfTier: null,
        assessedTier: null,
        note: null,
      };
      return { ...n, rating: { ...base, ...patch } };
    }
    return { ...n, children: withRating(n.children, nodeId, patch) };
  });
}

function gapColor(gap: number | null): string {
  if (gap == null || gap === 0) return "#94a3b8";
  return gap > 0 ? "#dc2626" : "#16a34a";
}

function collectParentIds(nodes: TreeNode[], acc: string[] = []): string[] {
  for (const n of nodes) {
    if (n.children.length) {
      acc.push(n.id);
      collectParentIds(n.children, acc);
    }
  }
  return acc;
}

function flattenForMove(
  nodes: TreeNode[],
  excludeId: string,
  depth = 0,
  acc: { id: string; title: string; depth: number }[] = [],
): { id: string; title: string; depth: number }[] {
  for (const n of nodes) {
    if (n.id === excludeId || n.archived) continue;
    acc.push({ id: n.id, title: n.title, depth });
    flattenForMove(n.children, excludeId, depth + 1, acc);
  }
  return acc;
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M4 4 20 20" />}
    </svg>
  );
}

export default function SessionWorkspace({
  initial,
  sessionId,
}: {
  initial: SessionData;
  sessionId: string;
}) {
  const [data, setData] = useState<SessionData>(initial);
  const roots = data.tree;
  const tiers = data.taxonomy.tierScale;
  const tierMax = tiers.reduce((m, t) => Math.max(m, t.n), 0);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    roots[0]?.id ?? null,
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(collectParentIds(initial.tree)),
  );
  const [showHidden, setShowHidden] = useState(false);
  const [crumbMenu, setCrumbMenu] = useState(false);
  const [centerTab, setCenterTab] = useState<
    "radar" | "mcq" | "conversational"
  >("radar");

  const [messages, setMessages] = useState<Msg[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [mcqs, setMcqs] = useState<Q[]>([]);
  const [convs, setConvs] = useState<Q[]>([]);
  const [showAnswers, setShowAnswers] = useState(false);
  const [qSteer, setQSteer] = useState("");
  const [qGenLoading, setQGenLoading] = useState(false);
  const [qGenErr, setQGenErr] = useState<string | null>(null);
  const [answers, setAnswers] = useState<
    Record<
      string,
      {
        choice?: number | null;
        text?: string | null;
        score?: number | null;
        feedback?: string | null;
      }
    >
  >({});
  const [assessing, setAssessing] = useState(false);
  const [assessResult, setAssessResult] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [catValue, setCatValue] = useState(initial.session.mode);

  const [capturing, setCapturing] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [decomposing, setDecomposing] = useState(false);
  const [decErr, setDecErr] = useState<string | null>(null);
  const [steerText, setSteerText] = useState("");
  const [newChild, setNewChild] = useState("");
  const [newChildDesc, setNewChildDesc] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descText, setDescText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const focusNode = focusId ? findNode(roots, focusId) : null;
  const spokes = (focusNode ? focusNode.children : roots).filter(
    (n) => !n.archived,
  );
  const selected = selectedId ? findNode(roots, selectedId) : null;
  const crumbs = focusId ? (pathTo(roots, focusId) ?? []) : [];
  const allParentIds = collectParentIds(roots);
  const allCollapsed = allParentIds.every((id) => collapsed.has(id));

  const radarData = spokes.map((n) => ({
    id: n.id,
    category: n.title,
    self: effectiveTier(n, "selfTier"),
    assessed: effectiveTier(n, "assessedTier"),
    hasChildren: n.children.some((c) => !c.archived),
  }));

  const selfEff = selected ? effectiveTier(selected, "selfTier") : null;
  const assessedEff = selected ? effectiveTier(selected, "assessedTier") : null;
  const selectedGap =
    selfEff != null && assessedEff != null ? selfEff - assessedEff : null;

  useEffect(() => {
    setProposals(null);
    setDecErr(null);
    setCapturing(false);
    setCaptureText("");
    setRenaming(false);
    setEditingDesc(false);
    setAddingNote(false);
    setNoteText("");
    setEditingNoteId(null);
    setQGenErr(null);
    setAssessResult(null);
    if (!selectedId) {
      setMessages([]);
      setNotes([]);
      setMcqs([]);
      setConvs([]);
      setAnswers({});
      return;
    }
    let alive = true;
    Promise.all([
      fetch(`/api/sessions/${sessionId}/messages?nodeId=${selectedId}`).then(
        (r) => r.json(),
      ),
      fetch(`/api/sessions/${sessionId}/notes?nodeId=${selectedId}`).then((r) =>
        r.json(),
      ),
      fetch(`/api/nodes/${selectedId}/questions`).then((r) => r.json()),
      fetch(`/api/sessions/${sessionId}/answers?nodeId=${selectedId}`).then(
        (r) => r.json(),
      ),
    ])
      .then(
        ([m, nt, qs, ans]: [Msg[], NoteItem[], Q[], AnswerRow[]]) => {
          if (!alive) return;
          setMessages(m);
          setNotes(nt);
          setMcqs(qs.filter((q) => q.type === "mcq"));
          setConvs(qs.filter((q) => q.type === "conversational"));
          setAnswers(answersToMap(ans));
        },
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [selectedId, sessionId]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`katk:tree:${sessionId}`);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {}
     
  }, [sessionId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        `katk:tree:${sessionId}`,
        JSON.stringify([...collapsed]),
      );
    } catch {}
  }, [collapsed, sessionId]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandTo = useCallback(
    (id: string) => {
      const p = pathTo(roots, id);
      if (!p) return;
      setCollapsed((prev) => {
        const next = new Set(prev);
        p.forEach((n) => next.delete(n.id));
        return next;
      });
    },
    [roots],
  );

  const selectNode = useCallback(
    (id: string) => {
      setSelectedId(id);
      const n = findNode(roots, id);
      if (n && n.children.some((c) => !c.archived)) setFocusId(id);
      else setFocusId(n?.parentId ?? null);
      expandTo(id);
    },
    [roots, expandTo],
  );

  const drill = useCallback(
    (id: string) => {
      setFocusId(id);
      setSelectedId(id);
      expandTo(id);
    },
    [expandTo],
  );

  async function refresh() {
    const d = await fetch(`/api/sessions/${sessionId}`).then((r) => r.json());
    setData(d);
  }
  async function refreshNotes() {
    if (!selectedId) return;
    const nt = await fetch(
      `/api/sessions/${sessionId}/notes?nodeId=${selectedId}`,
    ).then((r) => r.json());
    setNotes(nt);
  }
  async function refreshQuestions() {
    if (!selectedId) return;
    const qs: Q[] = await fetch(`/api/nodes/${selectedId}/questions`).then((r) =>
      r.json(),
    );
    setMcqs(qs.filter((q) => q.type === "mcq"));
    setConvs(qs.filter((q) => q.type === "conversational"));
  }

  async function refreshAnswers() {
    if (!selectedId) return;
    const ans: AnswerRow[] = await fetch(
      `/api/sessions/${sessionId}/answers?nodeId=${selectedId}`,
    ).then((r) => r.json());
    setAnswers(answersToMap(ans));
  }

  async function setTier(
    nodeId: string,
    key: "selfTier" | "assessedTier",
    value: number | null,
  ) {
    setData((d) => ({ ...d, tree: withRating(d.tree, nodeId, { [key]: value }) }));
    await fetch(`/api/sessions/${sessionId}/ratings`, {
      method: "PUT",
      headers: H,
      body: JSON.stringify({ nodeId, [key]: value }),
    });
  }

  async function saveCategory() {
    if (catValue === data.session.mode) return;
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ mode: catValue }),
    });
    setData((d) => ({ ...d, session: { ...d.session, mode: catValue } }));
  }

  async function capture() {
    if (!selected || !captureText.trim()) return;
    await fetch(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        nodeId: selected.id,
        role: "subject",
        content: captureText.trim(),
      }),
    });
    setCaptureText("");
    setCapturing(false);
    const m = await fetch(
      `/api/sessions/${sessionId}/messages?nodeId=${selected.id}`,
    ).then((r) => r.json());
    setMessages(m);
  }

  async function breakDown() {
    if (!selected) return;
    setDecomposing(true);
    setDecErr(null);
    setProposals(null);
    try {
      const res = await fetch(`/api/nodes/${selected.id}/decompose`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ steer: steerText || undefined }),
      });
      const j = await res.json();
      if (!res.ok) setDecErr(j.error ?? "failed");
      else setProposals(j.children);
    } catch (e) {
      setDecErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDecomposing(false);
    }
  }

  async function genQuestions(type: "mcq" | "conversational") {
    if (!selected) return;
    setQGenLoading(true);
    setQGenErr(null);
    try {
      const res = await fetch(`/api/nodes/${selected.id}/questions/generate`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ type, steer: qSteer || undefined }),
      });
      const j = await res.json();
      if (!res.ok) setQGenErr(j.error ?? "failed");
      else if (type === "mcq") setMcqs(j.questions);
      else setConvs(j.questions);
    } catch (e) {
      setQGenErr(e instanceof Error ? e.message : String(e));
    } finally {
      setQGenLoading(false);
    }
  }

  async function deleteQuestionFn(qid: string) {
    await fetch(`/api/questions/${qid}`, { method: "DELETE" });
    await refreshQuestions();
  }

  async function setAnswer(
    questionId: string,
    patch: { choice?: number | null; text?: string | null },
  ) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], ...patch },
    }));
    await fetch(`/api/sessions/${sessionId}/answers`, {
      method: "PUT",
      headers: H,
      body: JSON.stringify({ questionId, ...patch }),
    });
  }

  async function autoAssess() {
    if (!selected) return;
    setAssessing(true);
    setAssessResult(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/assess`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ nodeId: selected.id }),
      });
      const j = await res.json();
      if (!res.ok) {
        setAssessResult(j.error ?? "assessment failed");
        return;
      }
      const nodeId = selected.id;
      setData((d) => ({
        ...d,
        tree: withRating(d.tree, nodeId, { assessedTier: j.tier }),
      }));
      setShowAnswers(true);
      await refreshAnswers();
      const parts = [`Expert assessment → tier ${j.tier}`];
      if (j.mcq.total) parts.push(`${j.mcq.correct}/${j.mcq.total} MCQ correct`);
      if (j.conversational.total)
        parts.push(
          `${j.conversational.graded}/${j.conversational.total} conversational graded`,
        );
      if (j.conversational.error)
        parts.push(
          /api|key|auth/i.test(j.conversational.error)
            ? "(conversational needs an API key)"
            : `(${j.conversational.error})`,
        );
      setAssessResult(parts.join(" · "));
    } catch (e) {
      setAssessResult(e instanceof Error ? e.message : String(e));
    } finally {
      setAssessing(false);
    }
  }

  async function addChild(title: string, source: string, description?: string) {
    if (!selected || !title.trim()) return;
    const parentId = selected.id;
    await fetch(`/api/nodes`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        taxonomyId: data.taxonomy.id,
        parentId,
        title: title.trim(),
        description,
        source,
        sessionId,
      }),
    });
    await refresh();
    setFocusId(parentId);
  }

  async function addRoot() {
    const title = window.prompt("New top-level node title?");
    if (!title?.trim()) return;
    await fetch(`/api/nodes`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        taxonomyId: data.taxonomy.id,
        parentId: null,
        title: title.trim(),
        source: "manual",
        sessionId,
      }),
    });
    await refresh();
    setFocusId(null);
  }

  async function saveRename() {
    if (!selected || !renameText.trim()) return;
    await fetch(`/api/nodes/${selected.id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ title: renameText.trim() }),
    });
    setRenaming(false);
    await refresh();
  }

  async function saveDesc() {
    if (!selected) return;
    await fetch(`/api/nodes/${selected.id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ description: descText }),
    });
    setEditingDesc(false);
    await refresh();
  }

  async function moveNodeTo(newParentId: string | null) {
    if (!selected) return;
    const res = await fetch(`/api/nodes/${selected.id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ parentId: newParentId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "move failed");
      return;
    }
    const movedId = selected.id;
    await refresh();
    setFocusId(newParentId);
    setSelectedId(movedId);
    expandTo(movedId);
  }

  async function hideNode() {
    if (!selected) return;
    const parentId = selected.parentId;
    await fetch(`/api/nodes/${selected.id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ archived: true }),
    });
    await refresh();
    setSelectedId(parentId);
    setFocusId(parentId);
  }

  async function unhideNode() {
    if (!selected) return;
    await fetch(`/api/nodes/${selected.id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ archived: false }),
    });
    await refresh();
  }

  async function deleteNode() {
    if (!selected) return;
    if (
      !confirm(
        `Delete "${selected.title}"${
          selected.children.length ? " and all its sub-nodes" : ""
        }, plus their ratings/notes/questions? This cannot be undone.`,
      )
    )
      return;
    const parentId = selected.parentId;
    await fetch(`/api/nodes/${selected.id}`, { method: "DELETE" });
    await refresh();
    setSelectedId(parentId);
    setFocusId(parentId);
  }

  async function addNoteFn() {
    if (!selected || !noteText.trim()) return;
    await fetch(`/api/sessions/${sessionId}/notes`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ nodeId: selected.id, body: noteText.trim() }),
    });
    setNoteText("");
    setAddingNote(false);
    await refreshNotes();
  }

  async function saveNoteEdit(noteId: string) {
    await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ body: editingText }),
    });
    setEditingNoteId(null);
    await refreshNotes();
  }

  async function deleteNoteFn(noteId: string) {
    await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    await refreshNotes();
  }

  function TreeRows({ nodes, depth }: { nodes: TreeNode[]; depth: number }) {
    return (
      <>
        {nodes
          .filter((n) => showHidden || !n.archived)
          .map((n) => {
            const self = effectiveTier(n, "selfTier");
            const assessed = effectiveTier(n, "assessedTier");
            const gap =
              self != null && assessed != null ? self - assessed : null;
            const isSel = n.id === selectedId;
            const isFocus = n.id === focusId;
            const hasKids = n.children.some(
              (c) => showHidden || !c.archived,
            );
            const open = !collapsed.has(n.id);
            return (
              <div key={n.id}>
                <div
                  className={`flex items-center rounded ${
                    isSel
                      ? "bg-slate-200 dark:bg-slate-700"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800"
                  } ${isFocus ? "ring-1 ring-teal-400/60" : ""} ${
                    n.archived ? "opacity-50" : ""
                  }`}
                  style={{ paddingLeft: 4 + depth * 12 }}
                >
                  {hasKids ? (
                    <button
                      onClick={() => toggleCollapse(n.id)}
                      aria-label={open ? "collapse" : "expand"}
                      className="flex h-6 w-4 shrink-0 items-center justify-center text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      {open ? "▾" : "▸"}
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <button
                    onClick={() => selectNode(n.id)}
                    title={
                      n.description ? `${n.title}\n\n${n.description}` : n.title
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-2 text-left text-sm"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: gapColor(gap) }}
                    />
                    <span
                      className={`flex-1 truncate ${
                        n.archived ? "line-through" : ""
                      }`}
                    >
                      {n.title}
                    </span>
                    {hasKids && (
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {n.children.filter((c) => showHidden || !c.archived)
                          .length}
                      </span>
                    )}
                    {assessed != null && (
                      <span className="shrink-0 text-xs text-slate-500">
                        {assessed % 1 === 0 ? assessed : assessed.toFixed(1)}
                      </span>
                    )}
                  </button>
                </div>
                {hasKids && open && TreeRows({ nodes: n.children, depth: depth + 1 })}
              </div>
            );
          })}
      </>
    );
  }

  function QuestionPanel({ type }: { type: "mcq" | "conversational" }) {
    const list = type === "mcq" ? mcqs : convs;
    if (!selected)
      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          Select a node.
        </div>
      );
    const answeredMcq =
      type === "mcq" ? list.filter((q) => answers[q.id]?.choice != null) : [];
    const correctCount = answeredMcq.filter(
      (q) => answers[q.id]?.choice === q.answerIndex,
    ).length;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{selected.title}</span>
          <button
            onClick={() => genQuestions(type)}
            disabled={qGenLoading}
            className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950"
          >
            {qGenLoading ? "Generating…" : "✦ Generate (AI)"}
          </button>
          <input
            value={qSteer}
            onChange={(e) => setQSteer(e.target.value)}
            placeholder="steer (optional)…"
            className="min-w-[8rem] flex-1 rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
          />
          <button
            onClick={autoAssess}
            disabled={assessing}
            title="Grade all answers on this node and set the expert assessment"
            className="rounded border border-teal-300 px-2 py-1 text-xs text-teal-700 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-950"
          >
            {assessing ? "Assessing…" : "✓ Auto-assess"}
          </button>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={showAnswers}
              onChange={(e) => setShowAnswers(e.target.checked)}
            />
            show answers
          </label>
          {showAnswers && type === "mcq" && answeredMcq.length > 0 && (
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {correctCount}/{answeredMcq.length} correct
            </span>
          )}
        </div>
        {assessResult && (
          <p className="mb-2 text-xs text-teal-700 dark:text-teal-300">
            {assessResult}
          </p>
        )}
        {qGenErr && (
          <p className="mb-2 text-xs text-red-500">
            {/api|key|auth/i.test(qGenErr)
              ? "No Anthropic API key configured — set ANTHROPIC_API_KEY."
              : qGenErr}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-auto">
          {list.length === 0 ? (
            <p className="text-sm text-slate-400">
              No {type === "mcq" ? "multiple-choice" : "conversational"}{" "}
              questions yet — generate some.
            </p>
          ) : (
            <ol className="space-y-3">
              {list.map((q, i) => {
                const ans = answers[q.id];
                return (
                  <li
                    key={q.id}
                    className="rounded border border-slate-200 p-3 dark:border-slate-700"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-slate-400">{i + 1}.</span>
                      <div className="flex-1 text-sm">{q.prompt}</div>
                      <button
                        onClick={() => deleteQuestionFn(q.id)}
                        className="text-xs text-slate-300 hover:text-red-600"
                        title="delete question"
                      >
                        ✕
                      </button>
                    </div>

                    {type === "mcq" && q.options && (
                      <ul className="mt-2 space-y-1">
                        {q.options.map((opt, oi) => {
                          const chosen = ans?.choice === oi;
                          const correct = q.answerIndex === oi;
                          let cls =
                            "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800";
                          if (showAnswers && correct)
                            cls =
                              "border-green-300 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300";
                          else if (showAnswers && chosen && !correct)
                            cls =
                              "border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300";
                          else if (chosen)
                            cls =
                              "border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950";
                          return (
                            <li key={oi}>
                              <button
                                onClick={() => setAnswer(q.id, { choice: oi })}
                                className={`flex w-full items-center gap-2 rounded border px-2 py-1 text-left text-sm ${cls}`}
                              >
                                <span className="text-xs text-slate-400">
                                  {String.fromCharCode(65 + oi)}.
                                </span>
                                <span className="flex-1">{opt}</span>
                                {showAnswers && correct && (
                                  <span className="text-xs">✓</span>
                                )}
                                {showAnswers && chosen && !correct && (
                                  <span className="text-xs">✗ chosen</span>
                                )}
                                {!showAnswers && chosen && (
                                  <span className="text-xs text-indigo-500">
                                    ●
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {type === "conversational" && (
                      <textarea
                        defaultValue={ans?.text ?? ""}
                        onBlur={(e) => setAnswer(q.id, { text: e.target.value })}
                        rows={3}
                        placeholder="respondent's answer…"
                        className="mt-2 w-full rounded border border-slate-300 bg-transparent p-2 text-sm dark:border-slate-600"
                      />
                    )}

                    {type === "conversational" && ans?.feedback && (
                      <div className="mt-2 rounded border-l-2 border-teal-400 bg-teal-50 p-2 text-xs text-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
                        <span className="font-medium">
                          Feedback
                          {ans.score != null ? ` · ${ans.score}/100` : ""}:{" "}
                        </span>
                        {ans.feedback}
                      </div>
                    )}

                    {showAnswers && q.answerGuide && (
                      <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        <span className="font-medium">
                          {type === "mcq" ? "Why: " : "Look for: "}
                        </span>
                        {q.answerGuide}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-2 text-sm dark:border-slate-800">
        <Link href="/" className="text-slate-400 hover:text-slate-600">
          ← KATK
        </Link>
        <span className="font-semibold">{data.subject.name}</span>
        <span className="text-slate-400">·</span>
        <span>{data.taxonomy.title}</span>
        <label className="ml-auto flex items-center gap-1 text-xs text-slate-400">
          category
          <input
            list="katk-cats"
            value={catValue}
            onChange={(e) => setCatValue(e.target.value)}
            onBlur={saveCategory}
            placeholder="e.g. Interview"
            className="w-32 rounded border border-slate-300 bg-transparent px-2 py-0.5 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-200"
          />
          <datalist id="katk-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </header>

      <PanelGroup
        direction="horizontal"
        autoSaveId="katk-panes"
        className="flex min-h-0 flex-1"
      >
        {/* left — tree */}
        <Panel defaultSize={20} minSize={12}>
          <aside className="h-full overflow-auto border-r border-slate-200 p-2 dark:border-slate-800">
          <div className="sticky top-0 z-10 mb-1 flex items-center justify-between bg-white px-1 py-1 dark:bg-slate-950">
            <span className="text-xs font-medium text-slate-400">Tree</span>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <button
                onClick={addRoot}
                className="hover:text-slate-800 dark:hover:text-slate-200"
              >
                + root
              </button>
              <button
                onClick={() => setShowHidden((v) => !v)}
                title={
                  showHidden ? "hiding archived: on" : "show archived nodes"
                }
                className={
                  showHidden
                    ? "text-teal-600"
                    : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }
              >
                <EyeIcon open={showHidden} />
              </button>
              <button
                onClick={() =>
                  setCollapsed(allCollapsed ? new Set() : new Set(allParentIds))
                }
                className="hover:text-slate-800 dark:hover:text-slate-200"
              >
                {allCollapsed ? "Expand all" : "Collapse all"}
              </button>
            </div>
          </div>
          {roots.length === 0 ? (
            <p className="px-1 text-xs text-slate-400">
              Empty taxonomy — add a root node.
            </p>
          ) : (
            TreeRows({ nodes: roots, depth: 0 })
          )}
          </aside>
        </Panel>

        <PanelResizeHandle className="w-1 bg-slate-200 transition-colors hover:bg-teal-400 dark:bg-slate-800" />

        {/* center — tabs */}
        <Panel defaultSize={54} minSize={30}>
          <main className="flex h-full min-w-0 flex-col p-4">
          <div className="mb-3 flex gap-4 border-b border-slate-200 text-sm dark:border-slate-800">
            {(
              [
                ["radar", "Radar"],
                ["mcq", `Multiple-choice${mcqs.length ? ` (${mcqs.length})` : ""}`],
                [
                  "conversational",
                  `Conversational${convs.length ? ` (${convs.length})` : ""}`,
                ],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setCenterTab(k)}
                className={`-mb-px border-b-2 pb-2 ${
                  centerTab === k
                    ? "border-slate-800 font-medium dark:border-slate-200"
                    : "border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {centerTab === "radar" ? (
              <>
                <div className="mb-2 flex items-center gap-1 overflow-hidden whitespace-nowrap text-sm text-slate-500">
                  <button
                    onClick={() => setFocusId(null)}
                    className="shrink-0 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    {data.taxonomy.title}
                  </button>
                  {crumbs.length > 0 &&
                    (crumbs.length <= 2 ? (
                      crumbs.map((c) => (
                        <span
                          key={c.id}
                          className="flex min-w-0 items-center gap-1"
                        >
                          <span className="shrink-0">›</span>
                          <button
                            onClick={() => setFocusId(c.id)}
                            className="max-w-[12rem] truncate hover:text-slate-800 dark:hover:text-slate-200"
                          >
                            {c.title}
                          </button>
                        </span>
                      ))
                    ) : (
                      <>
                        <span className="shrink-0">›</span>
                        <div className="relative shrink-0">
                          <button
                            onClick={() => setCrumbMenu((v) => !v)}
                            className="rounded px-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            …
                          </button>
                          {crumbMenu && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setCrumbMenu(false)}
                              />
                              <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-60 overflow-auto rounded border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                {crumbs.slice(0, -1).map((c, i) => (
                                  <button
                                    key={c.id}
                                    onClick={() => {
                                      setFocusId(c.id);
                                      setCrumbMenu(false);
                                    }}
                                    className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                                    style={{ paddingLeft: 8 + i * 10 }}
                                  >
                                    {c.title}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                        <span className="shrink-0">›</span>
                        <button
                          onClick={() =>
                            setFocusId(crumbs[crumbs.length - 1].id)
                          }
                          className="max-w-[16rem] truncate hover:text-slate-800 dark:hover:text-slate-200"
                        >
                          {crumbs[crumbs.length - 1].title}
                        </button>
                      </>
                    ))}
                </div>
                <div className="min-h-0 flex-1">
                  {radarData.length >= 3 ? (
                    <GapRadar
                      key={focusId ?? "root"}
                      data={radarData}
                      tierMax={tierMax}
                      onSelect={selectNode}
                      onDrill={drill}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-center text-sm text-slate-400">
                      Needs at least 3 sub-areas to draw a radar — break this node
                      down or add children.
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-0 w-4 border-t-2 border-dashed"
                      style={{ borderColor: SELF }}
                    />
                    self-claim
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-0 w-4 border-t-2"
                      style={{ borderColor: ASSESSED }}
                    />
                    expert assessment
                  </span>
                  <span>· click a spoke to drill in</span>
                </div>
              </>
            ) : centerTab === "mcq" ? (
              QuestionPanel({ type: "mcq" })
            ) : (
              QuestionPanel({ type: "conversational" })
            )}
          </div>
          </main>
        </Panel>

        <PanelResizeHandle className="w-1 bg-slate-200 transition-colors hover:bg-teal-400 dark:bg-slate-800" />

        {/* right — node card */}
        <Panel defaultSize={26} minSize={16}>
          <aside className="h-full overflow-auto border-l border-slate-200 p-4 dark:border-slate-800">
          {!selected ? (
            <p className="text-sm text-slate-400">Select a node.</p>
          ) : (
            <div className="space-y-4">
              <div>
                {renaming ? (
                  <div className="flex gap-1">
                    <input
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveRename()}
                      autoFocus
                      className="flex-1 rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
                    />
                    <button
                      onClick={saveRename}
                      className="rounded bg-slate-800 px-2 text-xs text-white dark:bg-slate-200 dark:text-slate-900"
                    >
                      save
                    </button>
                    <button
                      onClick={() => setRenaming(false)}
                      className="text-xs text-slate-400"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{selected.title}</h2>
                    {selected.archived && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">
                        hidden
                      </span>
                    )}
                    {selected.source === "ai" && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        AI
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setRenaming(true);
                        setRenameText(selected.title);
                      }}
                      className="ml-auto text-xs text-slate-400 hover:text-slate-600"
                    >
                      rename
                    </button>
                  </div>
                )}
                {editingDesc ? (
                  <div className="mt-1 space-y-1">
                    <textarea
                      value={descText}
                      onChange={(e) => setDescText(e.target.value)}
                      rows={2}
                      autoFocus
                      placeholder="describe this node…"
                      className="w-full rounded border border-slate-300 bg-transparent p-2 text-sm dark:border-slate-600"
                    />
                    <div className="flex gap-2 text-xs">
                      <button
                        onClick={saveDesc}
                        className="rounded bg-slate-800 px-2 py-0.5 text-white dark:bg-slate-200 dark:text-slate-900"
                      >
                        save
                      </button>
                      <button
                        onClick={() => setEditingDesc(false)}
                        className="text-slate-400"
                      >
                        cancel
                      </button>
                    </div>
                  </div>
                ) : selected.description ? (
                  <p
                    onClick={() => {
                      setEditingDesc(true);
                      setDescText(selected.description);
                    }}
                    title="click to edit"
                    className="mt-1 cursor-text text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    {selected.description}
                  </p>
                ) : (
                  <button
                    onClick={() => {
                      setEditingDesc(true);
                      setDescText("");
                    }}
                    className="mt-1 text-xs text-slate-400 hover:text-slate-600"
                  >
                    + add description
                  </button>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500">
                  Self assessment
                </label>
                <div className="mt-1">
                  <TierPicker
                    tiers={tiers}
                    value={selected.rating?.selfTier ?? null}
                    onChange={(v) => setTier(selected.id, "selfTier", v)}
                    accent={SELF}
                  />
                </div>
              </div>

              <div>
                <button
                  onClick={() => setCapturing((c) => !c)}
                  className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  {capturing ? "− cancel" : "+ capture answer"}
                </button>
                {capturing && (
                  <div className="mt-1 space-y-1">
                    <textarea
                      value={captureText}
                      onChange={(e) => setCaptureText(e.target.value)}
                      rows={3}
                      placeholder="What they said…"
                      className="w-full rounded border border-slate-300 bg-transparent p-2 text-sm dark:border-slate-600"
                    />
                    <button
                      onClick={capture}
                      className="rounded bg-slate-800 px-2 py-1 text-xs text-white dark:bg-slate-200 dark:text-slate-900"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500">
                  Expert assessment
                </label>
                <div className="mt-1">
                  <TierPicker
                    tiers={tiers}
                    value={selected.rating?.assessedTier ?? null}
                    onChange={(v) => setTier(selected.id, "assessedTier", v)}
                    accent={ASSESSED}
                  />
                </div>
              </div>

              <div className="rounded border border-slate-200 p-2 text-sm dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Gap</span>
                  <span
                    className="font-medium"
                    style={{ color: gapColor(selectedGap) }}
                  >
                    {selectedGap == null
                      ? "—"
                      : selectedGap === 0
                        ? "matched"
                        : selectedGap > 0
                          ? `+${selectedGap.toFixed(selectedGap % 1 ? 1 : 0)} overstated`
                          : `${selectedGap.toFixed(selectedGap % 1 ? 1 : 0)} understated`}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  self {tierLabel(tiers, selected.rating?.selfTier)} · assessed{" "}
                  {tierLabel(tiers, selected.rating?.assessedTier)}
                </div>
              </div>

              {/* notes */}
              <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                <div className="mb-1 text-xs font-medium text-slate-500">
                  Notes
                </div>
                <ul className="space-y-1">
                  {notes.map((n) =>
                    editingNoteId === n.id ? (
                      <li key={n.id} className="space-y-1">
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          rows={2}
                          className="w-full rounded border border-slate-300 bg-transparent p-2 text-xs dark:border-slate-600"
                        />
                        <div className="flex gap-2 text-[10px] text-slate-400">
                          <button
                            onClick={() => saveNoteEdit(n.id)}
                            className="hover:text-slate-700 dark:hover:text-slate-200"
                          >
                            save
                          </button>
                          <button onClick={() => setEditingNoteId(null)}>
                            cancel
                          </button>
                        </div>
                      </li>
                    ) : (
                      <li
                        key={n.id}
                        className="rounded bg-slate-50 p-2 text-xs dark:bg-slate-900"
                      >
                        <div className="whitespace-pre-wrap">{n.body}</div>
                        <div className="mt-1 flex gap-2 text-[10px] text-slate-400">
                          <button
                            onClick={() => {
                              setEditingNoteId(n.id);
                              setEditingText(n.body);
                            }}
                            className="hover:text-slate-700 dark:hover:text-slate-200"
                          >
                            edit
                          </button>
                          <button
                            onClick={() => deleteNoteFn(n.id)}
                            className="hover:text-red-600"
                          >
                            delete
                          </button>
                        </div>
                      </li>
                    ),
                  )}
                </ul>
                {addingNote ? (
                  <div className="mt-1 space-y-1">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      rows={2}
                      autoFocus
                      placeholder="new note…"
                      className="w-full rounded border border-slate-300 bg-transparent p-2 text-xs dark:border-slate-600"
                    />
                    <div className="flex gap-2 text-xs">
                      <button
                        onClick={addNoteFn}
                        className="rounded bg-slate-800 px-2 py-0.5 text-white dark:bg-slate-200 dark:text-slate-900"
                      >
                        save
                      </button>
                      <button
                        onClick={() => {
                          setAddingNote(false);
                          setNoteText("");
                        }}
                        className="text-slate-400"
                      >
                        cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingNote(true)}
                    className="mt-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    + add note
                  </button>
                )}
              </div>

              {/* grow the tree */}
              <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                <button
                  onClick={breakDown}
                  disabled={decomposing}
                  className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950"
                >
                  {decomposing ? "Thinking…" : "✦ Break this down (AI)"}
                </button>
                <input
                  value={steerText}
                  onChange={(e) => setSteerText(e.target.value)}
                  placeholder="steer the suggestions (optional)…"
                  className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                />
                {decErr && (
                  <p className="text-xs text-red-500">
                    {/api|key|auth/i.test(decErr)
                      ? "No Anthropic API key configured. Add children manually below."
                      : decErr}
                  </p>
                )}
                {proposals && proposals.length > 0 && (
                  <ul className="space-y-1">
                    {proposals.map((p, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 rounded border border-slate-200 p-1.5 text-xs dark:border-slate-700"
                      >
                        <div className="flex-1">
                          <div className="font-medium">{p.title}</div>
                          <div className="text-slate-400">{p.description}</div>
                        </div>
                        <button
                          onClick={() => {
                            addChild(p.title, "ai", p.description);
                            setProposals(
                              (ps) => ps?.filter((_, j) => j !== i) ?? null,
                            );
                          }}
                          className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-white"
                        >
                          add
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                <div className="space-y-1">
                  <input
                    value={newChild}
                    onChange={(e) => setNewChild(e.target.value)}
                    placeholder="add a child…"
                    className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                  <input
                    value={newChildDesc}
                    onChange={(e) => setNewChildDesc(e.target.value)}
                    placeholder="description (optional)…"
                    className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                  <button
                    onClick={() => {
                      addChild(newChild, "manual", newChildDesc || undefined);
                      setNewChild("");
                      setNewChildDesc("");
                    }}
                    className="rounded bg-slate-800 px-2 py-1 text-xs text-white dark:bg-slate-200 dark:text-slate-900"
                  >
                    + add child
                  </button>
                </div>
              </div>

              {/* structural actions */}
              <div className="space-y-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
                <label className="flex items-center gap-1 text-slate-500">
                  move to
                  <select
                    value={selected.parentId ?? ""}
                    onChange={(e) => moveNodeTo(e.target.value || null)}
                    className="min-w-0 flex-1 rounded border border-slate-300 bg-transparent px-1 py-0.5 dark:border-slate-600"
                  >
                    <option value="">— root —</option>
                    {flattenForMove(roots, selected.id).map((o) => (
                      <option key={o.id} value={o.id}>
                        {" ".repeat(o.depth * 2)}
                        {o.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex justify-end gap-4">
                  {selected.archived ? (
                    <button
                      onClick={unhideNode}
                      className="text-teal-600 hover:text-teal-700"
                    >
                      unhide
                    </button>
                  ) : (
                    <button
                      onClick={hideNode}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      hide
                    </button>
                  )}
                  <button
                    onClick={deleteNode}
                    className="text-slate-400 hover:text-red-600"
                  >
                    delete
                  </button>
                </div>
              </div>

              {messages.length > 0 && (
                <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                  <div className="mb-1 text-xs font-medium text-slate-500">
                    Captured ({messages.length})
                  </div>
                  <ul className="space-y-1">
                    {messages.map((m) => (
                      <li
                        key={m.id}
                        className="rounded bg-slate-50 p-2 text-xs dark:bg-slate-900"
                      >
                        <span className="text-slate-400">{m.role}: </span>
                        {m.content}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          </aside>
        </Panel>
      </PanelGroup>
    </div>
  );
}
