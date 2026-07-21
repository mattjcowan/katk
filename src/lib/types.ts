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
