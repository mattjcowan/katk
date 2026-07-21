import { randomBytes, randomUUID } from "node:crypto";

// Opaque, permanent node/entity ids. Position is NEVER encoded here — see
// docs/DESIGN.md §3 (stable id, mutable position).
export function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

// High-entropy, URL-safe token for public share links (192 bits). Must be
// unguessable since it is the only credential guarding a shared session.
export function shareToken(): string {
  return randomBytes(24).toString("base64url");
}
