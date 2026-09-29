# 📓 NotebookLM Klon

> Eine eigenständige, voll funktionsfähige Nachbildung der Kernfunktionen von **Google NotebookLM**.

![Next.js](https://img.shields.io/badge/Next.js_API-vinext_1.0-000000?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19.3-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&logoColor=white)
![Neon](https://img.shields.io/badge/Neon-Serverless_Postgres-00E599?logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?logo=drizzle&logoColor=black)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers_·_Workflows_·_R2_·_Containers-F38020?logo=cloudflare&logoColor=white)
![Claude](https://img.shields.io/badge/Anthropic-Claude-D97757?logo=anthropic&logoColor=white)

Der NotebookLM Klon ist ein **KI-gestützter Recherche-Assistent**: Man lädt eigene Quellen hoch (PDF, Web-URLs oder Text), und die App macht daraus durchsuchbares Wissen. Darauf aufbauend lassen sich ein **RAG-Chat mit echten Quellen-Zitaten** führen, **Audio-Übersichten**, **Video-Übersichten** und strukturierte **Berichte** generieren — jeweils ausschließlich auf Basis der hochgeladenen Quellen.

---

## 🎯 Im Überblick

Ein vollständiges, realistisches Produkt — vom Datenmodell bis zum Deployment. Was das Projekt technisch ausmacht:

| Schwerpunkt                         | Wie es im Projekt sichtbar wird                                                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Echte RAG-Pipeline**              | Embeddings, Vektorsuche und quellenbelegte LLM-Antworten — keine Blackbox, sondern Zitate bis auf die Textstelle.                                                                                    |
| **Full-Stack in einer Codebase**    | Frontend, API-Routes, Server Actions, Datenbank und Cloud-Infrastruktur (Next.js App Router via vinext, React 19, TypeScript).                                                                       |
| **Edge-native Infrastruktur**       | Cloudflare Workers für App und Jobs, **Workflows** als dauerhafte Job-Engine mit Retries pro Schritt, R2-Storage, Hyperdrive vor Postgres und ein ffmpeg-**Container** — alles als Code versioniert. |
| **Durchdachtes Datenmodell**        | Relationales Schema mit Cascade-Deletes und PostgreSQL-Vektorsuche (`pgvector`) statt separater Vektor-DB.                                                                                           |
| **Nachvollziehbare Entscheidungen** | Begründungen zu Technologie- und Modellwahl sind dokumentiert ([Tech-Entscheidungen](#-tech-entscheidungen)).                                                                                        |

Als Einstieg in den Code lohnen sich [`app/api/notebooks/[notebookId]/chat/route.ts`](app/api/notebooks/%5BnotebookId%5D/chat/route.ts) (RAG + Citations), [`lib/audio.ts`](lib/audio.ts) (Skript- und TTS-Pipeline) und [`db/schema.ts`](db/schema.ts) (Datenmodell).

---

## ✨ Features

### 💬 RAG-Chat mit echten Zitaten

Fragen werden ausschließlich auf Basis der hochgeladenen Quellen beantwortet. Die Frage wird per **Voyage AI** eingebettet, die **pgvector**-Similarity-Suche holt die Top-8 relevantesten Text-Chunks, und **Claude** beantwortet sie mit **nativen Citations** (`content_block_location`). Jede Aussage ist mit einem klickbaren Beleg verknüpft, der zur exakten Originalstelle (Seite, Zeichen-Offset) springt. Die Antwort wird als **NDJSON gestreamt**.
→ [`app/api/notebooks/[notebookId]/chat/route.ts`](app/api/notebooks/%5BnotebookId%5D/chat/route.ts)

### 📥 Quellen-Ingestion (PDF · URL · Text)

- **PDF**: Upload per Stream über eine authentifizierte Route direkt ins **R2-Binding**. Die Route startet einen **Import-Workflow**, der den Text extrahiert (`unpdf`), chunkt und in Batches einbettet (jeder Batch ein eigener, wiederholbarer Schritt).
- **Web-URL**: Server-seitiges Fetchen + **Mozilla Readability** extrahiert den Haupttext (ohne Navigation/Werbung).
- **Text**: Direktes Einfügen in der App.

Der Text wird in ~3200-Zeichen-Chunks mit Overlap zerteilt, getrennt an Absatz-/Satzgrenzen.
→ [`lib/chunk.ts`](lib/chunk.ts) · [`lib/extract.ts`](lib/extract.ts)

### 🔎 Web-Quellensuche (Discover)

Claude recherchiert über das **`web_search`-Server-Tool** automatisch passende Web-Quellen zum Notebook-Thema.
→ [`app/api/notebooks/[notebookId]/discover/route.ts`](app/api/notebooks/%5BnotebookId%5D/discover/route.ts)

### 🎙️ Studio – Audio-Übersicht (KI-Podcast)

Claude generiert ein sprechbares Skript, das **Google Gemini 2.5 TTS** mit **Multi-Speaker-Stimmen** in eine WAV-Datei vertont (→ R2). Vier Formate: **Detaillierte Analyse**, **Zusammenfassung**, **Kritische Bewertung** und **Diskussion**, in zwei Längen. Die Generierung läuft **asynchron als Cloudflare Workflow** (siehe [Architektur](#-architektur)): Die Route startet nur die Instanz, das Frontend pollt den Status.
→ [`lib/audio.ts`](lib/audio.ts) · [`app/api/notebooks/[notebookId]/audio/route.ts`](app/api/notebooks/%5BnotebookId%5D/audio/route.ts)

### 🎬 Studio – Video-Übersicht (vertonte Slideshow)

Wie bei NotebookLM ist die „Video-Übersicht" **kein** echtes KI-Video, sondern eine **vertonte Slideshow**. Claude erzeugt aus den Quellen ein **strukturiertes Skript** (Folien mit Titel, Stichpunkten und Narration), **Gemini 2.5 TTS** vertont jede Folie, **Gemini 2.5 Flash Image („Nano Banana")** malt pro Folie einen passenden Hintergrund, und **ffmpeg** in einem **Cloudflare Container** brennt Titel/Stichpunkte per `drawtext` darüber und fügt alles zu einer **MP4** zusammen (→ R2). Zwei Formate (**Erklärvideo**, **Zusammenfassung**) und fünf visuelle Stile (**Automatisch, Benutzerdefiniert, Klassisch, Whiteboard, Kawaii**). Jede Folie ist ein eigener Workflow-Schritt: Ein Rate-Limit bei einer Folie wiederholt nur diese Folie.
→ [`lib/video.ts`](lib/video.ts) · [`workers/jobs/src/workflows/video.ts`](workers/jobs/src/workflows/video.ts) · [`containers/video-renderer`](containers/video-renderer)

> **Keine neuen API-Keys nötig:** Nano Banana nutzt denselben `GEMINI_API_KEY` wie die TTS-Stimmen. Der Folien-Font (Noto Sans, SIL OFL) liegt im Container-Image.

### 📄 Studio – Berichte

Vordefinierte Formate (**Überblick / Briefing**, **Lernplan** mit Glossar & Quiz, **Blogpost**) sowie frei formulierbare Reports. Dazu **KI-Formatvorschläge**: Claude analysiert die Quellen und schlägt vier passende Berichtsformate vor. Wie beim Audio läuft die Synthese **asynchron als Workflow**, lange Berichte über viele Quellen sind also nicht an einen Request gebunden.
→ [`lib/reports.ts`](lib/reports.ts)

### 🪄 Automatik

Beim ersten Hinzufügen einer Quelle leitet Claude automatisch einen **Notebook-Titel** und ein thematisch passendes **Emoji-Icon** ab.
→ [`app/api/notebooks/[notebookId]/auto-title/route.ts`](app/api/notebooks/%5BnotebookId%5D/auto-title/route.ts) · [`lib/notebookIcons.ts`](lib/notebookIcons.ts)

### 🗣️ Spracheingabe & 🔐 Auth

Browser-basiertes Diktat für Chat-Eingaben ([`lib/useDictation.ts`](lib/useDictation.ts)) und Authentifizierung über **Better Auth** mit **Google OAuth**.

---

## 🛠️ Tech-Stack

| Bereich             | Technologie                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**        | Next.js App Router auf **vinext** (Vite 8), React 19.3, TypeScript 5, SCSS-Module, Material Symbols                       |
| **Backend**         | Route Handlers & Server Actions auf Cloudflare Workers, Jobs als Cloudflare Workflows in einem eigenen Worker             |
| **Datenbank**       | PostgreSQL (Neon) über Cloudflare Hyperdrive + Drizzle ORM 0.45 + `pgvector` (1024-Dim, HNSW-Index)                       |
| **KI**              | Anthropic Claude (Chat, Berichte, Skripte) · Google Gemini 2.5 (TTS + Flash Image „Nano Banana") · Voyage AI (Embeddings) |
| **Infrastruktur**   | Cloudflare Workers, Workflows, R2 (EU), Hyperdrive, Containers (ffmpeg) · Deployment über Workers Builds                  |
| **Quellen-Parsing** | `unpdf` (PDF), `@mozilla/readability` + `linkedom` (Web)                                                                  |
| **Tooling**         | pnpm, Wrangler, ESLint 9, Prettier, 1Password CLI (Secret-Management)                                                     |

---

## 🏗️ Architektur

Zwei Worker, klar getrennt nach Aufgabe:

- **`notebooklm`** ([`wrangler.jsonc`](wrangler.jsonc)): die Web-App (vinext: SSR, React Server Components, Server Actions, API-Routes). Sie beantwortet Requests und startet Jobs, rechnet aber nie lange selbst.
- **`notebooklm-jobs`** ([`workers/jobs`](workers/jobs)): die vier Workflows (Import, Bericht, Audio, Video) und das Durable Object vor dem ffmpeg-Container. Eigene Limits (bis 5 min CPU pro Schritt) und eigene Logs.

```
Browser ──▶ Worker „notebooklm" (vinext)
               │  Hyperdrive ──▶ Postgres + pgvector
               │  R2-Binding  ──▶ Uploads, Audio, Video (Streaming mit Range-Requests)
               │  Workflow-Bindings (create / terminate)
               ▼
            Worker „notebooklm-jobs"
               │  IngestSourceWorkflow · ReportWorkflow · AudioWorkflow · VideoWorkflow
               ▼
            Container „video-renderer" (Node + ffmpeg, skaliert auf null)
```

Jede Workflow-Instanz trägt die ID ihrer DB-Zeile. So lässt sie sich im Dashboard zuordnen und beim Löschen gezielt abbrechen. Der Status in Postgres (`processing` → `ready`/`failed`) bleibt die Quelle für die UI, das Frontend pollt.

**Import einer Quelle:**

```
PUT …/sources/{id}/file ──▶ R2 ──▶ IngestSourceWorkflow
                                     ├─ extract    Text holen (unpdf), chunken, Chunks ohne Embedding speichern
                                     ├─ embed-1…n  je 100 Chunks Voyage-Embeddings nachtragen (idempotent)
                                     └─ finalize   Status ready
```

**Studio-Generierung (Bericht, Audio, Video):**

```
Klick „Erstellen" ──▶ Route legt 'processing'-Zeile an ──▶ WORKFLOW.create({ id: rowId }) ──▶ 202
                                                              │
   script      Claude (Bericht bzw. Skript)  ◀────────────────┘
   slide-1…n   Gemini TTS + Gemini Image je Folie, parallel in Gruppen (nur Video)
   render      Container: ffmpeg drawtext + concat ──▶ MP4 nach R2 (nur Video)
   save        Status ready  ◀── Frontend pollt
```

Scheitert ein Schritt nach allen Wiederholungen, setzt ein `mark-failed`-Schritt die Zeile auf `failed` mit Fehlertext.

**RAG-Chat (synchron, gestreamt):**

```
Nutzerfrage ──▶ Voyage-Embedding ──▶ pgvector Similarity-Suche (Top-8 Chunks)
                                              │
                                              ▼
                         Claude (Chunks als Documents, Citations aktiv)
                                              │
                                              ▼
                   NDJSON-Stream: Text-Deltas + Zitate ──▶ UI
```

**Ordnerstruktur:**

```
app/            App Router — Seiten, Server Actions, API-Routes (app/api/…)
components/     Wiederverwendbare React-Komponenten (je Ordner mit .module.scss)
lib/            Business-Logik — Anthropic, Voyage, Gemini, Chunking, Storage, Job-Typen
db/             Drizzle-Schema (db/schema.ts), getDb() über Hyperdrive, Migrationen
workers/jobs/   Jobs-Worker mit den Workflows und dem Container-Durable-Object
containers/     Dockerfile + Node-Server des ffmpeg-Video-Renderers
styles/         Globale SCSS-Basis (styles/globals.scss)
```

**Lokale Entwicklung:** `pnpm dev` startet App und Jobs-Worker in einem Vite-Dev-Server (Cloudflare-Vite-Plugin mit `auxiliaryWorkers`). R2, Workflows und Durable Objects laufen lokal emuliert, Hyperdrive verbindet sich direkt mit der Datenbank. Das Image des Video-Renderers baut Cloudflare beim Deploy über Workers Builds, lokales Docker ist dafür nicht nötig. Nur wer das Rendern lokal testen will, braucht Docker. Ohne Docker schlägt lokal nur dieser eine Schritt fehl.

```bash
pnpm env:pull   # Secrets aus 1Password nach .env.local
pnpm dev        # http://localhost:3000
```

---

## 🧭 Tech-Entscheidungen

Der spannendere Teil für eine Code-Beurteilung — nicht nur _was_, sondern _warum_:

| Entscheidung                                                    | Begründung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Sonnet 4.6 als Standardmodell**                        | Sonnet liefert über alle Funktionen — Chat, Berichte, Audio-Skript — die nötige Antwortqualität und Synthese über viele Quellen. Die Modelle sind über `CLAUDE_MODEL` / `CLAUDE_REPORT_MODEL` austauschbar — kein Modell ist hart verdrahtet, sodass sich bei Bedarf pro Use-Case ein günstigeres Modell setzen lässt. ([`lib/anthropic.ts`](lib/anthropic.ts))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **`pgvector` statt dedizierter Vektor-DB**                      | Eine einzige Datenquelle statt zwei Systeme synchron zu halten — weniger Infrastruktur, ACID-Garantien und Vektorsuche im selben Postgres. HNSW-Index liefert schnelle Cosine-Similarity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Neon statt Supabase als Postgres-Anbieter**                   | Das Projekt ist eine Demo und soll ohne laufende Kosten dauerhaft erreichbar sein. Beide Anbieter haben einen Gratis-Tarif mit Postgres und `pgvector`, aber Supabase pausiert kostenlose Projekte nach einer Woche ohne Aktivität, und sie müssen manuell im Dashboard reaktiviert werden. Die Demo wäre also genau dann offline, wenn sie länger niemand aufgerufen hat. Neon skaliert bei Inaktivität auf null und startet bei der nächsten Anfrage automatisch wieder (Cold Start von einigen hundert Millisekunden), ohne Workaround wie einen Ping-Cronjob. Da die App nur Postgres nutzt (Auth über Better Auth, Dateien über R2), ist der Anbieter über den Connection-String austauschbar. Grenze des Gratis-Tarifs: Sind die 100 CU-Stunden eines Monats aufgebraucht, pausiert Neon die Compute bis zum nächsten Abrechnungszeitraum. Die Daten bleiben erhalten, die Demo ist bis dahin aber offline. ([Supabase Pricing](https://supabase.com/pricing), [Neon Pricing](https://neon.com/pricing)) |
| **Native Claude Citations** statt selbstgebautem Zitat-Matching | Belege sind präzise und verifizierbar, inklusive Sprung zur exakten Originalstelle (Seite, `charStart`/`charEnd`) — statt fragiler String-Heuristiken im Nachhinein.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Cloudflare Workflows für Import & Studio-Generierung**        | PDF-Extraktion, Embeddings und Bericht-, Audio- und Video-Synthese dauern Minuten und hängen an externen APIs mit Rate-Limits. Workflows machen daraus dauerhafte Schritte: Jeder Schritt wird einzeln mit Backoff wiederholt, Zwischenergebnisse überleben Neustarts, und eine Instanz lässt sich beim Löschen abbrechen. Die Route startet nur die Instanz und antwortet sofort mit `202`. ([`workers/jobs/src/workflows`](workers/jobs/src/workflows))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **vinext statt OpenNext**                                       | vinext implementiert die Next.js-API direkt auf Vite und läuft nativ in workerd. Bindings kommen per `import { env } from "cloudflare:workers"`, ohne Adapter-Schicht über dem `next build`-Output. `vinext check` hat die App vor der Migration als 100 % kompatibel gemeldet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **`wrangler.jsonc` statt vinexts `cloudflare.config.ts`**       | vinext schlägt für neue Projekte das typisierte `cloudflare.config.ts` mit der neuen `cf`-CLI vor. Das zugrundeliegende Paket `@cloudflare/config` bezeichnet sich aber selbst als „not yet stable enough for external use — APIs may change without notice“, und die `cf`-CLI ist noch Beta. Beide Worker nutzen deshalb das stabile, vollständig dokumentierte `wrangler.jsonc`, das auch Workers Builds nativ versteht. Ein späterer Umstieg betrifft nur die Konfiguration, nicht den Code. ([`wrangler.jsonc`](wrangler.jsonc) · [`workers/jobs/wrangler.jsonc`](workers/jobs/wrangler.jsonc))                                                                                                                                                                                                                                                                                                                                                                                                            |
| **R2 nur über Bindings**                                        | Upload und Download laufen über authentifizierte Routen mit Ownership-Check. Damit gibt es keine S3-Credentials im Code, keine presigned URLs und kein Bucket-CORS. Range-Requests machen Audio und Video spulbar. ([`lib/storage.ts`](lib/storage.ts))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Hyperdrive + DB-Client pro Request**                          | Workers dürfen keine Sockets über Requests hinweg teilen. Hyperdrive übernimmt das Connection-Pooling nah an der Datenbank, deshalb kostet ein neuer postgres.js-Client pro Request kaum etwas. ([`db/index.ts`](db/index.ts))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **ffmpeg im Container**                                         | ffmpeg ist ein natives Binary und braucht ein Dateisystem, beides fehlt im Worker. Der Container rendert nur. Vertonung und Bilder entstehen vorher als Workflow-Schritte, damit sie einzeln wiederholbar sind. Nach 2 Minuten ohne Anfrage schläft er ein und kostet dann nichts. ([`containers/video-renderer`](containers/video-renderer))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Video-Übersicht als vertonte Slideshow** statt KI-Video       | Googles echtes Video-Modell (Veo) ist kostenpflichtig und liefert nur kurze Clips — kein Erklärvideo. NotebookLMs „Video-Übersicht" ist tatsächlich eine vertonte Slideshow; nachgebaut aus Bausteinen, die das Projekt schon hat (Claude-Skript + Gemini-TTS) plus Gemini-Bildern und ffmpeg. So bleibt es über den Gemini-Free-Tier praktisch kostenlos. Folientext wird bewusst per ffmpeg-`drawtext` (gestochen scharf) statt vom Bildmodell gerendert, da Bildmodelle bei präzisem Text unzuverlässig sind. ([`containers/video-renderer`](containers/video-renderer))                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Drizzle ORM**                                                 | Typsicheres Schema direkt in TypeScript, nah an SQL, mit nachvollziehbaren Migrationen statt Magie.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Better Auth**                                                 | Volle Kontrolle über das Auth-Modell und nahtlose Integration in dieselbe Drizzle/Postgres-Schicht.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **SCSS-Module statt Tailwind / CSS-in-JS**                      | Scoped Styles pro Komponente, klare Konventionen (`components/<Name>/<Name>.module.scss`), kein Utility-Class-Rauschen im Markup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **1Password CLI für Secrets**                                   | Secrets werden per `op inject` zur Laufzeit aus dem Vault geladen — kein Klartext-`.env` im Repo oder auf der Platte.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

---

## 🗃️ Datenbank-Schema

Definiert in [`db/schema.ts`](db/schema.ts) (Drizzle ORM). Kerntabellen:

| Tabelle           | Zweck                                                                           |
| ----------------- | ------------------------------------------------------------------------------- |
| `notebooks`       | Notebook-Metadaten (Titel, Emoji, Besitzer)                                     |
| `sources`         | Quellen mit Typ (`pdf`/`url`/`text`) und Status (`processing`/`ready`/`failed`) |
| `source_chunks`   | Text-Chunks mit 1024-Dim-Embedding, Seite und Zeichen-Offsets (HNSW-Index)      |
| `messages`        | Chat-Verlauf inkl. Zitate (JSONB)                                               |
| `reports`         | Generierte Berichte                                                             |
| `audio_overviews` | Audio-Übersichten (Format, Dauer, R2-Key)                                       |
| `video_overviews` | Video-Übersichten (Format, visueller Stil, Dauer, R2-Key)                       |

Dazu die Better-Auth-Tabellen (`user`, `session`, `account`, `verification`). Alle Inhalte hängen per **Cascade-Delete** am Notebook bzw. User: Wird ein User gelöscht, verschwinden Notebooks → Quellen → Chunks, Nachrichten, Berichte, Audios und Videos automatisch.

---

## 📌 Projektstatus

Ein eigenständig entwickelter Klon zur Demonstration von Full-Stack- und KI-Engineering. Es ist kein offizielles Google-Produkt und steht in keiner Verbindung zu Google — **NotebookLM** ist eine Marke von Google LLC.
