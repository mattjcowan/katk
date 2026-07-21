import type { RatingLite, TierKey, TreeNode } from "@/lib/types";

// Pure helpers, safe to import from client or server.

type NodeInput = {
  id: string;
  parentId: string | null;
  title: string;
  slug: string;
  description: string;
  source: string;
  orderIndex: number;
  archived: boolean;
};

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildTree(
  nodes: NodeInput[],
  ratings: (RatingLite & { nodeId: string })[],
): TreeNode[] {
  const ratingByNode = new Map(ratings.map((r) => [r.nodeId, r]));
  const map = new Map<string, TreeNode>();
  for (const n of nodes) {
    const r = ratingByNode.get(n.id);
    map.set(n.id, {
      ...n,
      children: [],
      rating: r
        ? { selfTier: r.selfTier, assessedTier: r.assessedTier, note: r.note }
        : null,
    });
  }
  const roots: TreeNode[] = [];
  for (const n of nodes) {
    const node = map.get(n.id)!;
    const parent = n.parentId ? map.get(n.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (arr: TreeNode[]) => {
    arr.sort((a, b) => a.orderIndex - b.orderIndex);
    arr.forEach((c) => sortRec(c.children));
  };
  sortRec(roots);
  return roots;
}

// Rollup: a node's effective tier is its direct rating if set, else the average
// of its children's effective tiers. Divergence between a direct assessment and
// the rollup is itself signal (docs/DESIGN.md §6.3).
export function effectiveTier(node: TreeNode, key: TierKey): number | null {
  const direct = node.rating?.[key];
  if (direct != null) return direct;
  const kids = node.children.filter((c) => !c.archived);
  if (kids.length) {
    const vals = kids
      .map((c) => effectiveTier(c, key))
      .filter((v): v is number => v != null);
    if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return null;
}

export function findNode(roots: TreeNode[], id: string): TreeNode | undefined {
  for (const n of roots) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return undefined;
}

export function pathTo(
  roots: TreeNode[],
  id: string,
  trail: TreeNode[] = [],
): TreeNode[] | null {
  for (const n of roots) {
    const next = [...trail, n];
    if (n.id === id) return next;
    const found = pathTo(n.children, id, next);
    if (found) return found;
  }
  return null;
}
