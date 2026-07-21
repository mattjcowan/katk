import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { id } from "@/lib/ids";
import { buildTree, slugify } from "@/lib/tree";
import type { SessionData } from "@/lib/types";
import { DEFAULT_TIERS, type Tier } from "@/lib/tiers";

export function listTaxonomies(includeArchived = false) {
  const rows = db
    .select({
      id: schema.taxonomies.id,
      title: schema.taxonomies.title,
      description: schema.taxonomies.description,
      archived: schema.taxonomies.archived,
    })
    .from(schema.taxonomies)
    .orderBy(asc(schema.taxonomies.title))
    .all();
  return includeArchived ? rows : rows.filter((t) => !t.archived);
}

export function createTaxonomy(title: string, description?: string): string {
  const tid = id("tax");
  db.insert(schema.taxonomies)
    .values({
      id: tid,
      title,
      description: description ?? "",
      tierScale: DEFAULT_TIERS,
    })
    .run();
  return tid;
}

export function setTaxonomyArchived(taxonomyId: string, archived: boolean) {
  db.update(schema.taxonomies)
    .set({ archived })
    .where(eq(schema.taxonomies.id, taxonomyId))
    .run();
}

export function renameTaxonomy(taxonomyId: string, title: string) {
  db.update(schema.taxonomies)
    .set({ title })
    .where(eq(schema.taxonomies.id, taxonomyId))
    .run();
}

export function deleteTaxonomy(taxonomyId: string) {
  const sess = db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(eq(schema.sessions.taxonomyId, taxonomyId))
    .all();
  for (const s of sess) deleteSession(s.id);
  const nodeRows = db
    .select({ id: schema.nodes.id })
    .from(schema.nodes)
    .where(eq(schema.nodes.taxonomyId, taxonomyId))
    .all();
  if (nodeRows.length) {
    const qids = db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(
        inArray(
          schema.questions.nodeId,
          nodeRows.map((n) => n.id),
        ),
      )
      .all()
      .map((q) => q.id);
    if (qids.length)
      db.delete(schema.answers)
        .where(inArray(schema.answers.questionId, qids))
        .run();
    db.delete(schema.questions)
      .where(
        inArray(
          schema.questions.nodeId,
          nodeRows.map((n) => n.id),
        ),
      )
      .run();
  }
  db.delete(schema.nodes)
    .where(eq(schema.nodes.taxonomyId, taxonomyId))
    .run();
  db.delete(schema.taxonomies)
    .where(eq(schema.taxonomies.id, taxonomyId))
    .run();
}

export function listSubjects() {
  return db
    .select()
    .from(schema.subjects)
    .orderBy(asc(schema.subjects.name))
    .all();
}

export function createSubject(name: string, email?: string | null): string {
  const sid = id("sub");
  db.insert(schema.subjects)
    .values({ id: sid, name, email: email ?? null })
    .run();
  return sid;
}

export function deleteSubject(subjectId: string) {
  const sess = db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(eq(schema.sessions.subjectId, subjectId))
    .all();
  for (const s of sess) deleteSession(s.id);
  db.delete(schema.subjects)
    .where(eq(schema.subjects.id, subjectId))
    .run();
}

export function listSessions() {
  return db
    .select({
      id: schema.sessions.id,
      mode: schema.sessions.mode,
      status: schema.sessions.status,
      createdAt: schema.sessions.createdAt,
      updatedAt: schema.sessions.updatedAt,
      subjectId: schema.sessions.subjectId,
      taxonomyId: schema.sessions.taxonomyId,
      subjectName: schema.subjects.name,
      taxonomyTitle: schema.taxonomies.title,
    })
    .from(schema.sessions)
    .innerJoin(schema.subjects, eq(schema.sessions.subjectId, schema.subjects.id))
    .innerJoin(
      schema.taxonomies,
      eq(schema.sessions.taxonomyId, schema.taxonomies.id),
    )
    .orderBy(desc(schema.sessions.updatedAt))
    .all();
}

export function createSession(
  subjectId: string,
  taxonomyId: string,
  mode = "interview",
): string {
  const sid = id("ses");
  db.insert(schema.sessions)
    .values({ id: sid, subjectId, taxonomyId, mode })
    .run();
  return sid;
}

export function getSessionData(sessionId: string): SessionData | null {
  const session = db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .get();
  if (!session) return null;

  const subject = db
    .select()
    .from(schema.subjects)
    .where(eq(schema.subjects.id, session.subjectId))
    .get();
  const taxonomy = db
    .select()
    .from(schema.taxonomies)
    .where(eq(schema.taxonomies.id, session.taxonomyId))
    .get();
  if (!subject || !taxonomy) return null;

  const nodes = db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.taxonomyId, session.taxonomyId))
    .all();

  const ratings = db
    .select()
    .from(schema.ratings)
    .where(eq(schema.ratings.sessionId, sessionId))
    .all();

  const tree = buildTree(
    nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      title: n.title,
      slug: n.slug,
      description: n.description,
      source: n.source,
      orderIndex: n.orderIndex,
      archived: n.archived,
    })),
    ratings.map((r) => ({
      nodeId: r.nodeId,
      selfTier: r.selfTier,
      assessedTier: r.assessedTier,
      note: r.note,
    })),
  );

  return {
    session: {
      id: session.id,
      mode: session.mode,
      status: session.status,
    },
    subject: { id: subject.id, name: subject.name, email: subject.email },
    taxonomy: {
      id: taxonomy.id,
      title: taxonomy.title,
      tierScale: (taxonomy.tierScale as Tier[]) ?? DEFAULT_TIERS,
    },
    tree,
  };
}

export function upsertRating(
  sessionId: string,
  nodeId: string,
  patch: {
    selfTier?: number | null;
    assessedTier?: number | null;
    note?: string | null;
    rationale?: string | null;
  },
) {
  const existing = db
    .select()
    .from(schema.ratings)
    .where(
      and(
        eq(schema.ratings.sessionId, sessionId),
        eq(schema.ratings.nodeId, nodeId),
      ),
    )
    .get();

  if (existing) {
    db.update(schema.ratings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.ratings.id, existing.id))
      .run();
  } else {
    db.insert(schema.ratings)
      .values({
        id: id("rat"),
        sessionId,
        nodeId,
        selfTier: patch.selfTier ?? null,
        assessedTier: patch.assessedTier ?? null,
        note: patch.note ?? null,
        rationale: patch.rationale ?? null,
      })
      .run();
  }
  db.update(schema.sessions)
    .set({ updatedAt: new Date() })
    .where(eq(schema.sessions.id, sessionId))
    .run();
}

export function addNode(input: {
  taxonomyId: string;
  parentId: string | null;
  title: string;
  description?: string;
  source?: string;
  sessionId?: string | null;
}) {
  const nid = id("n");
  const siblings = db
    .select({ orderIndex: schema.nodes.orderIndex })
    .from(schema.nodes)
    .where(
      input.parentId
        ? eq(schema.nodes.parentId, input.parentId)
        : eq(schema.nodes.taxonomyId, input.taxonomyId),
    )
    .all();
  const nextOrder =
    siblings.reduce((m, s) => Math.max(m, s.orderIndex), -1) + 1;

  db.insert(schema.nodes)
    .values({
      id: nid,
      taxonomyId: input.taxonomyId,
      parentId: input.parentId,
      slug: slugify(input.title),
      title: input.title,
      description: input.description ?? "",
      orderIndex: nextOrder,
      source: input.source ?? "manual",
      createdInSession: input.sessionId ?? null,
    })
    .run();
  return nid;
}

export function renameNode(nodeId: string, title: string) {
  db.update(schema.nodes)
    .set({ title, updatedAt: new Date() })
    .where(eq(schema.nodes.id, nodeId))
    .run();
}

export function updateNodeDescription(nodeId: string, description: string) {
  db.update(schema.nodes)
    .set({ description, updatedAt: new Date() })
    .where(eq(schema.nodes.id, nodeId))
    .run();
}

export function softDeleteNode(nodeId: string) {
  db.update(schema.nodes)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(schema.nodes.id, nodeId))
    .run();
}

export function addMessage(
  sessionId: string,
  nodeId: string | null,
  role: string,
  content: string,
) {
  const mid = id("msg");
  db.insert(schema.messages)
    .values({ id: mid, sessionId, nodeId, role, content })
    .run();
  return mid;
}

export function listMessages(sessionId: string, nodeId?: string | null) {
  const where = nodeId
    ? and(
        eq(schema.messages.sessionId, sessionId),
        eq(schema.messages.nodeId, nodeId),
      )
    : eq(schema.messages.sessionId, sessionId);
  return db
    .select()
    .from(schema.messages)
    .where(where)
    .orderBy(asc(schema.messages.createdAt))
    .all();
}

export function getNode(nodeId: string) {
  return db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, nodeId))
    .get();
}

// Context for a "break this down" call: ancestor path + existing children so
// Claude avoids duplicates and matches the level of granularity.
export function getNodeContext(nodeId: string) {
  const node = getNode(nodeId);
  if (!node) return null;

  const tax = db
    .select({ title: schema.taxonomies.title })
    .from(schema.taxonomies)
    .where(eq(schema.taxonomies.id, node.taxonomyId))
    .get();

  const path: string[] = [];
  const seen = new Set<string>();
  let cur: typeof node | undefined = node;
  while (cur?.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    const parent = getNode(cur.parentId);
    if (!parent) break;
    path.unshift(parent.title);
    cur = parent;
  }

  const children = db
    .select({ title: schema.nodes.title })
    .from(schema.nodes)
    .where(
      and(eq(schema.nodes.parentId, nodeId), eq(schema.nodes.archived, false)),
    )
    .all();

  return {
    node,
    taxonomyTitle: tax?.title ?? "",
    path,
    existingChildren: children.map((c) => c.title),
  };
}

// --- sessions ---
export function updateSession(
  sessionId: string,
  patch: { mode?: string; status?: string },
) {
  const set: { updatedAt: Date; mode?: string; status?: string } = {
    updatedAt: new Date(),
  };
  if (patch.mode !== undefined) set.mode = patch.mode;
  if (patch.status !== undefined) set.status = patch.status;
  db.update(schema.sessions)
    .set(set)
    .where(eq(schema.sessions.id, sessionId))
    .run();
}

export function deleteSession(sessionId: string) {
  db.delete(schema.ratings)
    .where(eq(schema.ratings.sessionId, sessionId))
    .run();
  db.delete(schema.messages)
    .where(eq(schema.messages.sessionId, sessionId))
    .run();
  db.delete(schema.notes)
    .where(eq(schema.notes.sessionId, sessionId))
    .run();
  db.delete(schema.answers)
    .where(eq(schema.answers.sessionId, sessionId))
    .run();
  db.delete(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .run();
}

export function listCategories(): string[] {
  return db
    .selectDistinct({ mode: schema.sessions.mode })
    .from(schema.sessions)
    .all()
    .map((r) => r.mode)
    .filter((m): m is string => Boolean(m));
}

// --- node structural ops ---
function descendantIds(nodeId: string, taxonomyId: string): string[] {
  const all = db
    .select({ id: schema.nodes.id, parentId: schema.nodes.parentId })
    .from(schema.nodes)
    .where(eq(schema.nodes.taxonomyId, taxonomyId))
    .all();
  const byParent = new Map<string, string[]>();
  for (const n of all) {
    const k = n.parentId ?? "__root";
    const arr = byParent.get(k);
    if (arr) arr.push(n.id);
    else byParent.set(k, [n.id]);
  }
  const out: string[] = [];
  const stack = [nodeId];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    for (const kid of byParent.get(cur) ?? []) stack.push(kid);
  }
  return out;
}

export function deleteNodeCascade(nodeId: string) {
  const node = getNode(nodeId);
  if (!node) return;
  const ids = descendantIds(nodeId, node.taxonomyId);
  for (const nid of ids) {
    db.delete(schema.ratings).where(eq(schema.ratings.nodeId, nid)).run();
    db.delete(schema.messages).where(eq(schema.messages.nodeId, nid)).run();
    db.delete(schema.notes).where(eq(schema.notes.nodeId, nid)).run();
    const qids = db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.nodeId, nid))
      .all()
      .map((q) => q.id);
    if (qids.length)
      db.delete(schema.answers)
        .where(inArray(schema.answers.questionId, qids))
        .run();
    db.delete(schema.questions).where(eq(schema.questions.nodeId, nid)).run();
    db.delete(schema.nodes).where(eq(schema.nodes.id, nid)).run();
  }
}

export function setNodeArchived(nodeId: string, archived: boolean) {
  const node = getNode(nodeId);
  if (!node) return;
  for (const nid of descendantIds(nodeId, node.taxonomyId)) {
    db.update(schema.nodes)
      .set({ archived, updatedAt: new Date() })
      .where(eq(schema.nodes.id, nid))
      .run();
  }
}

export function moveNode(
  nodeId: string,
  newParentId: string | null,
): { ok: boolean; error?: string } {
  const node = getNode(nodeId);
  if (!node) return { ok: false, error: "node not found" };
  if (newParentId) {
    if (newParentId === nodeId)
      return { ok: false, error: "cannot parent a node to itself" };
    const desc = new Set(descendantIds(nodeId, node.taxonomyId));
    if (desc.has(newParentId))
      return { ok: false, error: "cannot move a node under its own descendant" };
    const parent = getNode(newParentId);
    if (!parent || parent.taxonomyId !== node.taxonomyId)
      return { ok: false, error: "invalid parent" };
  }
  const siblings = db
    .select({ orderIndex: schema.nodes.orderIndex })
    .from(schema.nodes)
    .where(
      newParentId
        ? eq(schema.nodes.parentId, newParentId)
        : and(
            isNull(schema.nodes.parentId),
            eq(schema.nodes.taxonomyId, node.taxonomyId),
          ),
    )
    .all();
  const nextOrder =
    siblings.reduce((m, s) => Math.max(m, s.orderIndex), -1) + 1;
  db.update(schema.nodes)
    .set({ parentId: newParentId, orderIndex: nextOrder, updatedAt: new Date() })
    .where(eq(schema.nodes.id, nodeId))
    .run();
  return { ok: true };
}

// --- notes (multiple per node) ---
export function addNote(
  sessionId: string,
  nodeId: string | null,
  body: string,
): string {
  const nid = id("note");
  db.insert(schema.notes)
    .values({ id: nid, sessionId, nodeId, body })
    .run();
  return nid;
}

export function listNotes(sessionId: string, nodeId?: string | null) {
  const where = nodeId
    ? and(eq(schema.notes.sessionId, sessionId), eq(schema.notes.nodeId, nodeId))
    : eq(schema.notes.sessionId, sessionId);
  return db
    .select()
    .from(schema.notes)
    .where(where)
    .orderBy(asc(schema.notes.createdAt))
    .all();
}

export function updateNote(noteId: string, body: string) {
  db.update(schema.notes)
    .set({ body, updatedAt: new Date() })
    .where(eq(schema.notes.id, noteId))
    .run();
}

export function deleteNote(noteId: string) {
  db.delete(schema.notes).where(eq(schema.notes.id, noteId)).run();
}

// --- questions (node-level, reused across sessions) ---
export function listQuestions(nodeId: string, type?: string) {
  const where = type
    ? and(eq(schema.questions.nodeId, nodeId), eq(schema.questions.type, type))
    : eq(schema.questions.nodeId, nodeId);
  return db
    .select()
    .from(schema.questions)
    .where(where)
    .orderBy(asc(schema.questions.orderIndex), asc(schema.questions.createdAt))
    .all();
}

export function addQuestion(input: {
  nodeId: string;
  type: string;
  prompt: string;
  options?: string[] | null;
  answerIndex?: number | null;
  answerGuide?: string | null;
}): string {
  const qid = id("q");
  const sib = db
    .select({ orderIndex: schema.questions.orderIndex })
    .from(schema.questions)
    .where(eq(schema.questions.nodeId, input.nodeId))
    .all();
  const nextOrder = sib.reduce((m, s) => Math.max(m, s.orderIndex), -1) + 1;
  db.insert(schema.questions)
    .values({
      id: qid,
      nodeId: input.nodeId,
      type: input.type,
      prompt: input.prompt,
      options: input.options ?? null,
      answerIndex: input.answerIndex ?? null,
      answerGuide: input.answerGuide ?? null,
      orderIndex: nextOrder,
    })
    .run();
  return qid;
}

export function deleteQuestion(qid: string) {
  db.delete(schema.answers).where(eq(schema.answers.questionId, qid)).run();
  db.delete(schema.questions).where(eq(schema.questions.id, qid)).run();
}

// --- answers (respondent responses, per session) ---
export function upsertAnswer(
  sessionId: string,
  questionId: string,
  patch: { choice?: number | null; text?: string | null },
) {
  const existing = db
    .select()
    .from(schema.answers)
    .where(
      and(
        eq(schema.answers.sessionId, sessionId),
        eq(schema.answers.questionId, questionId),
      ),
    )
    .get();
  if (existing) {
    db.update(schema.answers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.answers.id, existing.id))
      .run();
  } else {
    db.insert(schema.answers)
      .values({
        id: id("ans"),
        sessionId,
        questionId,
        choice: patch.choice ?? null,
        text: patch.text ?? null,
      })
      .run();
  }
}

export function listAnswers(sessionId: string, nodeId: string) {
  return db
    .select({
      questionId: schema.answers.questionId,
      choice: schema.answers.choice,
      text: schema.answers.text,
      score: schema.answers.score,
      feedback: schema.answers.feedback,
    })
    .from(schema.answers)
    .innerJoin(
      schema.questions,
      eq(schema.answers.questionId, schema.questions.id),
    )
    .where(
      and(
        eq(schema.answers.sessionId, sessionId),
        eq(schema.questions.nodeId, nodeId),
      ),
    )
    .all();
}

export function setAnswerGrade(
  sessionId: string,
  questionId: string,
  score: number,
  feedback: string,
) {
  db.update(schema.answers)
    .set({ score, feedback, updatedAt: new Date() })
    .where(
      and(
        eq(schema.answers.sessionId, sessionId),
        eq(schema.answers.questionId, questionId),
      ),
    )
    .run();
}

export function questionsWithAnswers(sessionId: string, nodeId: string) {
  const qs = listQuestions(nodeId);
  const byQ = new Map(
    listAnswers(sessionId, nodeId).map((a) => [a.questionId, a]),
  );
  return qs.map((q) => ({ ...q, answer: byQ.get(q.id) ?? null }));
}

export function getTierScale(taxonomyId: string): Tier[] {
  const t = db
    .select({ tierScale: schema.taxonomies.tierScale })
    .from(schema.taxonomies)
    .where(eq(schema.taxonomies.id, taxonomyId))
    .get();
  return (t?.tierScale as Tier[]) ?? DEFAULT_TIERS;
}
