# Umstellung: Claude + Voyage → Gemini

Stand: 29.09.2026. **Umgesetzt** auf Branch `feat/cloudflare-migration`. Die finale Fassung mit allen Abweichungen steht in [`superpowers/specs/2026-09-29-gemini-umstellung-design.md`](superpowers/specs/2026-09-29-gemini-umstellung-design.md), die wichtigsten:

- Folienbilder kommen aus Workers AI (FLUX.2 klein) statt Gemini: Kein Gemini-Bildmodell hat einen Gratis-Tarif, und Billing an einem Google-Projekt macht jeden Aufruf des Projekts kostenpflichtig. Eine Tagesgrenze (`IMAGE_DAILY_LIMIT`) hält die Bilder im Gratis-Kontingent.
- Zitate erscheinen wie in NotebookLM als Chips im Antworttext, die Liste unter der Antwort entfällt.
- Der Datenschutz-Hinweis unten ist überholt: Für Nutzer im EWR, in der Schweiz und im UK nutzt Google die Eingaben auch im Gratis-Tarif nicht zur Produktverbesserung.

Der Rest dieses Dokuments ist der ursprüngliche Plan.

## Ziel

Die App ist ein Demo-Projekt und soll ohne laufende Kosten betrieben werden. Heute verursachen zwei Anbieter Kosten bzw. setzen eine Kreditkarte voraus:

| Anbieter  | Nutzung                                                    | Problem im Demo-Betrieb                                                                                                                           |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anthropic | Chat, Berichte, Skripte, Discover, Titel, Icon, Vorschläge | Kostenpflichtig                                                                                                                                   |
| Voyage AI | Embeddings (`voyage-3.5`, 1024 Dim.)                       | 200 Mio. Tokens gratis, aber einmalig; ohne hinterlegte Zahlungsmethode nur 3 Requests/min und 10K Tokens/min – reicht nicht für Chat + Ingestion |

Gemini ist bereits für TTS und Folienbilder im Einsatz und hat einen dauerhaften Gratis-Tarif ohne Kreditkarte. Nach der Umstellung braucht die App nur noch **einen KI-Key: `GEMINI_API_KEY`**.

Einschränkung des Gratis-Tarifs: Google darf Eingaben zur Produktverbesserung verwenden. Für eine Demo mit öffentlichen Dokumenten unkritisch, sollte aber im README/Login-Hinweis stehen.

## Modelle

Alle Modell-IDs als `vars` in `wrangler.jsonc` (App) bzw. `workers/jobs/wrangler.jsonc` (Worker), gelesen über `env` wie heute `chatModel()` / `reportModel()` in `lib/anthropic.ts`. Nie im Code hartkodieren.

| Zweck                                               | Variable                 | Wert                 |
| --------------------------------------------------- | ------------------------ | -------------------- |
| Chat, Auto-Titel, Icon                              | `GEMINI_CHAT_MODEL`      | `gemini-3.8-flash`   |
| Berichte, Audio-/Video-Skript, Vorschläge, Discover | `GEMINI_REPORT_MODEL`    | `gemini-3.8-flash`   |
| Embeddings                                          | `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-2` |

Vor der Umsetzung prüfen:

- **Exakte Modell-IDs** in AI Studio – die Google-Doku nennt das Embedding-Modell teils `gemini-embedding-2`, teils `gemini-embedding-2-preview`.
- **Gratis-Limits** (RPM, TPM, RPD pro Modell) stehen nur in AI Studio, nicht in der Doku. Besonders relevant für die Video-Übersicht (viele parallele TTS-/Bild-Aufrufe → `VIDEO_SLIDE_CONCURRENCY`).
- **TTS/Bild:** Die 2.5-Modelle (`gemini-2.5-flash-preview-tts`, `gemini-2.5-flash-image`) sind laut Google nur noch für Bestandsprojekte zugänglich. Nachfolger testen: `gemini-3.8-flash-tts`, `gemini-3.1-flash-image`.

## Änderungen

### `lib/gemini.ts` – Textgenerierung

- `chatModel()` / `reportModel()` analog zu `lib/anthropic.ts`, aber aus `GEMINI_CHAT_MODEL` / `GEMINI_REPORT_MODEL`.
- Kleiner Helfer `generateText({ model, system, prompt, maxOutputTokens })` → `Promise<string>`, über den bestehenden Lazy-Client `getGemini()`. Ersetzt das an allen Aufrufstellen wiederholte Muster `message.content.map((b) => (b.type === "text" ? b.text : "")).join("")` und den Helfer `joinText` in `workers/jobs/src/workflows/shared.ts`.
- **Falle:** Gemini-3-Modelle „denken“, und Denk-Tokens zählen gegen `maxOutputTokens`. Bei kleinen Budgets (Auto-Titel: 40 Tokens, Icon-Auswahl) kommt sonst eine leere Antwort zurück. Dort Thinking auf minimal/niedrig stellen oder das Budget erhöhen.

### `lib/voyage.ts` → `lib/embeddings.ts`

- **Gleiche Signaturen** behalten: `embedTexts(texts, inputType: "document" | "query")` und `embedQuery(text)`. Aufrufer (Chat-Route, `IngestSourceWorkflow`) tauschen nur den Import.
- `outputDimensionality: 1024` → DB-Spalte `vector(1024)` und HNSW-Index bleiben unverändert.
- Task-Typ für Dokument vs. Suchanfrage setzen (Retrieval-Dokument / Retrieval-Query – genaue Parameter für Embedding 2 in der Doku prüfen).
- Batches wie bisher (100 pro Aufruf), Reihenfolge der Vektoren muss der Eingabe entsprechen.
- Normalisierung: Embedding 2 normalisiert gekürzte Dimensionen selbst. Falls doch `gemini-embedding-001`, Vektoren manuell normalisieren (nur 3072 Dim. sind dort vornormalisiert).
- Max. 8.192 Tokens pro Eingabe – die Chunks (3.200 Zeichen) liegen weit darunter.

### Chat-Route (`app/api/notebooks/[notebookId]/chat/route.ts`)

Größte Änderung, weil Gemini keine nativen Zitate für eigene Dokumente hat.

- Retrieval bleibt gleich (`embedQuery` → `cosineDistance` Top-8).
- Die Chunks werden **nummeriert** in den Prompt geschrieben (`[1] Quellentitel\nText …`), der System-Prompt verlangt, jede Aussage mit `[n]` zu belegen.
- Streaming über `generateContentStream`, die NDJSON-Events (`text`, `done`, `error`) bleiben identisch.
- `extractCitations` neu: nach Stream-Ende alle `[n]`-Marker aus `fullText` lesen, `retrieved[n - 1]` zuordnen, Duplikate zusammenfassen, ungültige Nummern ignorieren. Die Reihenfolge von `retrieved` darf zwischen Prompt-Aufbau und Zuordnung nicht geändert werden.
- `snippet`: Es gibt kein `cited_text` mehr → Anfang des Chunk-Textes (z. B. 240 Zeichen, an Wortgrenze gekürzt).
- `MessageCitation` und das Stream-Format bleiben gleich → **keine Änderung** an `NotebookView.tsx` und an `messages.citations`. Die `[n]`-Marker bleiben als Text in der Antwort sichtbar (wie bei NotebookLM).
- Verlauf: `role: "assistant"` → Gemini erwartet `role: "model"`.

### Discover (`app/api/notebooks/[notebookId]/discover/route.ts`)

- Claude-Tool `web_search_20250305` → Gemini-Tool **Grounding with Google Search**. Die Tiefe (`maxUses` 3 / 8) hat kein direktes Gegenstück – über den Prompt steuern oder weglassen.
- URLs bevorzugt aus den **Grounding-Metadaten** nehmen, nicht aus dem Modelltext (vermeidet erfundene URLs). Prüfen, ob die Metadaten Weiterleitungs-URLs statt Original-URLs liefern – dann auflösen oder die URL aus dem Text nehmen und gegen die Metadaten abgleichen.
- `extractResults` bleibt als Parser/Fallback, der Prompt verlangt weiter „nur ein JSON-Array“.

### Einfache Aufrufe

Überall gleiches Muster: `getAnthropic().messages.create(...)` → `generateText(...)`, `max_tokens` → `maxOutputTokens`, `system` bleibt. Die Parser bleiben unverändert.

| Stelle                             | Modell          | Parser                         |
| ---------------------------------- | --------------- | ------------------------------ |
| `auto-title`-Route                 | `chatModel()`   | erste nichtleere Zeile         |
| `lib/notebookIcons.ts`             | `chatModel()`   | –                              |
| `report-suggestions`-Route         | `reportModel()` | `parseSuggestions`             |
| `ReportWorkflow` (Step `generate`) | `reportModel()` | `deriveReportTitle`            |
| `AudioWorkflow` (Step `script`)    | `reportModel()` | `parseScript` (`TITEL:`-Zeile) |
| `VideoWorkflow` (Step `script`)    | `reportModel()` | `parseVideoScript`             |

Optional: Für Video-Skript und Vorschläge `responseMimeType: "application/json"` mit `responseSchema` nutzen – robuster als das Herausparsen aus Freitext.

### Env und Secrets

- Entfernen: `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `CLAUDE_MODEL`, `CLAUDE_REPORT_MODEL` aus `.env.template`, `wrangler.jsonc`, `workers/jobs/wrangler.jsonc` (`vars` und `secrets.required`) und der Secret-Liste in `scripts/cf-secrets.mjs`.
- `GEMINI_API_KEY` in `wrangler.jsonc` (App) zu `secrets.required` hinzufügen – bisher braucht nur der Worker den Key, künftig auch Chat, Discover, Titel und Vorschläge.
- Neue `vars`: `GEMINI_CHAT_MODEL`, `GEMINI_REPORT_MODEL`, `GEMINI_EMBEDDING_MODEL` (App und Worker, soweit genutzt).
- Danach `pnpm cf-typegen`, damit die `worker-configuration.d.ts`-Dateien die neuen Variablen kennen.
- `lib/anthropic.ts` und `lib/voyage.ts` löschen.

### Abhängigkeit

`@anthropic-ai/sdk` aus `package.json` entfernen – **nur nach Rückfrage** (Hard Rule in `CLAUDE.md`). `@google/genai` ist bereits installiert.

### Datenbank

- Schema bleibt unverändert, keine Migration.
- Die neue Neon-Datenbank startet leer. Wird vor dem ersten Import umgestellt, entfällt das Neu-Einbetten. Sonst gilt: **Alle vorhandenen Chunks müssen neu eingebettet werden** – Vektoren verschiedener Modelle sind nicht vergleichbar, eine Suche über gemischte Vektoren liefert Unsinn.
- Weg A: Skript, das `source_chunks` batchweise liest, mit `embedTexts(..., "document")` neu einbettet und `embedding` aktualisiert. Das ist eine Datenänderung an der Produktions-DB → Statement vorher zeigen und ausdrücklich freigeben lassen.
- Weg B (einfacher bei wenigen Demo-Notebooks): Quellen löschen und neu hochladen.

### Doku nachziehen

- `.claude/CLAUDE.md`: KI-Zeile (Gemini für alles), Liste der server-only Module (`lib/anthropic.ts`, `lib/voyage.ts` → `lib/embeddings.ts`).
- `.claude/rules/api-routes.md`: Abschnitte „Chat“ (nummerierte Marker statt `document`-Blöcke) und „Web tools“.
- `.claude/rules/datenbank.md`: Dimension muss zu `GEMINI_EMBEDDING_MODEL` / `outputDimensionality` passen.
- `.claude/rules/jobs-worker.md` und die Cloudflare-Env-Regel: Modell-Variablen.
- README: siehe unten.

## Verifikation

1. `pnpm lint` und `pnpm typecheck` ohne Fehler.
2. Neue PDF- und URL-Quelle hochladen → Status `ready`, Chunks haben Embeddings.
3. Chat-Frage stellen → Antwort streamt, `[n]`-Marker passen zu den Zitat-Karten, Klick springt zur richtigen Stelle. Frage ohne Antwort in den Quellen → Modell sagt das offen.
4. Discover (normal und „deep“), Auto-Titel mit Icon, Formatvorschläge, je ein Bericht, eine Audio- und eine Video-Übersicht durchspielen.
5. `grep -riE "anthropic|voyage"` über Code und Config → nur noch Treffer in README und diesem Dokument.

---

## README-Textbausteine

Zum Einfügen in `README.md`. Die Begründungen richten sich an Leser, die das Projekt beurteilen: Die Modellwahl ist eine bewusste Kostenentscheidung, keine Qualitätsentscheidung.

### Badge

Anthropic-Badge ersetzen durch:

```markdown
![Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?logo=googlegemini&logoColor=white)
```

### Feature „RAG-Chat mit echten Zitaten“

```markdown
Fragen werden ausschließlich auf Basis der hochgeladenen Quellen beantwortet. Die Frage wird mit **Gemini Embedding** eingebettet, die **pgvector**-Similarity-Suche holt die Top-8 relevantesten Text-Chunks, und **Gemini** beantwortet sie mit nummerierten Quellenverweisen (`[1]`, `[2]` …). Die Verweise werden serverseitig den abgerufenen Chunks zugeordnet – jede Aussage ist mit einem klickbaren Beleg verknüpft, der zur Originalstelle springt. Die Antwort wird als **NDJSON gestreamt**.
```

### Tech-Stack, Zeile „KI“

```markdown
| **KI** | Google Gemini – Chat, Berichte, Skripte, Websuche (Flash), Embeddings (Gemini Embedding 2), TTS und Folienbilder |
```

### Tech-Entscheidungen

Ersetzt die Zeilen „Claude Sonnet 4.6 als Standardmodell“ und „Native Claude Citations“:

```markdown
| **Gemini statt Claude im Demo-Betrieb** | Das Projekt ist eine Demo und soll ohne laufende Kosten öffentlich erreichbar bleiben. Gemini bietet einen dauerhaften Gratis-Tarif ohne Kreditkarte und deckt mit einem einzigen Key alles ab – Text, Embeddings, Sprache und Bilder. Entwickelt wurde die App ursprünglich mit **Claude Sonnet** und dessen **nativen Citations**, die Zitate bis auf die exakte Textstelle liefern und verlässlicher sind als selbst geparste Quellenverweise. Für einen Produktivbetrieb würde ich wieder Claude einsetzen. Die Modelle sind über Umgebungsvariablen konfiguriert, nicht im Code verdrahtet. |
| **Gemini Embeddings statt Voyage AI** | Voyage 4 ist beim Retrieval etwas stärker und bietet einen gemeinsamen Embedding-Raum: Dokumente mit `voyage-4-large` in bester Qualität einbetten, Suchanfragen mit dem schnellen `voyage-4-lite`. Ohne hinterlegte Zahlungsmethode ist Voyage aber auf 3 Anfragen pro Minute begrenzt – zu wenig für Chat und Ingestion. Gemini Embedding 2 ist kostenlos nutzbar, liefert 1024 Dimensionen passend zur bestehenden `pgvector`-Spalte und spart einen weiteren Anbieter. In Produktion wäre Voyage meine erste Wahl. |
| **Nummerierte Quellenverweise statt nativer Citations** | Gemini hat keine eingebauten Zitate für eigene Dokumente. Die Chunks werden daher nummeriert übergeben, das Modell belegt Aussagen mit `[n]`, und der Server ordnet die Verweise den abgerufenen Chunks zu. Das Datenformat der Zitate ist dasselbe wie mit Claude – das Frontend musste für den Anbieterwechsel nicht angepasst werden. |
```

### Optional: Abschnitt „Entwickelt mit Claude Code“

Für Recruiter ist die Arbeitsweise oft interessanter als der Tech-Stack. Vorschlag für einen eigenen Abschnitt vor „Projektstatus“:

```markdown
## 🤖 Entwickelt mit Claude Code

Das Projekt ist mit **Claude Code** als Pair-Programmer entstanden – nicht als Code-Generator auf Zuruf, sondern mit einem festen Rahmen:

- **`CLAUDE.md`** mit Architektur, Domänensprache und harten Regeln (z. B. keine Datenänderung an der Produktions-DB ohne Freigabe, Ownership-Check bei jedem Notebook-Zugriff).
- **Bereichsspezifische Regeln** in `.claude/rules/` (API-Routen, Worker, Datenbank, Storage, Auth, UI), die über `paths:` nur geladen werden, wenn passende Dateien bearbeitet werden.
- **Hooks**: Prettier formatiert jede bearbeitete Datei automatisch.
- **Plan-Modus** für größere Änderungen: erst Plan, dann Freigabe, dann Umsetzung – z. B. bei der Migration von AWS auf Cloudflare und beim Wechsel der KI-Anbieter (siehe [`docs/umstellung-gemini.md`](docs/umstellung-gemini.md)).
```
