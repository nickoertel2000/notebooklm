---
paths:
  - "lib/storage.ts"
  - "app/api/notebooks/*/sources/**"
  - "app/api/notebooks/*/audio/**"
  - "app/api/notebooks/*/video/**"
  - "components/popup/AddSourceModal.tsx"
  - "components/AudioPlayer/**"
  - "components/VideoPlayer/**"
---

# Dateispeicher (R2)

Cloudflare-R2-Bucket `notebooklm` (Jurisdiktion `eu`), Zugriff nur über das Binding `BUCKET` via `lib/storage.ts` – keine S3-API, keine Credentials, keine Presigned URLs, kein Bucket-CORS. Die DB speichert den **Key** (`storageKey`), nie eine URL.

## Key-Schema

Alle Objekte liegen unter `notebooks/{notebookId}/` – dieses Präfix entfernt `deleteNotebook`:

- `sources/{sourceId}/original.pdf` – hochgeladene PDFs (fester Name, der Dateiname des Nutzers landet nie im Key); URL-/Text-Quellen als `content.txt`
- `audio/{audioId}.wav`, `video/{videoId}.mp4` – generierte Ausgabe
- `video/{videoId}/parts/` – temporäre Folien-Audios/-Bilder eines laufenden Video-Jobs

Keys mit den Helfern (`sourceKey`, `sourcePrefix`, `audioKey`, `videoKey`, `videoPartsPrefix`, `notebookPrefix`) bauen, nicht mit Inline-Template-Strings.

## Abläufe

- Upload: `POST sources` legt die Zeile an → Client `PUT sources/[sourceId]/file` mit `Content-Type: application/pdf` → die Route streamt den Body nach R2 (max. 50 MB, nur einmal pro Quelle) und startet den Import-Workflow.
- Download/Wiedergabe: `GET audio/[audioId]` / `video/[videoId]` liefern Metadaten mit `url: …/file`; die `file`-Route prüft den Besitz und streamt über `serveObject` (Range → 206, ETag → 304, `Cache-Control: private, no-store`). Nie rohe Keys zurückgeben und den Bucket nie öffentlich machen.
- Löschen: `deleteNotebookObject(notebookId, key)` für einzelne Dateien (überspringt Keys außerhalb des eigenen Notebook-Präfixes, weil kopierte Demo-Notebooks auf die Dateien der Vorlage zeigen), `deleteByPrefix` (paginiert) für einen Quellen-Ordner oder ein ganzes Notebook. Storage-Fehler beim Löschen werden geloggt, das Löschen in der DB geschieht trotzdem.
