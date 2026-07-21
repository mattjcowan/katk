# KATK — Knowledge Assessment Toolkit

A self-hostable, conversational tool for assessing knowledge coverage across a
domain, with a live **gap radar** (self-claim vs. expert assessment) and
drill-down. It also grows **emergent taxonomies** — trees you build, with AI help,
as a conversation goes deeper. See [docs/DESIGN.md](docs/DESIGN.md) for the design.

## Features

- **Gap radar** — overlaid self vs. assessed polygons per node; red spoke =
  over-claim, green = under-claim; drill down facet → category → subcategory.
- **Emergent trees** — stand on any node and let Claude **break it down** into
  sub-areas (or add children by hand); reorganize freely — history follows the
  node's stable id, not its position.
- **Questions & answers** — per-node **multiple-choice** and **conversational**
  banks (AI-generated with an optional steer), a respondent-answer field, and
  **auto-assessment**: MCQs scored by correctness, conversational answers graded
  against an answer guide with **per-answer written feedback**, rolled up into the
  expert-assessment tier.
- **Multi-user** — admin-provisioned accounts, first-login password change, and
  **one SQLite database per user** for full data isolation.
- **Bring-your-own-key (BYOK)** — each user can store their own Anthropic API key
  (encrypted at rest) and pick a model; admins can require a user to supply their
  own. The shared server key stays pinned to a cost-controlled model.
- **Light / dark theme.**
- **Self-hostable** — single Docker container + a volume; multi-arch image on GHCR.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Drizzle + better-sqlite3 ·
amCharts 5 · Anthropic SDK.

## Quick start (development)

```bash
npm install
cp .env.example .env.local   # set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME
npm run dev                  # http://localhost:3000
```

Sign in as the admin. On first login the admin's database is provisioned and the
General Software Engineering taxonomy is seeded. Create a subject, start a session,
and work down the tree — set *self* and *expert* assessment per node; the radar
fills as you go (red = over-claimed, green = under-claimed).

## Deploy with Docker

The app is **stateful on local disk** (SQLite: a central `app.db` plus one database
per user), so it runs as a **single container with a persistent volume behind an
HTTPS reverse proxy** — do not scale it horizontally.

Pull the published image (built by CI on every push/tag, amd64 + arm64):

```bash
docker pull ghcr.io/mjczone/katk:latest
```

Or use [docker-compose.yml](docker-compose.yml) — it mounts a `katk-data` volume at
`/data` and declares every variable with a default:

```bash
docker compose up -d            # runs the published image
# or build from source:
docker compose up -d --build
```

Terminate TLS in front of it (the session cookie is `Secure` in production). Minimal
Caddy example:

```caddyfile
katk.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Back up the volume — it's just files under `/data`:

```bash
docker run --rm -v katk-data:/data -v "$PWD":/b alpine \
  tar czf /b/katk-$(date +%F).tgz -C /data .
```

## Configuration

All configuration is via environment variables (see [.env.example](.env.example));
the compose file supplies sensible defaults.

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | — | Seed the first admin (initial run only; change the password in-app afterward). |
| `KATK_SECRET` | generated → `<data>/.session-secret` | Signs session cookies. **Pin in production.** |
| `KATK_ENCRYPTION_KEY` | derived from `KATK_SECRET` | Master key encrypting stored per-user API keys (AES-256-GCM). **Pin in production.** |
| `ANTHROPIC_API_KEY` | — | Shared server key; used for any user without their own (unless required to bring one). |
| `KATK_MODEL` | `claude-opus-4-8` | Model used on the **shared** key — set cheap (e.g. `claude-haiku-4-5`) to cap cost. |
| `KATK_DATA_DIR` | `data` (`/data` in Docker) | Root for `app.db` + per-user databases. |

> **Pin `KATK_SECRET` and `KATK_ENCRYPTION_KEY`** in any real deployment. If unset,
> they are generated into the data volume; losing or recreating the volume without
> them invalidates all sessions and orphans every stored API key.

## Users

Admin-provisioned — there is no public registration.

- The **admin** is seeded from `ADMIN_*` (seed-only; change the password in the UI,
  or recover via `npm run set-password -- <email> <password>`).
- The admin creates users at **/admin** with a temporary password; each sets their
  own on first login. Admins can reset passwords, disable/delete users, and require
  a user to bring their own API key.
- **Each user gets their own SQLite database** (`<data>/users/<id>.db`); accounts
  live in `<data>/app.db`.
- Upgrading from an older single-user db: on first admin login an existing
  `<data>/katk.db` is migrated into the admin's database, so nothing is lost.

## AI & API keys

AI powers "break this down", question generation, and answer grading. Each request
resolves a key **and** a model:

1. the user's **own key** (set in **Settings**, encrypted at rest) → uses their
   chosen model;
2. otherwise the shared `ANTHROPIC_API_KEY` → always the cost-controlled
   `KATK_MODEL` (a user's model pick never spends the shared key on a pricier one);
3. if the admin **required own key** and none is set, AI is blocked with a prompt to
   add one.

Keys are shown masked (last 4 only) and never returned in plaintext. Without any
key, everything non-AI still works — you add nodes and questions by hand.

## Taxonomies

Taxonomies live as YAML in [`seeds/`](seeds/) and import via an idempotent,
upsert-by-stable-id seeder (`npm run db:seed`). Re-running never resets your edits;
new nodes are added and ids backfilled into the YAML. See docs/DESIGN.md §7.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run db:seed [file.yaml]` | Import/upsert a taxonomy (default: General SWE) |
| `npm run db:studio` | Drizzle Studio (inspect a database) |
| `npm run set-password -- <email> <password>` | Reset an account password from the CLI |

## Releases

CI publishes `ghcr.io/mjczone/katk:latest` on every push to `main`. To cut a
versioned release, push a tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

That builds the versioned image (`:1.0.0`, `:1.0`, `:latest`) **and** creates a
GitHub Release with auto-generated notes. A pre-release suffix (`v1.1.0-rc.1`) is
published as a pre-release.

## License

[MIT](LICENSE) © mattjcowan
