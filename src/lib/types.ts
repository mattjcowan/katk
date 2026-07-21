import type { Tier } from "@/lib/tiers";

export type TierKey = "selfTier" | "assessedTier";

export type RatingLite = {
  selfTier: number | null;
  assessedTier: number | null;
  note: string | null;
};

export type TreeNode = {
  id: string;
  parentId: string | null;
  title: string;
  slug: string;
  description: string;
  source: string;
  orderIndex: number;
  archived: boolean;
  children: TreeNode[];
  rating: RatingLite | null;
};

export type SessionData = {
  session: { id: string; mode: string; status: string };
  subject: { id: string; name: string; email: string | null };
  taxonomy: { id: string; title: string; tierScale: Tier[] };
  tree: TreeNode[];
};

// A full, self-contained snapshot of one session — everything the read-only
// share viewer renders, preloaded server-side (no client fetches).
export type ShareQuestion = {
  id: string;
  nodeId: string;
  type: string;
  prompt: string;
  options: string[] | null;
  answerIndex: number | null;
  answerGuide: string | null;
};
export type ShareAnswer = {
  questionId: string;
  choice: number | null;
  text: string | null;
  score: number | null;
  feedback: string | null;
};
export type ShareNote = { id: string; nodeId: string | null; body: string };
export type ShareMessage = {
  id: string;
  nodeId: string | null;
  role: string;
  content: string;
};
export type SessionBundle = SessionData & {
  questions: ShareQuestion[];
  answers: ShareAnswer[];
  notes: ShareNote[];
  messages: ShareMessage[];
};
