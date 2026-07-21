"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { SessionBundle, TreeNode } from "@/lib/types";
import { effectiveTier, findNode, pathTo } from "@/lib/tree";
import { tierLabel, type Tier } from "@/lib/tiers";

// Read-only mirror of the session workspace: browse the tree, read the gap
// radar, and review the multiple-choice / conversational banks with results.
// No mutations, no fetches — everything is preloaded in `bundle`.

const GapRadar = dynamic(() => import("@/components/GapRadar"), { ssr: false });

const SELF = "#6366f1";
const ASSESSED = "#0d9488";

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

function TierReadout({
  tiers,
  value,
  accent,
}: {
  tiers: Tier[];
  value: number | null;
  accent: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tiers.map((t) => {
        const active = value === t.n;
        return (
          <span
            key={t.n}
            title={`${t.label} · ~${t.years} yr · ${t.hours} h`}
            className={`flex h-7 w-7 items-center justify-center rounded border text-xs font-medium ${
              active
                ? "border-transparent text-white"
                : "border-slate-200 text-slate-400 dark:border-slate-700"
            }`}
            style={active ? { background: accent } : undefined}
          >
            {t.n}
          </span>
        );
      })}
    </div>
  );
}

export default function SharedSessionViewer({
  bundle,
}: {
  bundle: SessionBundle;
}) {
  const roots = bundle.tree;
  const tiers = bundle.taxonomy.tierScale;
  const tierMax = tiers.reduce((m, t) => Math.max(m, t.n), 0);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    roots[0]?.id ?? null,
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(collectParentIds(roots)),
  );
  const [centerTab, setCenterTab] = useState<"radar" | "mcq" | "conversational">(
    "radar",
  );
  const [showAnswers, setShowAnswers] = useState(true);
  const [crumbMenu, setCrumbMenu] = useState(false);

  const questionsByNode = useMemo(() => {
    const m = new Map<string, SessionBundle["questions"]>();
    for (const q of bundle.questions) {
      const arr = m.get(q.nodeId);
      if (arr) arr.push(q);
      else m.set(q.nodeId, [q]);
    }
    return m;
  }, [bundle.questions]);
  const answerByQuestion = useMemo(
    () => new Map(bundle.answers.map((a) => [a.questionId, a])),
    [bundle.answers],
  );
  const notesByNode = useMemo(() => {
    const m = new Map<string, SessionBundle["notes"]>();
    for (const n of bundle.notes) {
      if (!n.nodeId) continue;
      const arr = m.get(n.nodeId);
      if (arr) arr.push(n);
      else m.set(n.nodeId, [n]);
    }
    return m;
  }, [bundle.notes]);
  const messagesByNode = useMemo(() => {
    const m = new Map<string, SessionBundle["messages"]>();
    for (const msg of bundle.messages) {
      if (!msg.nodeId) continue;
      const arr = m.get(msg.nodeId);
      if (arr) arr.push(msg);
      else m.set(msg.nodeId, [msg]);
    }
    return m;
  }, [bundle.messages]);

  const focusNode = focusId ? findNode(roots, focusId) : null;
  const spokes = (focusNode ? focusNode.children : roots).filter(
    (n) => !n.archived,
  );
  const selected = selectedId ? findNode(roots, selectedId) : null;
  const crumbs = focusId ? (pathTo(roots, focusId) ?? []) : [];

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

  function TreeRows({ nodes, depth }: { nodes: TreeNode[]; depth: number }) {
    return (
      <>
        {nodes
          .filter((n) => !n.archived)
          .map((n) => {
            const self = effectiveTier(n, "selfTier");
            const assessed = effectiveTier(n, "assessedTier");
            const gap = self != null && assessed != null ? self - assessed : null;
            const isSel = n.id === selectedId;
            const isFocus = n.id === focusId;
            const hasKids = n.children.some((c) => !c.archived);
            const open = !collapsed.has(n.id);
            return (
              <div key={n.id}>
                <div
                  className={`flex items-center rounded ${
                    isSel
                      ? "bg-slate-200 dark:bg-slate-700"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800"
                  } ${isFocus ? "ring-1 ring-teal-400/60" : ""}`}
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
                    title={n.description ? `${n.title}\n\n${n.description}` : n.title}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-2 text-left text-sm"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: gapColor(gap) }}
                    />
                    <span className="flex-1 truncate">{n.title}</span>
                    {hasKids && (
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {n.children.filter((c) => !c.archived).length}
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
    if (!selected)
      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          Select a node.
        </div>
      );
    const list = (questionsByNode.get(selected.id) ?? []).filter(
      (q) => q.type === type,
    );
    const answeredMcq =
      type === "mcq"
        ? list.filter((q) => answerByQuestion.get(q.id)?.choice != null)
        : [];
    const correctCount = answeredMcq.filter(
      (q) => answerByQuestion.get(q.id)?.choice === q.answerIndex,
    ).length;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{selected.title}</span>
          <label className="ml-auto flex items-center gap-1 text-xs text-slate-500">
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
        <div className="min-h-0 flex-1 overflow-auto">
          {list.length === 0 ? (
            <p className="text-sm text-slate-400">
              No {type === "mcq" ? "multiple-choice" : "conversational"}{" "}
              questions on this node.
            </p>
          ) : (
            <ol className="space-y-3">
              {list.map((q, i) => {
                const ans = answerByQuestion.get(q.id);
                return (
                  <li
                    key={q.id}
                    className="rounded border border-slate-200 p-3 dark:border-slate-700"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-slate-400">{i + 1}.</span>
                      <div className="flex-1 text-sm">{q.prompt}</div>
                    </div>

                    {type === "mcq" && q.options && (
                      <ul className="mt-2 space-y-1">
                        {q.options.map((opt, oi) => {
                          const chosen = ans?.choice === oi;
                          const correct = q.answerIndex === oi;
                          let cls =
                            "border-slate-200 dark:border-slate-700";
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
                            <li
                              key={oi}
                              className={`flex w-full items-center gap-2 rounded border px-2 py-1 text-sm ${cls}`}
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
                                <span className="text-xs text-indigo-500">●</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {type === "conversational" && (
                      <div className="mt-2 whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                        {ans?.text ? (
                          ans.text
                        ) : (
                          <span className="text-slate-400">
                            (no answer recorded)
                          </span>
                        )}
                      </div>
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

  const selNotes = selected ? (notesByNode.get(selected.id) ?? []) : [];
  const selMsgs = selected ? (messagesByNode.get(selected.id) ?? []) : [];

  return (
    <div className="flex h-screen flex-col bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-2 text-sm dark:border-slate-800">
        <span className="font-semibold">KATK</span>
        <span className="text-slate-400">·</span>
        <span className="font-medium">{bundle.subject.name}</span>
        <span className="text-slate-400">·</span>
        <span>{bundle.taxonomy.title}</span>
        {bundle.session.mode && (
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {bundle.session.mode}
          </span>
        )}
        <span className="ml-auto rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-600">
          Read-only shared view
        </span>
      </header>

      <PanelGroup
        direction="horizontal"
        autoSaveId="katk-share-panes"
        className="flex min-h-0 flex-1"
      >
        {/* left — tree */}
        <Panel defaultSize={20} minSize={12}>
          <aside className="h-full overflow-auto border-r border-slate-200 p-2 dark:border-slate-800">
            <div className="sticky top-0 z-10 mb-1 bg-white px-1 py-1 text-xs font-medium text-slate-400 dark:bg-slate-950">
              Tree
            </div>
            {roots.length === 0 ? (
              <p className="px-1 text-xs text-slate-400">Empty taxonomy.</p>
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
                  ["mcq", "Multiple-choice"],
                  ["conversational", "Conversational"],
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
                      {bundle.taxonomy.title}
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
                            onClick={() => setFocusId(crumbs[crumbs.length - 1].id)}
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
                        Needs at least 3 sub-areas to draw a radar.
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

        {/* right — read-only results */}
        <Panel defaultSize={26} minSize={16}>
          <aside className="h-full overflow-auto border-l border-slate-200 p-4 dark:border-slate-800">
            {!selected ? (
              <p className="text-sm text-slate-400">Select a node.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{selected.title}</h2>
                    {selected.source === "ai" && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        AI
                      </span>
                    )}
                  </div>
                  {selected.description && (
                    <p className="mt-1 text-sm text-slate-500">
                      {selected.description}
                    </p>
                  )}
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Self assessment
                  </div>
                  <div className="mt-1">
                    <TierReadout
                      tiers={tiers}
                      value={selected.rating?.selfTier ?? null}
                      accent={SELF}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Expert assessment
                  </div>
                  <div className="mt-1">
                    <TierReadout
                      tiers={tiers}
                      value={selected.rating?.assessedTier ?? null}
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

                {selNotes.length > 0 && (
                  <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                    <div className="mb-1 text-xs font-medium text-slate-500">
                      Notes
                    </div>
                    <ul className="space-y-1">
                      {selNotes.map((n) => (
                        <li
                          key={n.id}
                          className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs dark:bg-slate-900"
                        >
                          {n.body}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selMsgs.length > 0 && (
                  <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                    <div className="mb-1 text-xs font-medium text-slate-500">
                      Captured ({selMsgs.length})
                    </div>
                    <ul className="space-y-1">
                      {selMsgs.map((m) => (
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
