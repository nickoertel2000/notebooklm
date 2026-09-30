---
paths:
  - "db/**"
  - "drizzle.config.ts"
  - "lib/notebooks.ts"
  - "app/api/**"
  - "app/(app)/**/page.tsx"
  - "app/(app)/actions.ts"
---

# Datenbank (Drizzle + Neon Postgres/pgvector über Hyperdrive)

- Aller Code (App und Jobs-Worker) verwendet `getDb()` aus `@/db`. Die Funktion ist in `cacheForRequest` (`vinext/cache`) gewickelt: Innerhalb eines Requests liefert jeder Aufruf denselben postgres.js-Client, sodass eine Seite höchstens `max: 5` Verbindungen öffnet statt einen Client pro Helper (Worker können Sockets nicht über Requests hinweg teilen; das Pooling übernimmt Hyperdrive). Außerhalb eines Request-Scopes (Workflow-Steps, Tests) erzeugt jeder Aufruf einen neuen Client. Im Handler nach der Auth-Prüfung aufrufen, nie auf Modulebene. Prepared Statements funktionieren, daher kein `prepare: false`.
- Alles steht in einer Datei, `db/schema.ts`. Die Better-Auth-Tabellen (`user`, `session`, `account`, `verification`, Text-IDs) werden von Better Auth verwaltet – keine App-Spalten dort ergänzen, ohne die Better-Auth-Schema-Konfiguration in `auth.ts` zu prüfen.
- `drizzle.config.ts` liest `DATABASE_URL` (direkte Verbindung, kein Transaction-Pooler) aus `.env.local`.

## Migrationen

Ablauf und Haltepunkte: CLAUDE.md, „Workflow for New Features“ Schritt 2. Zusätzlich:

- Beim Zeigen des generierten SQL auf Datenverlust hinweisen: `DROP`, `DELETE`, Typänderungen, `NOT NULL` ohne Default auf einer bestehenden Tabelle.
- Migration-SQL nie von Hand schreiben und generierte Dateien nie bearbeiten; `db/migrations/meta/` wird generiert. Einzige Ausnahme: Dinge, die Drizzle nicht ausdrücken kann, kommen in eine leere Migration aus `pnpm db:generate --custom --name <name>` (z. B. `0000_enable_pgvector.sql`, die vor jeder `vector`-Spalte laufen muss).
- `pnpm db:generate` fragt interaktiv „rename or new column“ → den Nutzer entscheiden lassen, nicht raten.
- Schlägt ein `pnpm`-Script mit `ERR_PNPM_IGNORED_BUILDS` fehl, `allowBuilds` korrigieren (siehe `env-und-cloudflare.md`); als Notlösung das Binary direkt aufrufen: `node node_modules/drizzle-kit/bin.cjs generate`.

## Schema-Konventionen

- App-Tabellen: `uuid("id").defaultRandom().primaryKey()`, `timestamp("created_at").defaultNow().notNull()`. `updated_at` (nur `notebooks`, `sources`) wird beim Update manuell mit `new Date()` gesetzt – wird eine Quelle angefasst, sollte auch `notebooks.updatedAt` angehoben werden, wenn die Reihenfolge der Startseiten-Liste wichtig ist.
- Spalten in der DB snake_case, in TS camelCase.
- Status-/Enum-Werte sind einfacher `text` mit einem Kommentar, der die erlaubten Werte auflistet, keine pg-Enums. Job-Tabellen verwenden `processing | ready | failed` + `error`. Den Kommentar beim Hinzufügen von Werten synchron halten.
- Alle FKs `onDelete: "cascade"` von `user` → `notebooks` → Inhalt. Kein Soft Delete: Das Löschen eines Notebooks löscht alles, die Server Action entfernt zuerst das Storage-Präfix `notebooks/{id}/`.
- `source_chunks.notebookId` ist absichtlich denormalisiert: Die Ähnlichkeitssuche filtert über `source_chunks_notebook_idx` nach Notebook und sortiert dann exakt. Einen HNSW-Index gibt es bewusst nicht: pgvector wendet das `WHERE` nach der approximativen Kandidatensuche über alle Notebooks an, und die Demo-Kopien haben identische Embeddings, sodass eine gefilterte HNSW-Suche für das eigene Notebook nichts liefern kann. Wachsen Notebooks jemals über einige zehntausend Chunks hinaus, mit `hnsw.iterative_scan` oder Partitionierung neu bewerten. `embedding` ist `vector(1024)`; die Dimension muss zu `outputDimensionality` in `lib/embeddings.ts` passen. Vektoren verschiedener Embedding-Modelle sind nicht vergleichbar: Ein Wechsel von `GEMINI_EMBEDDING_MODEL` bedeutet, alle Chunks neu einzubetten (eine Datenänderung, braucht Freigabe).
- `reports` speichert auch die Lernformate des Studios (`type` = `flashcards | quiz | table | mindmap` aus `lib/studio.ts`); dort ist `content` JSON, kein Markdown. Vor der Behandlung von `content` als Markdown `getStudioFormat(type)` prüfen. So decken Liste, Polling, Löschen, Stale Healing und der Demo-Klon sie ohne zusätzliche Tabellen ab.
- `messages.citations` ist JSONB mit dem Typ `MessageCitation[]`. Ein zusätzliches Feld dort braucht keine Migration, aber alte Zeilen haben es nicht.
- Jede Fremdschlüsselspalte, nach der gefiltert oder kaskadiert wird, hat einen Index; nach Datum sortierte Listen-Tabellen bekommen `(notebook_id, created_at)`. Neue Tabellen folgen dem.
- `usage_events` speist nur die Kontingente (`lib/quota.ts`); der tägliche Cron des Jobs-Workers löscht Zeilen, die älter als zwei Tage sind.
- `DEFAULT_NOTEBOOK_TITLE` (`lib/notebookTitle.ts`) muss zum Spalten-Default von `notebooks.title` passen.

## Queries

- Nur die benötigten Spalten auswählen (`db.select({ ... })`); `storageKey` oder andere Interna nie an den Client zurückgeben.
- Seiten laden unabhängige Queries parallel mit `Promise.all` (siehe `notebook/[notebookId]/page.tsx`).
