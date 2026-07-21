import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import type { Tier } from "@/lib/tiers";

// A taxonomy = one tree per subject area. A "domain" is just an entry point.
export const taxonomies = sqliteTable("taxonomies", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  tierScale: text("tier_scale", { mode: "json" }).$type<Tier[]>().notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Nodes: identity (id) is decoupled from position (parentId/orderIndex).
// All assessment records reference the stable id. See docs/DESIGN.md §3.
export const nodes = sqliteTable("nodes", {
  id: text("id").primaryKey(),
  taxonomyId: text("taxonomy_id")
    .notNull()
    .references(() => taxonomies.id),
  parentId: text("parent_id").references((): AnySQLiteColumn => nodes.id),
  slug: text("slug").notNull().default(""),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  weight: real("weight").notNull().default(1),
  orderIndex: integer("order_index").notNull().default(0),
  // Optional per-tier descriptors to guide the operator / Claude.
  tierRubric: text("tier_rubric", { mode: "json" }).$type<
    Record<string, string>
  >(),
  source: text("source").notNull().default("import"), // ai | manual | import
  createdInSession: text("created_in_session"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// The people being assessed. No credentials in v1 — the operator creates these.
export const subjects = sqliteTable("subjects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// A resumable attempt. Retake = new row, resume = reopen an in_progress row.
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  subjectId: text("subject_id")
    .notNull()
    .references(() => subjects.id),
  taxonomyId: text("taxonomy_id")
    .notNull()
    .references(() => taxonomies.id),
  mode: text("mode").notNull().default("interview"), // interview | self | learn
  status: text("status").notNull().default("in_progress"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// One rating per (session, node). This is what the radar renders.
// gap = selfTier - assessedTier.
export const ratings = sqliteTable(
  "ratings",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id),
    selfTier: integer("self_tier"),
    assessedTier: integer("assessed_tier"),
    note: text("note"),
    rationale: text("rationale"),
    scoredBy: text("scored_by").notNull().default("human"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("ratings_session_node").on(t.sessionId, t.nodeId)],
);

// Optional free-form capture, sliceable by node (nodeId nullable).
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  nodeId: text("node_id").references(() => nodes.id),
  role: text("role").notNull(), // subject | interviewer | ai | system
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Assessment questions attached to a node (taxonomy-level, reused across
// sessions). type = "mcq" | "conversational".
export const questions = sqliteTable("questions", {
  id: text("id").primaryKey(),
  nodeId: text("node_id")
    .notNull()
    .references(() => nodes.id),
  type: text("type").notNull(),
  prompt: text("prompt").notNull(),
  options: text("options", { mode: "json" }).$type<string[]>(), // mcq
  answerIndex: integer("answer_index"), // mcq correct option
  answerGuide: text("answer_guide"), // mcq explanation / conversational rubric
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// A respondent's answer to a question, per session (mcq choice or free text).
export const answers = sqliteTable(
  "answers",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    choice: integer("choice"), // mcq selected option index
    text: text("text"), // conversational answer
    score: integer("score"), // conversational grade 0-100
    feedback: text("feedback"), // per-answer feedback
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("answers_session_question").on(t.sessionId, t.questionId)],
);

// Multiple timestamped notes per node (per session). Add / edit / delete.
export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  nodeId: text("node_id").references(() => nodes.id),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
