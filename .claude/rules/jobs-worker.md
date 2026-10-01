---
paths:
  - "workers/jobs/**"
  - "containers/video-renderer/**"
  - "lib/jobs/**"
  - "lib/reports.ts"
  - "lib/studio.ts"
  - "lib/audio.ts"
  - "lib/video.ts"
  - "lib/gemini.ts"
  - "lib/embeddings.ts"
  - "lib/chunk.ts"
  - "lib/extract.ts"
  - "lib/notebookItems.ts"
  - "lib/prompts.ts"
  - "app/api/notebooks/*/sources/**"
  - "app/api/notebooks/*/reports/**"
  - "app/api/notebooks/*/audio/**"
  - "app/api/notebooks/*/video/**"
  - "components/popup/**"
---

# Asynchrone Jobs (Cloudflare Workflows)

Alles Langlaufende (Quellen-Import, Berichte, Audio-Übersicht, Video-Übersicht) läuft als Workflow im Worker `notebooklm-jobs` (`workers/jobs/src/workflows/`), nie in einem Request. Die App erstellt und beendet nur Instanzen.

## Job-Ablauf

1. Die Route fügt die Zeile mit `status: "processing"` ein, dann `startX(params)` aus `lib/jobs/start.ts` → antwortet mit `202`. Wirft `create()`, setzt die Route die Zeile auf `failed` und gibt 500 zurück.
2. Instanz-ID = Zeilen-ID (Berichte/Audio/Video). Quellen bekommen `${sourceId}-${Date.now()}`, weil sie erneut importiert werden können und IDs pro Workflow eindeutig sind.
3. Jeder Workflow: Steps mit den Retry-Konfigurationen `API_STEP` / `DB_STEP` (`workflows/shared.ts`); der `run()`-Body ist in try/catch gewickelt, der catch führt einen `mark-failed`-Step aus und wirft erneut, sodass die Instanz als errored endet und der Rohfehler im Workflow-Log steht. In die Spalte `error` (die UI zeigt sie an) kommt nur `toUserErrorMessage(err)`: Meldungen aus `USER_ERRORS` (`lib/jobs/errors.ts`), ein erschöpftes KI-Kontingent oder ein allgemeiner Text, nie Postgres- oder Gemini-Rohfehler. Eine neue Meldung für Nutzer kommt in `USER_ERRORS`. Validierungsprobleme werfen `NonRetryableError`.
4. Das Löschen eines laufenden Berichts/Audios/Videos ruft `cancelJob(kind, id)` auf (terminate, Fehler ignoriert); `deleteNotebook` bricht alle laufenden ab. Gelöschte Quellen erkennt der Import selbst (`assertSourceExists` → `NonRetryableError`).
5. Der Client pollt den Listen-Endpoint nur, solange ein Element `processing` ist (`app/(app)/notebook/[notebookId]/useSources.ts` und `app/(app)/notebook/[notebookId]/useStudioJobs.ts`: Quellen 2,5 s, Berichte 3 s, Audio 4 s, Video 5 s).
6. Hängende Jobs (Workflow abgestürzt oder nie gestartet) zeigen die Listen aus `lib/notebookItems.ts` als `failed`, ohne beim Lesen zu schreiben (`STALE_MINUTES`: Quellen 15 min über `updatedAt`, Berichte 10, Audio 15, Video 20 min über `createdAt`). In der DB bleibt die Zeile `processing`. Ein erneuter Import ist auch dafür erlaubt (`sourceRetryable`). Die Schwellen müssen den schlimmsten Fall inklusive Step-Retries übersteigen. Ein neuer Job-Typ braucht dasselbe.

## Workflow-Regeln

- Rückgabewerte von Steps werden persistiert (max. 1 MB, nur JSON): kleine Metadaten zurückgeben, Binärdaten innerhalb des Steps in R2 schreiben. Alles außerhalb von `step.do` kann beim Replay erneut laufen – deterministisch halten (Lookups, kein I/O).
- Steps müssen idempotent sein: Der Import schreibt Chunks zuerst ohne Embedding, `embed-n` füllt nur Zeilen `WHERE embedding IS NULL` in seinem `idx`-Bereich.
- Pro Step einen DB-Client erzeugen (`getDb()`), nie über Steps hinweg teilen.
- Parallele Steps sind in Ordnung (`Promise.all` über `step.do`), verwendet für Video-Folien in Gruppen von `VIDEO_SLIDE_CONCURRENCY`.
- Das Speicherlimit des Workers beträgt 128 MB: Das PDF-Upload-Limit (50 MB, `sources/[sourceId]/file`) hält die ganze Datei während `extract` im Speicher.
- NUL-Bytes (`stripNul`) aus extrahiertem Text und Fehler-Strings entfernen, bevor etwas in die DB geschrieben wird – Postgres lehnt `0x00` ab (22021). Nie ein literales NUL in Quellcode schreiben.

## Ingestion

PDF über `unpdf` (`mergePages: true`, daher ist `page` immer `null`), sonst `TextDecoder`. URL-Quellen werden in der Route extrahiert (`lib/extract.ts`, linkedom + Readability) und als `content.txt` gespeichert. `chunkText`: 3200 Zeichen, 400 Überlappung. Embeddings in Batches zu 25 mit einem `step.sleep` von 60 s dazwischen (`embedTexts(…, "document")`; Queries verwenden `embedQuery`), geschrieben mit einem `UPDATE … FROM (VALUES …)` pro Batch. Gemini Embedding erlaubt 30k Tokens/min, geteilt mit den Query-Embeddings des Chats; ein größerer Batch scheitert von selbst, weil ein Request das Minutenbudget übersteigt. Jeder `embed-n`-Step hebt `sources.updatedAt` an, sonst gilt ein langer Import nach 15 min als hängend. `lib/embeddings.ts`: Gemini Embedding 2 hat keinen `taskType`, der Zweck ist ein Text-Präfix; jeder Text muss ein eigenes `Content`-Objekt sein, ein einfaches `string[]` würde einen zusammengeführten Vektor liefern.

## Generierung

- Berichte/Audio/Video verwenden keine Vektorsuche: `buildContext` (`lib/jobs/context.ts`) lädt die Chunks der gewählten Quellen bis 150k Zeichen (höchstens 500 Chunks) und liefert sie bereits in `wrapSources()` eingeschlossen.
- Modelle kommen aus den Worker-`vars` über `chatModels()`/`reportModels()`/`env`. Modell-IDs nie hartcodieren. Text- und TTS-Modelle sind kommagetrennte Fallback-Ketten (`GEMINI_CHAT_MODELS` in der App, `GEMINI_REPORT_MODELS` und `GEMINI_TTS_MODELS` im Jobs-Worker); `GEMINI_EMBEDDING_MODEL` und `IMAGE_MODEL` sind einzelne Modelle.
- Textgenerierung läuft über `generateText()` (`lib/gemini.ts`). Die Thinking-Tokens von Gemini zählen gegen `maxOutputTokens`: Kleine Budgets brauchen `minimalThinking`, Skript-Budgets großzügig setzen (der Prompt steuert die Länge).
- Alles läuft im Gemini-Gratis-Tarif. Auf diesem Google-Projekt nie Billing aktivieren: Dadurch wird jeder Aufruf des Projekts kostenpflichtig, in einem bezahlten Projekt gibt es kein Gratis-Kontingent.
- Gratis-Tarif-Kontingente gelten pro Projekt **und pro Modell** (AI Studio → Usage → Rate Limit). Jede Flash-Version (3.5–3.8) hat ihr eigenes Limit von 5 RPM / 20 RPD, Flash-Lite (3.1, 3.5) 15 RPM / 500 RPD. Daher ist `GEMINI_REPORT_MODELS` (Flash-Kette, endet auf Flash-Lite) für Studio-Inhalte reserviert (Berichte, Audio-/Video-Skripte); alles Häufige (Chat, Auto-Titel, Icon, Discover, Berichtsvorschläge) verwendet `GEMINI_CHAT_MODELS` (nur Flash-Lite). Einen häufigen Aufruf nie nach `reportModels()` verschieben.
- `getGemini()` setzt SDK-`retryOptions` (3 Versuche, nur 5xx; ohne sie wiederholt das SDK gar nicht). 429 wird nicht wiederholt: Es ist das Kontingent. `withFallback(models, run)` läuft bei 429/5xx die Kette ab; `generateText()`, der Chat und `synthesizeSpeech()` verwenden es. Eine Kette, deren Modelle ein Kontingent teilen, ist nutzlos: Jeder Eintrag braucht sein eigenes Kontingent.
- Gemini TTS erlaubt 3 RPM und 10 RPD pro Modell; die Kette hat vier TTS-Modelle (3.8 Flash, 3.1 Flash Preview, 2.5 Flash Preview, 3.8 Flash-Lite), also etwa 40 Requests pro Tag. Flash-Lite-TTS bleibt zuletzt: Es spricht Deutsch mit englischen Begriffen darin auf Englisch aus und übersetzt den Text mit `languageCode: "de-DE"` sogar ins Englische (`languageCode` nicht setzen), und jede Video-Folie ist ein Request. Darum gibt es nur das kurze Videoformat (3–4 Folien, `MAX_SLIDES = 4`), und der Video-Workflow vertont zuerst alle Folien nacheinander mit einem `step.sleep` von 20 s (`speech-pause-n`), bevor er ein Bild generiert (`image-n`): Ein TTS-Fehler kostet dann keine Workers-AI-Neurons. Keine längeren Videoformate oder parallelen TTS hinzufügen, ohne das vorher zu lösen.
- `ThinkingLevel.MINIMAL` (`minimalThinking`) wird von Flash-Lite unterstützt, aber nicht von `gemini-3.8-flash` (nur low/medium/high): nur mit `chatModels()` verwenden und diese Kette rein auf Flash-Lite halten.
- Audio: Das Skript muss mit einer `TITEL:`-Zeile beginnen und darf kein Markdown enthalten (`parseScript`). Das Request-Format für zwei Sprecher hängt vom Modell ab: `synthesizeSpeech()` sendet zuerst einen Part pro Turn mit `speechMetadata.speaker` (`splitDialog`), was `gemini-3.8-flash-lite-tts` verlangt (ein beschrifteter Textblock oder ein Part ohne Sprecher → 400). Bei 400 „Speech metadata is not supported“ (3.1/2.5 TTS) wiederholt es mit demselben Modell einen Textblock `Sprecher n: …` plus eine Anweisungszeile. `lib/tts.test.ts` deckt beide Pfade ab; ein neues TTS-Modell mit einem echten Dialog-Request testen, bevor es in die Kette kommt. Gemini 3.8 TTS liefert WAV (ältere Modelle rohes PCM), immer 24 kHz/16 Bit/Mono: `stripWavHeader` entfernt einen vorhandenen Header, dann schreibt `pcmToWav` genau einen 44-Byte-Header (`wavSeconds` im Video-Workflow verlässt sich darauf).
- Video: `lib/video.ts` enthält Formate, Stile, Prompts, Parsing und das Text-Layout (`layoutSlide`). Pro Folie werden TTS und Bild nach `notebooks/{nb}/video/{id}/parts/` geschrieben; ein fehlgeschlagenes Bild fällt auf einen einfarbigen Hintergrund zurück.
- Folienbilder: Workers AI (`AI`-Binding, FLUX.2 über Multipart, `workers/jobs/src/images.ts`), weil kein Gemini-Bildmodell einen Gratis-Tarif hat. Das Ausgabeformat wird an den Magic Bytes erkannt und als `slide.background` (Dateiendung) an den Container übergeben. Der Step `image-budget` hält die tägliche Gratis-Zuteilung ein: Jedes heute (UTC) erstellte Video zählt mit `MAX_SLIDES`; oberhalb von `IMAGE_DAILY_LIMIT` bekommt das ganze Video einfarbige Hintergründe. Der Step `render` postet Multipart (Manifest + Dateien) an den Container und streamt das MP4 per `FixedLengthStream` in R2; `parts/` wird in `finally` gelöscht.
- Container `containers/video-renderer`: Node 24 (Type Stripping, kein Build-Schritt, nur `node:*`-Imports) + apt-ffmpeg, Schriftart ins Image eingebacken. Text über `drawtext` mit `textfile=` + `expansion=none`. Jeder Clip wird mit `-t` auf die Audiolänge der Folie geschnitten (`seconds` im Manifest, aus `wavSeconds`); nie `-shortest`: Bei 2 fps macht das Lookahead von libx264 jeden Clip ~22 s länger als sein Audio. Er ist ein dummer Renderer: keine API-Keys, kein R2-Zugriff. Eigene tsconfig (`pnpm typecheck` deckt sie ab).
- Prompts sind deutsch und stehen neben ihren Formatdefinitionen (`REPORT_TYPES`, `AUDIO_FORMATS`, `VIDEO_FORMATS`, `STUDIO_FORMATS`). Ein neues Format = neuer Eintrag dort + Option im passenden Modal in `components/popup/`.
- Lernformate (`lib/studio.ts`: Karteikarten, Quiz, Datentabelle, Mindmap) laufen über `ReportWorkflow` mit `ReportParams.format`: `generateText({ jsonSchema })` erzwingt JSON, `parseStudioContent` validiert und normalisiert es, und ungültige Ausgabe wirft, sodass der Step wiederholt. Die JSON-Schemas von Gemini dürfen nicht rekursiv sein, daher ist die Mindmap-Tiefe (4 Ebenen) in `STUDIO_SCHEMAS` ausgeschrieben; der Parser begrenzt sie auf dieselbe Tiefe. Schema, Parser und die Views (`components/*View`) beim Ändern eines Formats synchron halten.
