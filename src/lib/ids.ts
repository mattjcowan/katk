import { randomUUID } from "node:crypto";

// Opaque, permanent node/entity ids. Position is NEVER encoded here — see
// docs/DESIGN.md §3 (stable id, mutable position).
export function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
