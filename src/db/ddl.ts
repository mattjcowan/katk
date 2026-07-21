// Per-user data schema as raw DDL (mirrors ./schema.ts). Kept in a plain module
// (no "server-only") so both the per-user DB provisioner and the CLI seed script
// can create tables in a fresh SQLite file.
export const USER_SCHEMA_SQL = `
create table if not exists taxonomies (
  id text primary key not null, title text not null,
  description text not null default '', tier_scale text not null,
  archived integer not null default 0, created_at integer not null
);
create table if not exists nodes (
  id text primary key not null, taxonomy_id text not null, parent_id text,
  slug text not null default '', title text not null,
  description text not null default '', weight real not null default 1,
  order_index integer not null default 0, tier_rubric text,
  source text not null default 'import', created_in_session text,
  archived integer not null default 0, created_at integer not null,
  updated_at integer not null
);
create table if not exists subjects (
  id text primary key not null, name text not null, email text, tags text,
  created_at integer not null
);
create table if not exists sessions (
  id text primary key not null, subject_id text not null, taxonomy_id text not null,
  mode text not null default 'interview', status text not null default 'in_progress',
  created_at integer not null, updated_at integer not null
);
create table if not exists ratings (
  id text primary key not null, session_id text not null, node_id text not null,
  self_tier integer, assessed_tier integer, note text, rationale text,
  scored_by text not null default 'human', created_at integer not null,
  updated_at integer not null
);
create unique index if not exists ratings_session_node on ratings (session_id, node_id);
create table if not exists messages (
  id text primary key not null, session_id text not null, node_id text,
  role text not null, content text not null, created_at integer not null
);
create table if not exists notes (
  id text primary key not null, session_id text not null, node_id text,
  body text not null, created_at integer not null, updated_at integer not null
);
create table if not exists questions (
  id text primary key not null, node_id text not null, type text not null,
  prompt text not null, options text, answer_index integer, answer_guide text,
  order_index integer not null default 0, created_at integer not null
);
create table if not exists answers (
  id text primary key not null, session_id text not null, question_id text not null,
  choice integer, text text, score integer, feedback text,
  created_at integer not null, updated_at integer not null
);
create unique index if not exists answers_session_question on answers (session_id, question_id);`;
