# Umstellung: Supabase → Neon (Postgres)

Stand: 29.09.2026. Umsetzung **erst nach Abschluss der Cloudflare-Migration**. Dieses Dokument beschreibt die Änderungen, umgesetzt ist davon noch nichts.

## Ausgangslage

Das alte Setup (AWS Amplify, S3, Lambda, Supabase-Datenbank) existiert nicht mehr, alle Keys sind gelöscht. Die Datenbank wird also **neu aufgesetzt**. Es gibt keine Daten zu migrieren, nur das Schema über die vorhandenen Drizzle-Migrationen (`db/migrations/`).

## Entscheidung: Neon

Die App ist ein Demo-Projekt und soll ohne laufende Kosten betrieben werden. Beide Anbieter haben einen Gratis-Tarif mit Postgres und pgvector. Den Ausschlag gibt, was bei Inaktivität passiert:

|                               | Supabase Free                                                               | Neon Free                                                                             |
| ----------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Kosten                        | kostenlos                                                                   | kostenlos, dauerhaft (kein Trial), keine Kreditkarte                                  |
| **Verhalten bei Inaktivität** | **Projekt wird nach 1 Woche pausiert**, manuelle Reaktivierung im Dashboard | Compute schläft nach 5 min ein und **wacht bei der nächsten Anfrage automatisch auf** |
| Workaround nötig              | ja (regelmäßiger Ping per Cron)                                             | nein                                                                                  |
| Speicher                      | 500 MB                                                                      | 0,5 GB pro Projekt                                                                    |
| Compute                       | geteilte CPU, 500 MB RAM                                                    | 100 CU-Stunden pro Projekt und Monat                                                  |
| pgvector                      | ja                                                                          | ja                                                                                    |
| Cloudflare Hyperdrive         | ja                                                                          | ja                                                                                    |
| Bei Überschreiten Speicher    | –                                                                           | nur Schreibzugriffe blockiert, keine Datenlöschung                                    |

Quellen (Stand 29.09.2026): [supabase.com/pricing](https://supabase.com/pricing), [neon.com/pricing](https://neon.com/pricing).

**Hauptgrund:** Neon stellt eine kostenlose Datenbank bereit, die dauerhaft erreichbar bleibt. Eine pausierte Supabase-Datenbank würde die Demo nach einer Woche ohne Besucher unbenutzbar machen, bis jemand sie manuell reaktiviert. Genau dann, wenn jemand den Demo-Link zum ersten Mal öffnet, wäre die App kaputt.

Die App nutzt keine Supabase-spezifischen Features (Auth läuft über Better Auth, Dateien über R2), sondern nur Postgres. Der Anbieterwechsel betrifft daher nur die Connection-Strings.

Nachteil: Die erste Anfrage nach einer Pause von mehr als 5 Minuten hat einen Cold Start von einigen hundert Millisekunden. Für eine Demo ist das akzeptabel.

## Vor der Umsetzung prüfen

- **Scale-to-Zero trotz Hyperdrive:** Hyperdrive hält einen eigenen Connection-Pool zur Datenbank. Ob offene, untätige Pool-Verbindungen das Einschlafen der Compute verhindern, ist weder bei Neon noch bei Cloudflare dokumentiert. Nach dem Deploy im Neon-Dashboard kontrollieren, dass die Compute bei Inaktivität tatsächlich auf „Idle“ geht. Das ist wichtig, weil 100 CU-Stunden laut Neon „enough to run a 0.25 CU compute in a project for 400 hours/month“ sind, also nicht für einen Dauerbetrieb über den ganzen Monat reichen.
- **Compute-Größe:** Autoscaling-Maximum im Free-Tarif prüfen und möglichst niedrig halten (0,25 CU), damit die CU-Stunden reichen.
- **Aufgebrauchte CU-Stunden:** Laut [Neon-Plans-Doku](https://neon.com/docs/introduction/plans) wird die Compute dann „suspended until the next billing period or until you upgrade“. Daten bleiben erhalten, die Demo ist aber bis Monatsende offline. Im README erwähnen.

## Umsetzung

### 1. Neon-Projekt anlegen – erledigt

- Im Neon-Dashboard angelegt, Region **AWS Europe Central 1 (Frankfurt)**, passend zum R2-Bucket mit `jurisdiction: "eu"`.
- Projekt-ID `dark-sky-93831582`, Branch `production`.
- Für Hyperdrive und drizzle-kit die **direkte Connection-String-Variante** verwenden: im Connect-Dialog „Connection pooling“ ausschalten, Host **ohne** `-pooler`, mit `sslmode=require`. Das Pooling übernimmt Hyperdrive ([Neon: Hyperdrive FAQ](https://neon.com/blog/hyperdrive-neon-faq): „this makes Neon's pooling unnecessary“). Migrationen brauchen ohnehin eine direkte Verbindung.

Der Agent-Prompt, den Neon nach dem Anlegen vorschlägt (`neon` CLI, `neon skills`, `neon mcp`, `neon link`, `neon.ts`, `neon deploy`), wird **nicht** gebraucht. Die App verbindet sich per Connection-String über Hyperdrive, Neon-eigene Dienste nutzt sie nicht. Zusätzlich würden `neon link` und `neon deploy` den `DATABASE_URL` samt Passwort in die eingecheckte `.env` schreiben.

### 2. Secrets in 1Password

- Eintrag `op://Development/NotebookLM/DATABASE_URL` auf den neuen Neon-Connection-String setzen.
- `.env.template` nutzt denselben Eintrag für `DATABASE_URL` (drizzle-kit) und `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` (lokales `wrangler dev`). Dort ist keine Änderung nötig.
- `pnpm env:pull` ausführen.

### 3. Schema einspielen

- `pnpm db:migrate` gegen die leere Neon-Datenbank. Die Migrationen sind neu aufgebaut: `0000_enable_pgvector` legt `CREATE EXTENSION IF NOT EXISTS vector` an (funktioniert auf Neon ohne Superuser), `0001_init` das komplette Schema.
- Laut Projektregeln erst nach Bestätigung der auszuführenden Migrationen.
- Danach prüfen: Tabellen vorhanden, HNSW-Index `source_chunks_embedding_idx` angelegt.

### 4. Hyperdrive anlegen

```sh
pnpm exec wrangler hyperdrive create notebooklm-db --connection-string="<Neon-Connection-String>"
```

Die zurückgegebene ID ersetzt den Platzhalter `HYPERDRIVE_ID` in **beiden** Konfigurationen:

- `wrangler.jsonc` (App)
- `workers/jobs/wrangler.jsonc` (Job-Worker)

### 5. Code

Es ist voraussichtlich keine Code-Änderung nötig. `db/index.ts` (`getDb()` über `env.HYPERDRIVE.connectionString`, postgres.js mit `fetch_types: false`) ist anbieterneutral. Kurz verifizieren, dass nirgends mehr `prepare: false` für den Supabase-Pooler gesetzt ist.

### 6. Doku anpassen

Supabase-Erwähnungen ersetzen. Die Rules-Dateien werden eventuell parallel durch die Cloudflare-Migration geändert, deshalb vorher den aktuellen Stand lesen.

| Datei                                   | Änderung                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/CLAUDE.md`                     | „Drizzle on Supabase Postgres/pgvector“ → Neon; bei der Hard Rule „single database (`DATABASE_URL`, Supabase)“ → Neon                    |
| `.claude/rules/datenbank.md`            | Titel und Hinweis auf den Supabase-Transaction-Pooler / `prepare: false` durch Neon + Hyperdrive ersetzen                                |
| `.claude/rules/jobs-worker.md`          | Zeile zu `prepare: false` / Supabase-Pooler entfernen bzw. an `getDb()` anpassen                                                         |
| `.claude/rules/cloudflare-migration.md` | Punkt „`prepare: false` for the Supabase pooler …“ als erledigt entfernen (oder die Rule wird ohnehin durch die Cloudflare-Rule ersetzt) |
| `README.md`                             | siehe unten                                                                                                                              |

### 7. README

**Tech-Stack-Tabelle**, Zeile Datenbank:

```md
| **Datenbank** | PostgreSQL (Neon, Anbindung über Cloudflare Hyperdrive) + Drizzle ORM + `pgvector` (1024-Dim, HNSW-Index) |
```

Optional ein Badge ergänzen, z. B. `![Neon](https://img.shields.io/badge/Neon-Serverless_Postgres-00E599?logo=postgresql&logoColor=white)`.

**Tech-Entscheidungen**, neue Zeile:

```md
| **Neon statt Supabase als Postgres-Anbieter** | Das Projekt ist eine Demo und soll ohne laufende Kosten dauerhaft erreichbar sein. Beide Anbieter haben einen Gratis-Tarif mit Postgres und `pgvector`, aber Supabase pausiert kostenlose Projekte nach einer Woche ohne Aktivität, und sie müssen manuell im Dashboard reaktiviert werden. Die Demo wäre also genau dann offline, wenn sie länger niemand aufgerufen hat. Neon skaliert bei Inaktivität auf null und startet bei der nächsten Anfrage automatisch wieder (Cold Start von einigen hundert Millisekunden), ohne Workaround wie einen Ping-Cronjob. Da die App nur Postgres nutzt (Auth über Better Auth, Dateien über R2), ist der Anbieter über den Connection-String austauschbar. ([Supabase Pricing](https://supabase.com/pricing), [Neon Pricing](https://neon.com/pricing)) |
```

## Nicht gewählt

- **Supabase Free + täglicher Ping** (Cloudflare Cron Trigger mit `SELECT 1`): funktioniert, ist aber ein Workaround mit eigenem Ausfallrisiko. Wenn der Cron ausfällt, ist die Demo nach einer Woche offline.
- **Cloudflare D1:** kostenlos und nativ, aber SQLite ohne pgvector. Das Schema müsste umgebaut und für die Embeddings zusätzlich Vectorize eingeführt werden. Für eine Demo steht der Aufwand in keinem Verhältnis.
