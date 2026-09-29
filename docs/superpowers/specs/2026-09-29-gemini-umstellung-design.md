# Design: Umstellung auf Gemini (kostenloser Demo-Betrieb)

Stand: 29.09.2026. Grundlage ist [`docs/umstellung-gemini.md`](../../umstellung-gemini.md). Dieses Dokument hält fest, was davon gilt, was abweicht und was neu dazukommt.

## Ziel

Die App läuft als öffentliche Demo **ohne laufende Kosten und ohne Prepay-Guthaben**. Anthropic und Voyage AI entfallen komplett. Für Text, Embeddings und Sprache bleibt ein einziger KI-Key (`GEMINI_API_KEY`, Gemini-Gratis-Tarif). Die Folienbilder der Video-Übersicht kommen aus Workers AI (Cloudflare) im täglichen Gratis-Kontingent.

Erfolg heißt: Alle bisherigen Funktionen (Quellen-Ingestion, RAG-Chat mit Zitaten, Discover, Auto-Titel mit Icon, Formatvorschläge, Bericht, Audio-, Video-Übersicht mit Folienbildern) funktionieren, und es entstehen weder bei Google noch bei Cloudflare zusätzliche Kosten (Workers Paid läuft ohnehin).

## Entscheidungen

| Thema               | Entscheidung                                                                                                                                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text-Modelle        | `gemini-3.8-flash` für `GEMINI_CHAT_MODEL` und `GEMINI_REPORT_MODEL` (stabil, gratis)                                                                                                                                                                                                                                                  |
| Embeddings          | `gemini-embedding-2`, 1024 Dimensionen. Die Google-Doku nennt teils `gemini-embedding-2-preview`, die gültige ID wird vor der Umsetzung per `models.list` geprüft.                                                                                                                                                                     |
| TTS                 | `gemini-3.8-flash-tts` (stabil, gratis). `gemini-2.5-flash-preview-tts` ist laut Google nur noch für Bestandsprojekte zugänglich.                                                                                                                                                                                                      |
| Folienbilder        | Workers AI `@cf/black-forest-labs/flux-2-klein-4b` statt Gemini-Bildmodell. Kein Gemini-Bildmodell hat einen Gratis-Tarif, und Billing an einem Google-Projekt macht **alle** Aufrufe dieses Projekts kostenpflichtig (Prepay, mindestens 5 $, Verfall nach 12 Monaten).                                                               |
| Kostenschutz Bilder | Tagesgrenze `IMAGE_DAILY_LIMIT` (Standard 100 Bilder, UTC-Tag). Das Gratis-Kontingent von 10.000 Neuronen pro Tag reicht für ca. 125 Bilder, die Differenz fängt Workflow-Wiederholungen ab.                                                                                                                                           |
| Zitate im Chat      | Wie im originalen NotebookLM: runde Nummern-Chips inline im Antworttext, pro Antwort ab 1 in Reihenfolge des Auftretens nummeriert, Hover zeigt Quelle und Textstelle, Klick fokussiert die Quelle. Die Chip-Liste unter der Antwort entfällt.                                                                                         |
| Abhängigkeit        | `@anthropic-ai/sdk` wird entfernt (freigegeben). Kein neues Paket.                                                                                                                                                                                                                                                                     |
| Datenschutz-Hinweis | Anders als in `docs/umstellung-gemini.md` angenommen: Für Nutzer im EWR, in der Schweiz und im UK gelten laut Gemini-API-Bedingungen die Datenregeln des Bezahl-Tarifs auch für den Gratis-Tarif. Google nutzt die Eingaben dort nicht zur Produktverbesserung. README und `docs/umstellung-gemini.md` werden entsprechend korrigiert. |
| Datenbank           | Keine Migration. Die Neon-Datenbank enthält noch keine eingebetteten Quellen, ein Neu-Einbetten entfällt. Einzige Schema-Änderung ist das zusätzliche Feld `marker` im TypeScript-Typ `MessageCitation` (JSON in `messages.citations`, kein SQL).                                                                                      |

## Komponenten

### 1. `lib/gemini.ts`: Text, TTS

- `chatModel()` / `reportModel()` lesen `env.GEMINI_CHAT_MODEL` / `env.GEMINI_REPORT_MODEL`, innerhalb der Funktion (nicht beim Modul-Laden).
- `generateText({ model, system, prompt, maxOutputTokens, minimalThinking? }): Promise<string>` über den bestehenden Lazy-Client `getGemini()`. Liefert `response.text` getrimmt. Ist `minimalThinking` gesetzt, wird `thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }` übergeben.
- **Falle:** Gemini-3-Modelle denken, Denk-Tokens zählen gegen `maxOutputTokens`. Auto-Titel (40 Tokens) und Icon-Auswahl (8 Tokens) nutzen deshalb `minimalThinking` und bekommen zusätzlich ein großzügigeres Budget (Titel 200, Icon 50). Die Parser schneiden ohnehin zu.
- `synthesizeSpeech` bleibt, nur die Modell-Variable wechselt.
- `generateImage` wird aus `lib/gemini.ts` entfernt (siehe 7).
- `lib/anthropic.ts` und `joinText` in `workers/jobs/src/workflows/shared.ts` werden gelöscht.

### 2. `lib/embeddings.ts` (ersetzt `lib/voyage.ts`)

- Gleiche Signaturen: `embedTexts(texts, inputType: "document" | "query"): Promise<number[][]>` und `embedQuery(text)`. Aufrufer tauschen nur den Import.
- Modell aus `env.GEMINI_EMBEDDING_MODEL`, `outputDimensionality: 1024`.
- Embedding 2 kennt kein `taskType`, der Zweck steht als Präfix im Text: Suchanfrage `task: search result | query: {text}`, Dokument `title: none | text: {text}`. (Falls die Prüfung ergibt, dass nur `gemini-embedding-001` verfügbar ist: `taskType: RETRIEVAL_QUERY` / `RETRIEVAL_DOCUMENT` statt Präfix.)
- **Falle:** `contents: string[]` liefert **einen** zusammengefassten Vektor. Jeder Text wird als eigenes `Content`-Objekt (`{ parts: [{ text }] }`) übergeben. Anzahl und Reihenfolge der zurückgegebenen Vektoren werden geprüft, bei Abweichung wird ein Fehler geworfen (der Workflow-Step wiederholt dann).
- Keine manuelle Normalisierung: `cosineDistance` (pgvector `vector_cosine_ops`) ist unabhängig von der Vektorlänge.
- Batchgröße bleibt 100 (`IngestSourceWorkflow`).

### 3. Chat-Route (`app/api/notebooks/[notebookId]/chat/route.ts`)

- Retrieval unverändert (`embedQuery` → `cosineDistance`, Top 8, nur `status = "ready"`, optional gefiltert nach `sourceIds`).
- Der letzte User-Turn enthält die Chunks nummeriert: `[1] Quellentitel\n<Chunk-Text>`, getrennt durch Leerzeilen, danach die Frage. Die Reihenfolge von `retrieved` bleibt bis zur Zuordnung unverändert.
- System-Prompt: jede Aussage mit `[n]` belegen, mehrere Belege als `[1][3]`, keine Nummern erfinden, bei fehlender Grundlage offen sagen.
- Verlauf: `role: "assistant"` → `role: "model"`, Inhalte als `parts: [{ text }]`.
- Streaming über `generateContentStream`. Die NDJSON-Events (`text`, `done`, `error`) bleiben identisch.
- `extractCitations(fullText, retrieved)`: alle Marker per Regex (`[n]`, auch `[n, m]`) in Reihenfolge des Auftretens lesen, auf `retrieved[n - 1]` abbilden, ungültige Nummern ignorieren, Duplikate pro Chunk zusammenfassen.
- `MessageCitation` bekommt das Feld `marker: number` (die Nummer `n` aus dem Text). `snippet` = Anfang des Chunk-Textes, 240 Zeichen, an Wortgrenze gekürzt, mit „…“.

### 4. Frontend: `components/CitedMarkdown/`

- Neue Komponente `CitedMarkdown` (`CitedMarkdown.tsx` + `CitedMarkdown.module.scss`), nutzt intern die bestehende `Markdown`-Komponente. `NotebookView.tsx` wächst dadurch kaum.
- Die Marker werden vor dem Rendern in Markdown-Links auf ein internes Schema umgeschrieben (z. B. `[1](#cite-1)`), ein eigener `a`-Renderer macht daraus Chips. Code-Blöcke bleiben unberührt.
- Anzeigenummer: pro Antwort ab 1 in Reihenfolge des ersten Auftretens eines Markers. Gleicher Marker = gleiche Nummer.
- Während des Streamings sind die Chips sichtbar, aber inaktiv. Nach `done` (Zitate liegen vor) zeigen sie beim Hover ein Popover mit Quellentitel und Snippet, der Klick ruft das bestehende `focusCitation`. Marker ohne passendes Zitat werden als schlichter Text angezeigt.
- Die Chip-Liste und der Snippet-Absatz unter der Antwort entfallen, ebenso der State `openCitation`, sofern er sonst nirgends gebraucht wird.
- Styling mit den vorhandenen Tokens (`--surface`, `--text-muted`, `--accent`, `--radius-*`), keine neuen Hex-Werte.

### 5. Discover (`app/api/notebooks/[notebookId]/discover/route.ts`)

- Gemini mit Tool `googleSearch` statt Claude-`web_search`. `depth: "deep"` steuert nur noch den Prompt (mehr und breitere Suchen). Höchstens 8 Treffer wie bisher.
- Die Grounding-Metadaten (`groundingChunks[].web.uri`) sind im Gemini-API Weiterleitungs-URLs. Sie werden per `fetch(uri, { method: "HEAD", redirect: "manual" })` über den `Location`-Header aufgelöst (parallel, mit Timeout).
- Ergebnis: Das JSON-Array aus dem Modelltext (`extractResults` bleibt) wird gegen die aufgelösten Grounding-URLs abgeglichen. Nur Treffer, deren Host in den Grounding-Quellen vorkommt, bleiben. Liefert das Modell kein brauchbares JSON, werden die Treffer direkt aus den aufgelösten Grounding-URLs gebaut (Titel aus `web.title`, leere Beschreibung).
- Gratis-Kontingent: 5.000 Grounding-Anfragen pro Monat.

### 6. Einfache Aufrufe

Überall `getAnthropic().messages.create(...)` → `generateText(...)`. Die Parser bleiben unverändert.

| Stelle                             | Modell          | Besonderheit                      |
| ---------------------------------- | --------------- | --------------------------------- |
| `auto-title`-Route                 | `chatModel()`   | `minimalThinking`, Budget 200     |
| `lib/notebookIcons.ts`             | `chatModel()`   | `minimalThinking`, Budget 50      |
| `report-suggestions`-Route         | `reportModel()` |                                   |
| `ReportWorkflow` (Step `generate`) | `reportModel()` |                                   |
| `AudioWorkflow` (Step `script`)    | `reportModel()` |                                   |
| `VideoWorkflow` (Step `script`)    | `reportModel()` | Parser kappt künftig bei 8 Folien |

### 7. Folienbilder über Workers AI

- `workers/jobs/wrangler.jsonc`: Binding `"ai": { "binding": "AI" }`, Variablen `IMAGE_MODEL` (`@cf/black-forest-labs/flux-2-klein-4b`) und `IMAGE_DAILY_LIMIT` (`"100"`). `GEMINI_IMAGE_MODEL` entfällt.
- Neue Funktion `generateSlideImage(ai, model, prompt): Promise<Buffer>` in einer eigenen Datei im Jobs-Worker (z. B. `workers/jobs/src/images.ts`, da nur dort das `AI`-Binding existiert). FLUX.2 erwartet Multipart-Formdaten: `prompt`, `width=1024`, `height=576`. Der Body wird über `new Response(form)` serialisiert und an `env.AI.run(model, { multipart: { body, contentType } })` übergeben. Die Antwort (Base64-Bild) wird zu Bytes dekodiert. ffmpeg skaliert wie bisher auf 1280×720.
- `buildSlideImagePrompt` in `lib/video.ts` bleibt (englische Prompts passen zu FLUX).
- **Tagesgrenze:** Neuer Step `image-budget` in `VideoWorkflow` nach `script` (als Step, damit die Entscheidung beim Replay stabil bleibt). Er zählt die `video_overviews`, die am aktuellen UTC-Tag angelegt wurden, ohne die aktuelle. Gilt `bisherige × 8 + aktuelle Folienzahl > IMAGE_DAILY_LIMIT`, erzeugt dieses Video keine Bilder, und alle Folien bekommen den einfarbigen Hintergrund. Die Konstante `MAX_SLIDES = 8` wird in `lib/video.ts` definiert und auch von `parseVideoScript` genutzt.
- Fehlerfall wie bisher: Schlägt ein einzelnes Bild fehl, wird das geloggt, und die Folie bekommt den einfarbigen Hintergrund.
- `pnpm dev`: Das `AI`-Binding läuft auch lokal gegen Cloudflare und verbraucht dasselbe Kontingent. Das wird in `.claude/rules/env-und-cloudflare.md` vermerkt.

### 8. Env, Secrets, Konfiguration

- `wrangler.jsonc` (App): `CLAUDE_*` raus. Neu `GEMINI_CHAT_MODEL`, `GEMINI_REPORT_MODEL`, `GEMINI_EMBEDDING_MODEL`. `secrets.required`: `ANTHROPIC_API_KEY` und `VOYAGE_API_KEY` raus, `GEMINI_API_KEY` rein.
- `workers/jobs/wrangler.jsonc`: `CLAUDE_*` und `GEMINI_IMAGE_MODEL` raus. Neu `GEMINI_REPORT_MODEL`, `GEMINI_EMBEDDING_MODEL`, `IMAGE_MODEL`, `IMAGE_DAILY_LIMIT`, `GEMINI_TTS_MODEL` auf `gemini-3.8-flash-tts`, AI-Binding. `secrets.required`: nur noch `GEMINI_API_KEY`.
- `scripts/cf.mjs`: Secret-Listen entsprechend.
- `.env.template`: keine Anthropic-/Voyage-Einträge vorhanden, nur der Kommentar zu `GEMINI_API_KEY` wird aktualisiert (Gratis-Tarif für alles, kein Billing).
- Danach `pnpm cf-typegen`.
- `package.json`: `@anthropic-ai/sdk` entfernen, `pnpm install`.

### 9. Doku

- `.claude/CLAUDE.md`: KI-Zeile, Liste der server-only Module (`lib/anthropic.ts`, `lib/voyage.ts` raus, `lib/embeddings.ts` rein).
- `.claude/rules/api-routes.md`: Chat (nummerierte Marker, `marker`-Feld), Discover (Google-Search-Grounding, Auflösen der Weiterleitungs-URLs).
- `.claude/rules/datenbank.md`: Dimension muss zu `GEMINI_EMBEDDING_MODEL` / `outputDimensionality` passen.
- `.claude/rules/jobs-worker.md`: Modell-Variablen, Workers AI für Bilder, Tagesgrenze, `paths:` anpassen.
- `.claude/rules/env-und-cloudflare.md`: `paths:`, Beispiele (`getAnthropic()` → `getGemini()`), AI-Binding in `pnpm dev`.
- `lib/video.ts`: Kopfkommentar (Claude → Gemini, Gemini Image → Workers AI).
- `README.md`: Badges, Feature-Text Chat, Tech-Stack, Architektur-Skizzen, Tech-Entscheidungen (Bausteine aus `docs/umstellung-gemini.md`, ergänzt um Workers AI für Folienbilder und den korrigierten Datenschutz-Hinweis).
- `docs/umstellung-gemini.md`: Status „umgesetzt“, Abweichungen verlinken auf diese Spec. `docs/todo.md`: Hinweis auf die spätere Umstellung und die Secret-Listen anpassen.

## Fehlerbehandlung

- Gemini-Fehler in Workflows (Rate-Limit 429, 5xx) → Exception, der Step wiederholt sich (`API_STEP`: 3 Versuche, exponentieller Backoff). Unverändert.
- Chat: Fehler im Stream → Event `error` wie bisher.
- Discover und Formatvorschläge: Fehler → leere Liste bzw. 500 wie bisher.
- Embeddings: falsche Anzahl Vektoren → Fehler, Step wiederholt sich.
- Bilder: Einzelfehler und Tagesgrenze → einfarbiger Hintergrund, das Video wird trotzdem fertig.

## Verifikation

1. `pnpm lint`, `pnpm typecheck` ohne Fehler.
2. Modell-IDs mit dem echten Key prüfen (`models.list`), bevor die Variablen final gesetzt werden.
3. `pnpm dev`: PDF-, URL- und Text-Quelle hochladen → `ready`, Embeddings gesetzt.
4. Chat: Antwort streamt, Chips erscheinen inline, nach `done` zeigen sie beim Hover die richtige Textstelle, Klick fokussiert die richtige Quelle. Frage ohne Grundlage → offene Antwort ohne Marker.
5. Discover normal und „deep“: echte, erreichbare Original-URLs.
6. Auto-Titel mit Icon, Formatvorschläge, ein Bericht, eine Audio-Übersicht (Dialog, 2 Sprecher), eine Video-Übersicht mit Folienbildern (lokal nur mit Docker, sonst nach dem Deploy).
7. `grep -riE "anthropic|voyage|claude_"` über Code und Config → nur noch Treffer in README, `docs/` und `.claude/` (Hooks, `CLAUDE_PROJECT_DIR`).

## Manuelle Schritte

- Prüfen, ob der `GEMINI_API_KEY` in 1Password zu einem Projekt im **Gratis-Tarif** gehört ([aistudio.google.com/api-keys](https://aistudio.google.com/api-keys)).
- Nach dem Deploy: `pnpm cf:secrets`, damit die entfernten Secrets nicht mehr verlangt werden bzw. `GEMINI_API_KEY` auch in der App gesetzt ist.
- Optional: `ANTHROPIC_API_KEY` und `VOYAGE_API_KEY` in 1Password entfernen.

## Außerhalb des Umfangs

- Scrollen und Hervorheben der Textstelle im Quellen-Viewer beim Klick auf ein Zitat (heute wird nur die Quelle fokussiert).
- Strukturierte Ausgabe (`responseSchema`) für Video-Skript und Vorschläge.
- Neuorganisation der Env-Dateien (eigener Punkt in `docs/todo.md`).
