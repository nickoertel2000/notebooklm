# 📓 NotebookLM Klon

> Eine eigenständige, voll funktionsfähige Nachbildung der Kernfunktionen von **Google NotebookLM**.

![Next.js](https://img.shields.io/badge/Next.js-15.5-000000?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?logo=drizzle&logoColor=black)
![AWS](https://img.shields.io/badge/AWS-Amplify_·_S3_·_Lambda-FF9900?logo=amazonwebservices&logoColor=white)
![Claude](https://img.shields.io/badge/Anthropic-Claude-D97757?logo=anthropic&logoColor=white)

Der NotebookLM Klon ist ein **KI-gestützter Recherche-Assistent**: Man lädt eigene Quellen hoch (PDF, Web-URLs oder Text), und die App macht daraus durchsuchbares Wissen. Darauf aufbauend lassen sich ein **RAG-Chat mit echten Quellen-Zitaten** führen, **Audio-Übersichten** und strukturierte **Berichte** generieren — jeweils ausschließlich auf Basis der hochgeladenen Quellen.

---

## 🎯 Im Überblick

Ein vollständiges, realistisches Produkt — vom Datenmodell bis zum Deployment. Was das Projekt technisch ausmacht:

| Schwerpunkt                         | Wie es im Projekt sichtbar wird                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Echte RAG-Pipeline**              | Embeddings, Vektorsuche und quellenbelegte LLM-Antworten — keine Blackbox, sondern Zitate bis auf die Textstelle.         |
| **Full-Stack in einer Codebase**    | Frontend, API-Routes, Server Actions, Datenbank und Cloud-Infrastruktur (Next.js 15, React 19, TypeScript).               |
| **Produktionsnahe Infrastruktur**   | AWS Amplify Gen 2, S3-Storage und eine event-getriggerte Lambda für die rechenintensive Ingestion — als Code versioniert. |
| **Durchdachtes Datenmodell**        | Relationales Schema mit Cascade-Deletes und PostgreSQL-Vektorsuche (`pgvector`) statt separater Vektor-DB.                |
| **Nachvollziehbare Entscheidungen** | Begründungen zu Technologie- und Modellwahl sind dokumentiert ([Tech-Entscheidungen](#-tech-entscheidungen)).             |

Als Einstieg in den Code lohnen sich [`app/api/notebooks/[notebookId]/chat/route.ts`](app/api/notebooks/%5BnotebookId%5D/chat/route.ts) (RAG + Citations), [`lib/audio.ts`](lib/audio.ts) (Skript- und TTS-Pipeline) und [`db/schema.ts`](db/schema.ts) (Datenmodell).

---

## ✨ Features

### 💬 RAG-Chat mit echten Zitaten

Fragen werden ausschließlich auf Basis der hochgeladenen Quellen beantwortet. Die Frage wird per **Voyage AI** eingebettet, die **pgvector**-Similarity-Suche holt die Top-8 relevantesten Text-Chunks, und **Claude** beantwortet sie mit **nativen Citations** (`content_block_location`). Jede Aussage ist mit einem klickbaren Beleg verknüpft, der zur exakten Originalstelle (Seite, Zeichen-Offset) springt. Die Antwort wird als **NDJSON gestreamt**.
→ [`app/api/notebooks/[notebookId]/chat/route.ts`](app/api/notebooks/%5BnotebookId%5D/chat/route.ts)

### 📥 Quellen-Ingestion (PDF · URL · Text)

- **PDF**: Client-seitiger Upload über eine presigned S3-URL → S3-Event triggert eine **AWS Lambda**, die den Text extrahiert (`unpdf`), chunkt und einbettet.
- **Web-URL**: Server-seitiges Fetchen + **Mozilla Readability** extrahiert den Haupttext (ohne Navigation/Werbung).
- **Text**: Direktes Einfügen in der App.

Der Text wird in ~3200-Zeichen-Chunks mit Overlap zerteilt, getrennt an Absatz-/Satzgrenzen.
→ [`lib/chunk.ts`](lib/chunk.ts) · [`lib/extract.ts`](lib/extract.ts)

### 🔎 Web-Quellensuche (Discover)

Claude recherchiert über das **`web_search`-Server-Tool** automatisch passende Web-Quellen zum Notebook-Thema.
→ [`app/api/notebooks/[notebookId]/discover/route.ts`](app/api/notebooks/%5BnotebookId%5D/discover/route.ts)

### 🎙️ Studio – Audio-Übersicht (KI-Podcast)

Claude generiert ein sprechbares Skript, das **Google Gemini 2.5 TTS** mit **Multi-Speaker-Stimmen** in eine WAV-Datei vertont (→ S3). Vier Formate: **Deep Dive** (Dialog), **Brief** (Zusammenfassung), **Critique** (kritische Bewertung) und **Debate** (Streitgespräch), in zwei Längen.
→ [`lib/audio.ts`](lib/audio.ts) · [`app/api/notebooks/[notebookId]/audio/route.ts`](app/api/notebooks/%5BnotebookId%5D/audio/route.ts)

### 📄 Studio – Berichte

Vordefinierte Formate (**Überblick / Briefing**, **Lernplan** mit Glossar & Quiz, **Blogpost**) sowie frei formulierbare Reports. Dazu **KI-Formatvorschläge**: Claude analysiert die Quellen und schlägt vier passende Berichtsformate vor.
→ [`lib/reports.ts`](lib/reports.ts)

### 🪄 Automatik

Beim ersten Hinzufügen einer Quelle leitet Claude automatisch einen **Notebook-Titel** und ein thematisch passendes **Emoji-Icon** ab.
→ [`app/api/notebooks/[notebookId]/auto-title/route.ts`](app/api/notebooks/%5BnotebookId%5D/auto-title/route.ts) · [`lib/notebookIcons.ts`](lib/notebookIcons.ts)

### 🗣️ Spracheingabe & 🔐 Auth

Browser-basiertes Diktat für Chat-Eingaben ([`lib/useDictation.ts`](lib/useDictation.ts)) und Authentifizierung über **Better Auth** mit **Google OAuth**.

---

## 🛠️ Tech-Stack

| Bereich             | Technologie                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| **Frontend**        | Next.js 15.5 (App Router), React 19.2, TypeScript 5, SCSS-Module, Material Symbols                 |
| **Backend**         | Next.js API Routes & Server Actions (Node.js Runtime)                                              |
| **Datenbank**       | PostgreSQL (Supabase) + Drizzle ORM 0.45 + `pgvector` (1024-Dim, HNSW-Index)                       |
| **KI**              | Anthropic Claude (Chat, Berichte, Audio-Skript) · Google Gemini 2.5 (TTS) · Voyage AI (Embeddings) |
| **Infrastruktur**   | AWS Amplify Gen 2, S3 (Quellen & Audio), Lambda (`ingest`)                                         |
| **Quellen-Parsing** | `unpdf` (PDF), `@mozilla/readability` + `linkedom` (Web)                                           |
| **Tooling**         | pnpm, ESLint 9, Prettier, 1Password CLI (Secret-Management)                                        |

---

## 🏗️ Architektur

**Ingestion-Pipeline (asynchron):**

```
Upload (PDF/URL/Text) ──▶ S3 ──▶ Lambda (ingest) ──▶ Text-Extraktion
                                                          │
                              Voyage-Embeddings ◀── Chunking (~3200 Zeichen)
                                       │
                                       ▼
                            PostgreSQL + pgvector  (Status: processing → ready)
```

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
app/         Next.js App Router — Seiten, Server Actions, API-Routes (app/api/…)
components/  Wiederverwendbare React-Komponenten (je Ordner mit .module.scss)
lib/         Business-Logik — Anthropic, Voyage, Gemini, Chunking, Extraktion, S3
db/          Drizzle-Schema (db/schema.ts) + Migrationen
amplify/     AWS-Infrastruktur als Code — S3-Bucket + ingest-Lambda
styles/      Globale SCSS-Basis (styles/globals.scss)
```

---

## 🧭 Tech-Entscheidungen

Der spannendere Teil für eine Code-Beurteilung — nicht nur _was_, sondern _warum_:

| Entscheidung                                                    | Begründung                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Sonnet 4.6 als Standardmodell**                        | Sonnet liefert über alle Funktionen — Chat, Berichte, Audio-Skript — die nötige Antwortqualität und Synthese über viele Quellen. Die Modelle sind über `CLAUDE_MODEL` / `CLAUDE_REPORT_MODEL` austauschbar — kein Modell ist hart verdrahtet, sodass sich bei Bedarf pro Use-Case ein günstigeres Modell setzen lässt. ([`lib/anthropic.ts`](lib/anthropic.ts)) |
| **`pgvector` statt dedizierter Vektor-DB**                      | Eine einzige Datenquelle statt zwei Systeme synchron zu halten — weniger Infrastruktur, ACID-Garantien und Vektorsuche im selben Postgres. HNSW-Index liefert schnelle Cosine-Similarity.                                                                                                                                                                       |
| **Native Claude Citations** statt selbstgebautem Zitat-Matching | Belege sind präzise und verifizierbar, inklusive Sprung zur exakten Originalstelle (Seite, `charStart`/`charEnd`) — statt fragiler String-Heuristiken im Nachhinein.                                                                                                                                                                                            |
| **AWS Lambda für die Ingestion**                                | PDF-Extraktion und Embedding sind rechenintensiv und stoßweise. Per S3-Event entkoppelt belasten sie nicht den Web-Server und skalieren unabhängig.                                                                                                                                                                                                             |
| **Drizzle ORM**                                                 | Typsicheres Schema direkt in TypeScript, nah an SQL, mit nachvollziehbaren Migrationen statt Magie.                                                                                                                                                                                                                                                             |
| **Better Auth statt Amplify Auth**                              | Volle Kontrolle über das Auth-Modell und nahtlose Integration in dieselbe Drizzle/Postgres-Schicht.                                                                                                                                                                                                                                                             |
| **SCSS-Module statt Tailwind / CSS-in-JS**                      | Scoped Styles pro Komponente, klare Konventionen (`components/<Name>/<Name>.module.scss`), kein Utility-Class-Rauschen im Markup.                                                                                                                                                                                                                               |
| **1Password CLI für Secrets**                                   | Secrets werden per `op inject` zur Laufzeit aus dem Vault geladen — kein Klartext-`.env` im Repo oder auf der Platte.                                                                                                                                                                                                                                           |

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
| `audio_overviews` | Audio-Übersichten (Format, Dauer, S3-Key)                                       |

Dazu die Better-Auth-Tabellen (`user`, `session`, `account`, `verification`). Alle Inhalte hängen per **Cascade-Delete** am Notebook bzw. User: Wird ein User gelöscht, verschwinden Notebooks → Quellen → Chunks, Nachrichten, Berichte und Audios automatisch.

---

## 📌 Projektstatus

Ein eigenständig entwickelter Klon zur Demonstration von Full-Stack- und KI-Engineering. Es ist kein offizielles Google-Produkt und steht in keiner Verbindung zu Google — **NotebookLM** ist eine Marke von Google LLC.
