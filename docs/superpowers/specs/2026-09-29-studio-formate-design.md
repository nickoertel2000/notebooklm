# Studio: neues Panel und vier Lernformate

Stand: 29.09.2026, freigegeben.

## Ziel

Das Studio-Panel sieht aus wie im aktuellen NotebookLM und bekommt vier neue, kostenlose Formate: **Karteikarten**, **Quiz**, **Datentabelle** und **Mindmap**. Präsentation, Infografik und Notizen sind nicht Teil dieser Umsetzung (Infografik bräuchte ein kostenpflichtiges Bildmodell mit lesbarer Schrift).

## Panel

- Zweispaltiges Kachelraster: flache Kachel, farbiges Icon links, Name rechts. Nur fertige Formate haben eine Kachel: Audio-Zusammenfassung, Videoübersicht, Berichte, Karteikarten, Quiz, Mindmap, Datentabelle.
- Darunter eine gemeinsame Ergebnisliste aller Ausgaben (Audio, Video, Berichte, neue Formate), neueste zuerst. Jeder Eintrag: farbiges Typ-Icon, Titel, Meta-Zeile, ⋮-Menü mit „Löschen“.
- Ohne Ausgaben: leerer Zustand mit Icon und Hinweistext wie bei Google.
- Die Darstellung wandert nach `components/StudioPanel/`. Daten, Polling und Handler bleiben in `NotebookView.tsx`.

## Speicherung

Die neuen Formate sind Zeilen in `reports`, keine Migration:

| Format       | `reports.type` | `content` (JSON)                                                                                   |
| ------------ | -------------- | -------------------------------------------------------------------------------------------------- |
| Karteikarten | `flashcards`   | `{ title, cards: [{ front, back }] }`                                                              |
| Quiz         | `quiz`         | `{ title, questions: [{ question, options: string[4], answer, explanation }] }` (`answer` = Index) |
| Datentabelle | `table`        | `{ title, columns: string[], rows: string[][] }`                                                   |
| Mindmap      | `mindmap`      | `{ title, root: { label, children } }`, höchstens 4 Ebenen                                         |

Listen, Polling, Löschen, Stale-Healing und die Kopie ins Demo-Konto laufen damit unverändert über die bestehenden Bericht-Routen.

## Erzeugung

- Definitionen, Prompts, JSON-Schemas und Parser in `lib/studio.ts` (`STUDIO_FORMATS`, `getStudioFormat`, `parseStudioContent`).
- `POST /reports` nimmt zusätzlich `format` (Studio-Format-ID), `amount` (`fewer | standard | more`), `difficulty` (`easy | medium | hard`) und `focus` entgegen; Werte laufen über Lookup-Helper.
- `ReportParams` bekommt optional `format`. `ReportWorkflow` ruft dann `generateText` mit `jsonSchema` auf (`responseMimeType: "application/json"`, `responseJsonSchema`), prüft das Ergebnis mit dem Parser (ungültig → Fehler, der Step wiederholt) und speichert das normalisierte JSON.

## Anzeige

- Karteikarten, Quiz, Datentabelle: Optionen über `components/popup/StudioOptionsModal.tsx` (Anzahl und Schwierigkeit nur bei Karteikarten und Quiz, Fokus-Textfeld bei allen). Mindmap startet ohne Dialog.
- `ReportViewModal` lädt den Eintrag und rendert je nach Typ Markdown oder eine der neuen Komponenten: `FlashcardsView`, `QuizView`, `DataTableView`, `MindmapView` (je `components/<Name>/`). Die Mindmap ist ein eigener aufklappbarer Baum aus HTML/CSS, ohne neue Abhängigkeit.

## Prüfung

`pnpm lint`, `pnpm typecheck`, danach jedes Format einmal lokal erzeugen und ansehen.
