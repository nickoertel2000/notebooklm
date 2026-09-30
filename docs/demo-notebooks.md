# Demo-Notebooks

Stand: 29.09.2026. Plan für die Notebooks im Vorlage-Konto `demo@notebooklm.invalid`. Jedes neue Demo-Konto bekommt eine Kopie davon (siehe [`anleitung-google-account.md`](anleitung-google-account.md), Abschnitt „Demo-Vorlage“).

Ablauf: Alle Notebooks in Produktion anlegen. Lokal nutzt `pnpm dev` zwar dieselbe Datenbank, aber nur ein nachgebildetes R2: Quelltexte, Audio und Video eines lokal angelegten Notebooks fehlen in Produktion und in jeder Demo-Kopie.

## Vorher beachten

- **Im Vorlage-Konto anmelden.** Nur Notebooks von `demo@notebooklm.invalid` werden kopiert. Passwort unbekannt? Feld `DEMO_TEMPLATE_PASSWORD` in 1Password anlegen und setzen:
  ```sh
  node --env-file=.env.local scripts/demo-template-login.mjs --from demo@notebooklm.invalid --apply
  ```
- **Nur Fertiges wird kopiert.** Quellen, Berichte, Audios und Videos im Status „fehlgeschlagen“ oder „in Bearbeitung“ landen nicht in den Demo-Konten.
- **Nichts löschen**, solange Demo-Konten existieren. Die Kopien verweisen auf die Dateien der Vorlage.

## Notebook 1: Richtig arbeiten mit Claude Code

### Quellen

1. **Websuche mit Deep Research**, diesen Text ins Suchfeld:

   > Richtiges Arbeiten mit Claude Code im Terminal: offizielle Dokumentation und Praxisberichte zu Installation, CLAUDE.md, Plan-Modus, Slash-Commands, Skills, Hooks, Subagents, MCP und Headless-Modus mit claude -p

   Davon 4 bis 5 seriöse Treffer auswählen (offizielle Seiten, gut geschriebene Praxisberichte).

2. **Website-Links** (offizielle Doku), falls die Suche sie nicht liefert:
   - `https://code.claude.com/docs/en/overview`: Überblick und Installation
   - `https://code.claude.com/docs/en/best-practices`: Best Practices
   - `https://code.claude.com/docs/en/memory`: CLAUDE.md und Memory
   - `https://code.claude.com/docs/en/hooks`: Hooks
   - `https://code.claude.com/docs/en/cli-reference`: Befehle und `claude -p`

3. **Text einfügen**: Inhalt von [`.claude/CLAUDE.md`](../.claude/CLAUDE.md), Titel „CLAUDE.md eines echten Projekts“. Damit lässt sich im Chat fragen, wie dieses Projekt mit Claude Code gebaut wurde.

### Chat-Fragen

- Was ist der Unterschied zwischen CLAUDE.md, Skills und Hooks?
- Wie läuft ein sinnvoller Workflow mit dem Plan-Modus ab?
- Welche harten Regeln gelten in diesem Projekt für Claude Code, und warum?
- Wie setzt man Claude Code ohne Interaktion ein, etwa in CI?

### Studio

| Format          | Einstellung                                                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Video-Übersicht | Format „Erklärvideo“, Stil „Klassisch“ oder „Whiteboard“. Fokus: _Was ist Claude Code, Installation und Start im Terminal, CLAUDE.md als Projektgedächtnis, Plan-Modus, Slash-Commands und Skills, Hooks, Subagents, Headless-Modus mit claude -p_ |
| Bericht         | „Lernplan“ (mit Glossar und Quiz)                                                                                                                                                                                                                  |
| Audio-Übersicht | Format „Diskussion“, Länge „Standard“                                                                                                                                                                                                              |

## Notebook 2: Das James-Webb-Weltraumteleskop

Bildstark, ideal für die Video-Übersicht mit FLUX-Hintergründen. Zeigt als einziges Notebook den **PDF-Upload**. Wird in Produktion angelegt.

Titel und Icon vergibt die App automatisch, sobald die erste Quelle da ist. Falls der Titel nicht passt, auf den Titel klicken und ändern in: **Das James-Webb-Weltraumteleskop**

### Quellen

1. **PDF hochladen**: die deutsche Pressemappe der ESA zum Start, 24 Seiten, 28,7 MB (Limit 50 MB).
   - Herunterladen: `https://esamultimedia.esa.int/docs/science/Webb_LaunchKit_German.pdf`
   - Über „Quellen hinzufügen“ per Drag-and-drop in den Dialog ziehen.
   - Die Mappe stammt von vor dem Start (Dezember 2021) und spricht im Futur. Das ist gewollt: Die Chat-Frage 6 unten vergleicht Plan und Ergebnis.

2. **Websuche mit Deep Research**, diesen Text ins Suchfeld:

   > James-Webb-Weltraumteleskop: Aufbau mit Spiegel und Sonnenschild, Infrarot-Instrumente, Umlaufbahn am Lagrange-Punkt L2, erste Bilder und wichtigste Entdeckungen seit 2022

   Davon 3 bis 4 Treffer auswählen: Seiten von NASA, ESA, DLR, Max-Planck-Instituten oder Wissenschaftsportalen. Keine Nachrichtenseiten mit Paywall, keine Foren. Treffer überspringen, die unten schon als Link stehen.

3. **Website-Links**, jeweils einzeln über „Website“ hinzufügen. Alle sind getestet und lassen sich importieren:
   - `https://de.wikipedia.org/wiki/James-Webb-Weltraumteleskop`: Gesamtüberblick, Geschichte, Kosten
   - `https://www.dlr.de/de/ar/themen-missionen/weltraumforschung/erkundung-des-weltraums/entstehung-des-universums/james-webb`: deutsche Beteiligung
   - `https://www.weltderphysik.de/gebiet/universum/teleskope-und-satelliten/james-webb-teleskop/`: Instrumente, verständlich erklärt
   - `https://science.nasa.gov/mission/webb/fact-sheet/`: technische Daten (englisch)
   - `https://science.nasa.gov/mission/webb/orbit/`: Umlaufbahn um L2 (englisch)
   - `https://www.nasa.gov/news-release/nasa-reveals-webb-telescopes-first-images-of-unseen-universe/`: die ersten Bilder vom Juli 2022 (englisch)

   Englische Quellen sind Absicht: Der Chat antwortet trotzdem auf Deutsch und zitiert sie.

Vor dem nächsten Schritt warten, bis keine Quelle mehr lädt und keine als fehlgeschlagen markiert ist.

### Chat-Fragen

Nacheinander stellen, damit der Verlauf im Demo-Konto zu sehen ist:

1. Warum beobachtet Webb im Infrarot und nicht im sichtbaren Licht wie Hubble?
2. Wozu braucht Webb den Sonnenschild, und wie kalt wird es dahinter?
3. Was ist der Lagrange-Punkt L2, und warum wurde er als Standort gewählt?
4. Welchen Beitrag leisten Europa und Deutschland zu Webb?
5. Was zeigt das erste Deep-Field-Bild SMACS 0723?
6. Die ESA-Pressemappe entstand vor dem Start. Welche der damals angekündigten Ziele hat Webb laut den anderen Quellen inzwischen erreicht?

### Studio

Die Video-Übersicht zuerst erzeugen. Kontingente pro Tag über alle Modellketten: rund 40 TTS-Anfragen (Video 3 bis 4, Audio 1), 80 Anfragen für Studio-Texte (alle Studio-Inhalte eines Notebooks brauchen etwa 8) und 100 Folienbilder. Alle drei Notebooks passen damit in einen Tag. Die Kontingente setzen um 9:00 Uhr deutscher Zeit zurück.

**1. Video-Übersicht**

- Format: „Zusammenfassung“
- Sprache: Deutsch
- Visueller Stil: „Benutzerdefiniert“, dieser Text:

  > Fotorealistische Weltraumaufnahmen im Stil der Webb-Bilder: tiefschwarzer Hintergrund, leuchtende Nebel in Gold, Orange und Blau, feine Sternfelder

  Gefällt das Ergebnis nicht, ein zweites Video mit Stil „Klassisch“ erzeugen und das schwächere löschen.

- Fokus:

  > Erkläre für Laien in dieser Reihenfolge: was Webb ist und wofür es gebaut wurde, wie Spiegel und Sonnenschild funktionieren, warum Webb am Lagrange-Punkt L2 steht, und was die ersten Bilder vom Juli 2022 gezeigt haben. Für die Folienbilder: Wo das Teleskop selbst zu sehen ist, beschreibe es originalgetreu als James Webb Space Telescope mit goldenem Wabenspiegel aus 18 sechseckigen Segmenten über einem großen, silbern-violett schimmernden, fünflagigen Sonnenschild in Rautenform. Für die letzte Folie ein echtes Webb-Motiv wie die Carina-Nebel-Klippen in Gold und Orange.

**2. Audio-Übersicht**

- Format: „Detaillierte Analyse“
- Sprache: Deutsch, Länge: „Standard“
- Fokus:

  > Fokussiere dich auf die großen Fragen, die Webb beantworten soll: die ersten Galaxien nach dem Urknall, die Geburt von Sternen in Staubwolken und die Atmosphären von Exoplaneten. Erzähle dazu, warum die Mission so riskant war, und nenne konkrete Beispiele aus den ersten Bildern.

**3. Bericht**

- Format: „Blogpost“
- Sprache: Deutsch (Standard)

**4. Datentabelle**

- Fokus:

  > Stelle Webb und Hubble gegenüber: Startjahr, Spiegeldurchmesser, Wellenlängenbereich, Entfernung zur Erde, Betriebstemperatur, Hauptinstrumente und wissenschaftliche Schwerpunkte.

**5. Quiz**

- Anzahl: „Standard“ (10 Fragen), Schwierigkeitsgrad: „Mittel“
- Fokus:

  > Die wichtigsten Zusammenhänge: warum Infrarot, wie der Sonnenschild funktioniert, warum L2 und was die ersten Bilder gezeigt haben.

**6. Mindmap**

Keine Einstellungen.

**7. Karteikarten**

- Anzahl: „Weniger“ (10 Karten), Schwierigkeitsgrad: „Einfach“
- Fokus:

  > Nur die Fachbegriffe, z. B. Lagrange-Punkt, Infrarot, Rotverschiebung, Deep Field, NIRCam, MIRI, Sonnenschild, Exoplanet.

### Prüfen, bevor es in die Vorlage geht

- Keine Quelle, kein Bericht, kein Audio und kein Video lädt noch oder ist fehlgeschlagen. Fehlgeschlagene löschen oder neu erzeugen, sie werden nicht kopiert.
- Das Video einmal abspielen: Sind die Hintergründe echte Bilder oder einfarbig? Einfarbig heißt, das Tageskontingent für Folienbilder war erschöpft. Dann am nächsten Tag ein neues Video erzeugen und das alte löschen.
- In den Chat-Antworten einen Zitat-Chip anklicken: Er muss die passende Quelle in der Liste hervorheben.

## Notebook 3: Schlaf und Gesundheit

Alltagsnah, gut für die Audio-Übersicht als Podcast-Dialog und für Chat-Fragen mit klaren Zitaten. Quellen: Artikel von Gesundheitsportalen (z. B. gesund.bund.de), Studien-Zusammenfassung als Text, Websuche. Wird in Produktion angelegt.
