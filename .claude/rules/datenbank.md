---
paths:
  - "db/**"
  - "drizzle.config.ts"
  - "lib/notebooks.ts"
  - "app/api/**"
  - "app/(app)/**/page.tsx"
  - "app/(app)/actions.ts"
---

# Datenbank (Drizzle + Supabase Postgres/pgvector)

- All code (app and jobs Worker) uses `getDb()` from `@/db`: a new postgres.js client on the Hyperdrive connection string per request or Workflow step (Workers can't share sockets across requests; Hyperdrive does the pooling). Call it inside the handler after the auth check, never at module level. Prepared statements work, so no `prepare: false`.
- Everything is in one file, `db/schema.ts`. Better Auth tables (`user`, `session`, `account`, `verification`, text IDs) are managed by Better Auth — don't add app columns there without checking the Better Auth schema config in `auth.ts`.
- `drizzle.config.ts` reads `DATABASE_URL` (direct connection, no transaction pooler) from `.env.local`.

## Migrations

Flow and stop points: CLAUDE.md, "Workflow for New Features" step 2. Additionally:

- When showing the generated SQL, point out data loss: `DROP`, `DELETE`, type changes, `NOT NULL` without default on an existing table.
- Never write migration SQL by hand or edit generated files; `db/migrations/meta/` is generated. Only exception: things drizzle can't express go into an empty migration from `pnpm db:generate --custom --name <name>` (e.g. `0000_enable_pgvector.sql`, which must run before any `vector` column).
- `pnpm db:generate` asks interactively "rename or new column" → let the user decide, don't guess.
- If a `pnpm` script fails with `ERR_PNPM_IGNORED_BUILDS`, fix `allowBuilds` (see `env-und-deployment.md`); as a stopgap call the binary directly: `node node_modules/drizzle-kit/bin.cjs generate`.

## Schema conventions

- App tables: `uuid("id").defaultRandom().primaryKey()`, `timestamp("created_at").defaultNow().notNull()`. `updated_at` (only `notebooks`, `sources`) is set manually with `new Date()` on update — touching a source should also bump `notebooks.updatedAt` if the home list order matters.
- Columns snake_case in the DB, camelCase in TS.
- Status/enum values are plain `text` with a comment listing allowed values, not pg enums. Job tables use `processing | ready | failed` + `error`. Keep the comment in sync when adding values.
- All FKs `onDelete: "cascade"` from `user` → `notebooks` → content. No soft delete: deleting a notebook deletes everything, the Server Action removes the storage prefix `notebooks/{id}/` first.
- `source_chunks.notebookId` is denormalized on purpose (fast filter before vector search). `embedding` is `vector(1024)` with an HNSW index (`vector_cosine_ops`) — dimension must match `voyage-3.5` `output_dimension`.
- `messages.citations` is JSONB typed as `MessageCitation[]`.
- `DEFAULT_NOTEBOOK_TITLE` (`lib/notebookTitle.ts`) must match the column default of `notebooks.title`.

## Queries

- Select only the columns you need (`db.select({ ... })`); never return `storageKey` or other internals to the client.
- Pages load independent queries in parallel with `Promise.all` (see `notebook/[notebookId]/page.tsx`).
