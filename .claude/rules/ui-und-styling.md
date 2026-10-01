---
paths:
  - "app/**/*.tsx"
  - "app/**/*.scss"
  - "components/**"
  - "styles/**"
  - "lib/useDictation.ts"
---

# Seiten, Komponenten & Styling

## Server-/Client-Trennung

- Seiten sind asynchrone Server Components: `getSessionUser()` → `redirect("/login")`, Besitzprüfung über `getNotebookForUser` → `notFound()`, Daten laden, Datumswerte in ISO-Strings serialisieren, als `initialX`-Props an eine Client Component übergeben. Referenz: `app/(app)/notebook/[notebookId]/page.tsx` + `NotebookView.tsx`.
- Client Components laden nie Initialdaten und prüfen nie die Authentifizierung; sie rufen `app/api/` (oder die Notebook-CRUD-Server-Actions) auf und pollen den Job-Status (siehe `jobs-worker.md`).
- `app/(app)/layout.tsx` macht keine Authentifizierung (der Schutz ist `proxy.ts` + Page-Guard), setzt aber `dynamic = "force-dynamic"`: vinext kann `headers()` zur Build-Zeit nicht erkennen, und diese Seiten dürfen nie gecacht werden.
- Item-Typen, die sich Seite und View teilen, werden aus der View exportiert (`NotebookView.tsx`); Payload-Typen von Modals werden neben dem Modal exportiert (`AudioOptions`, `ReportGeneratePayload`, …).
- `NotebookView.tsx` ist bereits sehr groß – neue, in sich geschlossene UI in `components/` ablegen, statt die Datei weiter wachsen zu lassen.

## Komponenten

- Ein Ordner pro Komponente in `components/<Name>/` mit `<Name>.tsx` + `<Name>.module.scss` (PascalCase für neue Dateien; einige ältere SCSS-Dateien sind kleingeschrieben, so belassen).
- Modals liegen gemeinsam in `components/popup/`: `"use client"`, gesteuert über `onClose`-/`onCreate`-Callbacks, `role="dialog" aria-modal="true"`, Klick auf das Overlay schließt, inneres `onClick={(e) => e.stopPropagation()}`.
- `lib/useDictation.ts`: Web Speech API (`de-DE`, nur Chrome/Edge); `supported` kommt aus `useSyncExternalStore` mit Server-Snapshot `false` für SSR-Sicherheit.
- Fehler nie verschlucken. Anzeigbare Meldungen als `UserError` werfen (`throw new UserError(await readError(res, fallback))`, `lib/api/client.ts`) und mit `errorMessage(err, fallback)` lesen: Andere Fehler (TypeError bei Netzfehlern, SyntaxError) tragen englischen Browsertext und werden durch den Fallback ersetzt. In der Notebook-Ansicht erscheinen sie als `components/Toast`, in Modals im eigenen Fehlerfeld. Scheitert das Anlegen eines Studio-Eintrags, verschwindet der Platzhalter, und die Liste wird neu geladen.
- `eslint-plugin-react-hooks` 7 verbietet synchrones `setState` in Effects (`react-hooks/set-state-in-effect`). State aus geänderten Props wird während des Renderns mit einem gespeicherten Vorgängerwert synchronisiert (siehe `NotebookTitle.tsx`), Browser-Fähigkeiten über `useSyncExternalStore`.

## Styling

- Überall SCSS-Module (`components/**`, `app/login/login.module.scss`, `app/(app)/notebook/notebook.module.scss`). Einzige Ausnahme: Die Startseite `app/(app)/notebook-home.scss` ist plain globales SCSS, gescopt unter `.nlm` mit `nlm-*`-Klassennamen – keine neuen globalen Stylesheets anlegen.
- `styles/globals.scss` enthält nur Resets, die Basisschrift und die Icon-Defaults. Keine Farben dort.
- Die App ist ausschließlich dunkel. Design-Tokens sind CSS Custom Properties, die lokal auf dem Seiten-Root definiert werden (`.shell` in `notebook.module.scss`, `.nlm` in `notebook-home.scss`): `var(--bg)`, `var(--surface)`, `var(--text)`, `var(--text-muted)`, `var(--accent)`, `var(--radius-*)`. Diese wiederverwenden statt neuer Hex-Werte.
- Schrift: Google Sans Flex (SIL OFL, Lizenz in `app/fonts/OFL.txt`, Latin-Subset als eine Variable-Datei) über `next/font/local` in `app/layout.tsx` als `--font-google-sans`; Inputs/Buttons verwenden `font-family: inherit`. Die proprietäre Google Sans darf nicht zurück ins Repo.
- Das Aussehen orientiert sich an NotebookLM, die App darf aber nicht als Google-Produkt durchgehen: keine Links auf Googles Nutzungsbedingungen oder Datenschutzseiten, keine nicht funktionierenden Nachbildungen von Google-Konto-Funktionen (Kontoverwaltung, App-Launcher, Einstellungen). Ein Button funktioniert entweder oder existiert nicht; die deaktivierte Google-Anmeldung ist der einzige Platzhalter und als solcher gekennzeichnet.
- Icons nur aus `material-symbols` (`import "material-symbols"` in der Seite/Komponente) als `<span className="material-symbols-outlined">icon_name</span>`. Die Defaults für Gewicht/Fill/Größe stehen in `globals.scss`. Um Icons in einem Modul zu stylen, `:global(.material-symbols-outlined)` (oder `span`) verschachteln: CSS-Module hashen jeden Klassennamen (`generateScopedName` in `vite.config.ts`), daher trifft ein schlichtes verschachteltes `.material-symbols-outlined` nie. Ältere Regeln in `notebook.module.scss` haben diesen Fehler noch.
- Breakpoints sind Desktop-first mit `max-width`. Gemeinsame Breakpoint-Variablen gibt es noch nicht; bei den Werten bleiben, die in der bearbeiteten Datei schon verwendet werden.
- Datumswerte in der UI: `Intl.DateTimeFormat("de-DE")`.
