# KATK — Knowledge Assessment ToolKit — Design

> A conversational, self-driven tool for assessing knowledge coverage across a
> domain and for building emergent learning taxonomies in fields you don't yet
> know. The *shape* of the resulting radar — deep spikes vs. broad coverage — is
> the product.

This document captures the design decisions made so far. It is the spec we build
against. It is a living document; update it as decisions change.

---

## 1. Purpose & mental model

You explore a subject the way you'd explore a problem with an expert friend on the
phone: you state a root ("fix my green pool", "assess this candidate on backend
engineering"), it decomposes into the things worth knowing, each of those
decomposes further, and you go as deep as your attention warrants. Along the way
you record how proficient you (or someone you're interviewing) are in each area.

Two **lenses** over the *same* tree:

- **Assess lens** — walk the tree in conversation, capture (optionally) what was
  said, land an *assessed tier* per node → a radar showing self-claim vs. reality.
- **Learn lens** — walk the same tree with objectives/resources attached, track
  your own progress per node → a radar of where you are vs. where you want to be.

Build the tree once, get both.

### Usage model

- **Operator-driven.** The primary flow is you driving the tool: you create the
  *subject* records (the people being assessed) and enter their answers and
  self-ratings. It is a tool you drive, not a form others fill.
- **Conversational first.** The primary interaction is a conversation with a
  scoring sidecar; MCQ and conversational item banks back it up (§12).
- **Multi-user & self-hostable.** What began single-operator/no-auth now supports
  admin-provisioned accounts with per-user data isolation (§13) and Docker
  deployment (§15) — self-hosting for a small team earned its keep. Still no public
  registration: the admin provisions everyone.

Still deferred until there's a reason: invitations, a candidate-facing self-serve
UI, the learn lens, and Postgres.

---

## 2. Core concepts

- **Taxonomy** — one tree per subject area. A "domain" is not a special kind of
  thing; it's just an *entry point* into the taxonomy at a chosen depth/scope.
  "General Software Engineering" enters near the root; "AI Engineering" enters at
  the AI node and goes deeper; "Mastra & Inngest" enters at a deep tool node.
- **Node** — an *area of competence you can be more or less proficient at*. It may
  be a knowledge area ("water chemistry") or a skill/procedure ("swap the pump").
  The system does not distinguish; the same tier scale measures either.
- **Tier scale** — a single shared scale for the whole taxonomy, so every spoke is
  comparable. Each tier is anchored by **both** equivalent years **and** cumulative
  hours on the topic. Example: 0 = Novice (`0 yr`, `<50 h`) … 5 = Master
  (`20–30+ yr`, `>10k h`). Assessed level = the highest tier at which the person
  answers *reliably*, not raw percent-correct — this is what preserves the
  specialist-vs-generalist distinction.
- **Self tier vs. assessed tier** — captured separately. The **gap** (self −
  assessed) is colored per spoke: **red** = overclaim, **green** = underclaim.
- **Breadth vs. depth** — the polygon *shape* carries this, plus two scalars for
  ranking: breadth = % of spokes above a threshold; depth = peak/mean of top spokes.

---

## 3. Identity model — stable id, mutable position

The single most important structural decision. A node's **identity** is decoupled
from its **position**.

- **Identity** = a permanent, opaque `id` (e.g. `n_k7f3m2`). Assigned once, never
  changes. All assessment records reference *this*.
- **Position** = parent, order, taxonomy, title/slug, description. All freely
  mutable.

Because every assessment record (`ratings`, `messages`, `notes`,
`learning_progress`) points at the **identity**:

| Operation | Effect on history |
|---|---|
| Rename a node | intact (records don't reference the label) |
| Reparent within a taxonomy | intact |
| Move a subtree to another taxonomy (e.g. extract Mastra & Inngest) | intact |
| Soft-delete a node | intact; node tombstoned so past radars still render |

**Corollary:** because the DB stores only stable ids and never paths, a whole
taxonomy refactor is a data-layer no-op — no migration. Reorganizing is cheap.

> Note: IDs are **opaque**, not path-encoded. An earlier idea of namespaced ids
> like `ai-eng.rag.chunking` was rejected — encoding the path into the id welds
> position into identity and breaks references the moment a node moves.

**Not built but not precluded:** true polyhierarchy (a node with two parents,
referenced from two places without duplication) falls out of the same model if we
ever want it. v1 is single-parent trees per taxonomy.

**Honest limits:** move / rename / reparent / soft-delete are free and lossless.
**Split** (one node → two) and **merge** (two → one) are *semantic* operations — a
human must decide which historical ratings go where; the tool can prompt but can't
decide.

---

## 4. Emergent trees — runtime growth

You cannot predict where a conversation goes. So the taxonomy is authored *as it
emerges*, during the session, not fully up front.

- **"Break this down" is the core action.** Stand on any node → Claude proposes
  5–8 children (aware of existing siblings to avoid duplicates; respecting the
  heuristics in §5) → you accept / edit / reject → they become real nodes →
  recurse. Plus a plain "add child manually".
- **Structure and assessment interleave.** Decompose, go deep only where it
  matters, assess the leaves you reached, leave the rest shallow. The tree is a
  living artifact of the conversation.
- **Provenance.** Each node records `source: ai | manual | import` and the session
  that created it, so you can review/prune AI-generated branches deliberately.
- **Gardening is cheap.** Emergent + AI-assisted trees drift (near-duplicates,
  uneven granularity). A periodic "review this branch" pass (Claude suggests
  merges/renames, you approve) cleans it — safe because reorg never endangers
  attached assessments (§3).
- **Roots are roots.** A taxonomy can grow *from a concrete problem outward*
  ("fix my pool") or *from a general domain inward* ("plumbing as a field"). Same
  machinery.

---

## 5. Tree depth heuristics

Depth is **not uniform** and **not fixed**. Two rules decide it:

1. **Radar rule (viz-driven):** keep each wheel to ~6–10 spokes. More than that →
   group into an intermediate level; drill-down shows the rest. This is *why* the
   tree has levels — you never render 40 spokes at once.
2. **Discrimination rule (assessment-driven):** split a node into children only
   when a real person could score *different tiers* on those children. If two
   proposed children would always get the same tier, don't split — it's noise.

Practical convention: author ~2 levels, assess at 1–2, deepen a branch lazily —
only where you actually want to assess finely, and often in-session.

Top level of a broad domain should group by **facet** so each radar is coherent
(e.g. Technical Foundations / Building & Delivery / Architecture & Integration /
Ways of Working), rather than mixing "Distributed Data" and "Customer Interaction"
on one wheel.

---

## 6. Data model

Two layers: the **tree** (definitions) and **runtime** (per-subject data).

### 6.1 The tree is DB-native; YAML is seed + export

The tree lives in the database as mutable node rows, because it grows at runtime.
YAML is the **interchange** format: seed in, export out — not the master.

- **Seed in:** Claude Code / the in-app assistant generates a starter tree as YAML
  → import.
- **Grow live:** every in-session decompose/add/rename/move writes to the DB.
- **Export out:** dump any tree back to YAML for git backup, offline refinement, or
  to promote it into a reusable template.

Zod validates at the YAML boundary (import/export).

### 6.2 Node fields

| Field | Zone | Notes |
|---|---|---|
| `id` | identity | opaque, permanent, the FK everything else uses |
| `slug` | position | human-friendly, mutable |
| `title`, `description` | content | YAML-owned (see §7) |
| `parent` | position | stable id of parent; DB-owned once node exists |
| `taxonomy` | position | which taxonomy; DB-owned |
| `order` | position | sibling ordering; DB-owned |
| `weight` | content | contribution to rollups |
| `tier_rubric` / question hints | content | tier-anchored descriptors for Claude/you |
| `learn` (objectives, resources) | content | the learn lens |
| `source` | runtime | `ai` / `manual` / `import` |
| `created_in_session` | runtime | provenance |
| `archived` | runtime | soft-delete tombstone |

### 6.3 Runtime tables

| Table | Key columns | Purpose |
|---|---|---|
| `subjects` | name, email?, tags | the people you assess (no credentials in v1) |
| `sessions` | subject_id, taxonomy_id, tree_version, mode (`interview`/`self`/`learn`), status (`in_progress`/`paused`/`done`) | the resumable attempt — retake = new row, resume = reopen |
| `questions` | node_id, type (`mcq`/`conversational`), prompt, options?, answer_index?, answer_guide? | authored per-node banks, reused across sessions (§12) |
| `answers` | session_id, question_id, choice?/text?, **score?**, **feedback?**, scored_by | the respondent's answer this session — MCQ `choice` or conversational `text`; `score`/`feedback` filled by auto-assessment (§12) |
| `ratings` | session_id, node_id, **self_tier**, **assessed_tier**, confidence?, rationale?, scored_by | one row per node — *this is what the radar renders*; gap = self − assessed |
| `messages` | session_id, **node_id?**, role (`subject`/`interviewer`/`ai`/`system`), content, ts | optional transcript, sliceable by spoke |
| `notes` | author_id, subject (session/node/user), node_id?, visibility, body | assessor notes *and* personal study notes, one table |
| `learning_progress` | user_id, taxonomy_id, node_id, status, self_tier, last_touched | the learn lens — *designed, not yet built* |

Key properties:
- A `ratings` row **stands alone** — `messages` are an optional attachment, never a
  prerequisite. (You said you may or may not want to capture the free-form.)
- The **assessed tier is your (human) judgment.** `scored_by = human` by default;
  Claude is optional assist (suggest a deeper question, draft a rationale).
- Internal nodes support **direct assessment** ("Databases: a 3, holistically")
  **and/or rollup** from children. Divergence between the two is itself signal.

---

## 7. YAML ↔ DB seeding lifecycle

The mechanism that lets a YAML seed and a live, hand-edited DB coexist forever
without resets. Governing rule: **seeding is an idempotent upsert keyed on the
stable `id` — never a truncate-and-reload.** Think `terraform apply` /
`kubectl apply` (reconcile desired→actual by id, preview a diff), not
`DROP TABLE; reload`.

### 7.1 Field ownership on a match

| Field group | Authority | Behavior on re-seed |
|---|---|---|
| Position (parent, order, taxonomy) | DB / UI | **never touched** once the node exists |
| User data (ratings, notes, messages, progress) | DB only | not in YAML; never touched |
| Content (title, description, tier rubric, learn) | YAML | refreshed only by an **explicit, diffed** sync that skips UI-edited fields |

So **moving a node in the UI is permanent** — re-seeding matches by `id` and leaves
position alone.

### 7.2 Adding nodes to the seed over time

1. **Additive edit** — add a node to the YAML with `parent: <existing id>` and
   re-import. Only the new `id` inserts. It attaches correctly even if you moved
   that parent in the UI, because parent is referenced by stable id, not path.
2. **Round-trip (recommended)** — export the current live tree → YAML (moves
   already reflected) → edit/add there → re-import. Lossless because everything is
   id-keyed. New nodes may omit `id`; on import the system mints one and **writes
   it back into the YAML**, so future imports match instead of duplicating.

### 7.3 Deletions

Never automatic. Removing a node from YAML does **not** delete it from the DB (that
would orphan assessments). Deletion is a deliberate soft-delete in the UI.
Additive-by-default = safe-by-default.

### 7.4 Idempotency

Re-running the seed any number of times is safe: first run inserts, subsequent runs
are no-ops for existing ids.

---

## 8. Conversational UX

Primary screen = a chat-style transcript panel + a live tree/radar sidecar. The
repeated atomic unit is the per-node card:

```text
┌─ Consensus ─────────────────────────────── your tier: ● 3 ─┐
│  Self assessment:      ○0 ○1 ●2 ○3 ○4 ○5   "competent"          │
│  [ + capture answer ]   ← free-form, optional               │
│  Expert assessment:  ○0 ○1 ○2 ●3 ○4 ○5                        │
│  Note: ____________________________  ← optional   [ Ask AI ]│
└─────────────────────────────────────────────────────────────┘
```

Flow: pick a subject → open a session → move through nodes → for the current node
Claude can generate a question on the fly from its description + rubric → you probe
as deep as you like → optionally capture what was said → set *their* claim and
*your* assessment → the radar spoke fills and the gap (red/green) appears → move
on. You assess at whatever depth you stop; you can grow new nodes mid-conversation
(§4). Sessions are append-only, so resume/retake is free.

---

## 9. Visualization

- **Gap radar with drilldown.** Top radar = facet groups (§5); click a spoke →
  radar of its categories → radar of subcategories. Two overlaid polygons
  (self dashed, assessed solid); the between-area shaded red/green per spoke.
  A spoke also drills into the *conversation excerpts + notes* that produced it
  (via `messages.node_id`), not just a sub-radar.
- **Breadth × depth scatter.** A companion chart to rank/compare subjects:
  well-rounded (high breadth) vs. specialist (high depth).
- Chart library: **amCharts 5** (licensed) — best-in-class radar/polar with
  drill-down. Palette to be refined via the `dataviz` skill (proper light/dark +
  red/green gap encoding).

---

## 10. Stack

Chosen for "intuitive UI, built via Claude Code, stack doesn't matter":

- **Next.js 16 (App Router) + TypeScript** — one codebase, UI + route handlers.
- **Tailwind v4** — styling; class-based light/dark theme.
- **Drizzle ORM + better-sqlite3** — a central `app.db` (accounts) plus one database
  per user (§13). Zero infra to start; Postgres remains a future option for
  large/shared deployments.
- **amCharts 5** — the gap radar with drill-down.
- **Anthropic SDK (Claude)** — decomposition, question generation, answer grading.
- **Zod** — validate YAML at the import/export boundary.

---

## 11. Build order (walking skeleton)

Prove the risky, novel core before any polish:

1. Drizzle schema (§6.3) + node table (§6.2) on SQLite — no auth yet (§13 added it).
2. Tier model + one seed taxonomy imported from YAML (§7).
3. Conversational session screen: per-node card (§8) + live gap radar with
   drilldown (§9) — the thing that proves the whole vision.
4. Claude wired in: "break this down" decomposition (§4) + on-the-fly questions +
   tier-rationale drafting.
5. Export tree → YAML round-trip (§7.2).

Authoring UI polish and MCQ item banks come after the loop works end to end.

---

## 12. Questions & assessment content

Each node carries authored **questions** (reused across every session/subject on
that node), of two types:

- **Multiple-choice** — prompt, 4 options, one correct index, plus a one-line
  explanation. A "show answers" toggle reveals the correct option + explanation.
- **Conversational** — an open-ended prompt plus an `answerGuide` describing what
  a strong answer should cover (the things to listen for).

Questions are generated in-app with Claude (like "break this down", with an
optional steer box) and are add/delete-only in the UI for now. They live in the
`questions` DB table at runtime, and drive the **Multiple-choice** and
**Conversational** tabs of the center panel (the third is the gap **Radar**).

**Seeding (for Claude Code authoring).** Questions follow the same
authored-content lifecycle as the tree (§6.1/§7): per-node YAML seed files keyed
on the **stable node id**, under a per-taxonomy folder:

```text
seeds/<taxonomy>/
  tree.yaml
  questions/<slug>.<nodeId>.yaml     # the `node:` id inside is the key
```

Import upserts questions by stable id (backfilled), additive by default; export
round-trips DB → files. Not built yet — the operator generates in-app; the seed
files exist so Claude Code can author starter banks.

## 13. Multi-user & data isolation

Self-hosting for a small team motivated real accounts — without turning this into a
candidate-facing product.

- **Admin-provisioned.** No public registration. One admin is seeded from
  `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` on first run (**seed-only** — the
  password is changed in-app thereafter, never re-synced from env). The admin
  creates users with a temporary password; each sets their own on first login.
  Admins reset passwords and disable/delete users.
- **A database per user.** Accounts live in a central `app.db`; each user's tree,
  subjects, sessions, ratings, and answers live in their own `users/<id>.db`.
  Isolation is physical, not row-level.
- **Queries stay unchanged.** A request binds the current user's database into an
  AsyncLocalStorage-scoped connection, so the query layer always talks to "the
  current db". Per-user schema is created/migrated on open (`CREATE TABLE IF NOT
  EXISTS` + additive `ALTER`).
- **Sessions.** A stateless, HMAC-signed cookie (scrypt password hashing), `Secure`
  in production — so deployments need HTTPS (§15).

---

## 14. AI provider & model selection (BYOK)

AI is optional and cost-aware. Every AI call (decompose, question generation, answer
grading) resolves a key **and** a model per user:

| User state | Key used | Model used |
|---|---|---|
| Own key set (Settings) | their key, decrypted | their chosen model |
| No own key, not required | shared `ANTHROPIC_API_KEY` | `KATK_MODEL` (server default) — the user's pick is ignored |
| Required own key, none set | — | blocked, with a prompt to add one |

The rule ties model choice to who pays: the shared key can only ever run the (cheap)
server model, so no user can rack up a bill on it with a pricier model. Users who
want a better model bring their own key.

- **Keys at rest.** A user's key is encrypted with **AES-256-GCM** under a server
  master key (`KATK_ENCRYPTION_KEY`, else derived from `KATK_SECRET`) — never stored
  or returned in plaintext (the UI shows only the last 4). It is *not*
  password-derived, so the server can decrypt at call time and a password reset
  never orphans keys.
- **Admin control.** A per-user *require own key* flag forces a user off the shared
  key entirely.
- **Model list** is a small curated set (Haiku / Sonnet / Opus); the shared default
  is `KATK_MODEL` and should be biased cheap.

---

## 15. Deployment

Stateful on local disk (SQLite), so the shape is deliberately simple: **one
container, one persistent volume, one instance, TLS in front.**

- **Image.** A multi-stage `Dockerfile` emits Next.js standalone output; the
  `better-sqlite3` native addon rides along (it's a `serverExternalPackages` entry).
  Runs non-root. Published to `ghcr.io/mjczone/katk` by CI on push/tag, multi-arch
  (amd64 + arm64).
- **Compose.** `docker-compose.yml` mounts a named volume at `/data`
  (`KATK_DATA_DIR`), declares every env var with a default, and binds to localhost
  for a reverse proxy to terminate TLS.
- **One instance only.** SQLite file locks + per-user data files rule out horizontal
  scaling. Back up the volume — a tarball of `/data` is a complete backup.
- **Pin the secrets.** Set `KATK_SECRET` and `KATK_ENCRYPTION_KEY` explicitly;
  otherwise they're generated into the volume and a volume rebuild invalidates
  sessions and orphans stored API keys.
- **Not a fit:** serverless/edge platforms (ephemeral, no shared writable disk).
  Going there means swapping better-sqlite3 for a hosted DB (libSQL/Turso or
  Postgres) — a real migration, not a config flag.

---

## 16. Open questions / roadmap

- **Session report** — generate a report for a session covering only the nodes
  that were *touched* (ratings / notes / questions / captured transcript). On the
  roadmap; not now.
- **The learn lens** (§1) — objectives, resources, and progress per node — designed
  (`learning_progress`) but not yet built.
- Question seed-file import/export (§12) — build when there's a bank to seed.
- Manual (non-AI) question authoring in the UI (currently AI-generate + delete).
- Candidate-facing self-serve UI and invitations (still deliberately deferred).
- Postgres option for large/shared deployments (SQLite-per-user is the v1 default).
- Split / merge history reconciliation UX (§3).
- True polyhierarchy (§3).
- Item Response Theory for rigorous cross-assessment ability estimates (tiered
  scoring is the v1 stand-in).
- Promoting an emergent tree into a shared, versioned template library.
