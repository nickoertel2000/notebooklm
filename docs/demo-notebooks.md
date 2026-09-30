# Demo-Notebooks

Stand: 30.09.2026. Plan für die Notebooks im Vorlage-Konto `demo@notebooklm.invalid`. Jedes neue Demo-Konto bekommt eine Kopie davon (siehe [`anleitung-google-account.md`](anleitung-google-account.md), Abschnitt „Demo-Vorlage“).

Ablauf: Alle Notebooks in Produktion anlegen. Lokal nutzt `pnpm dev` zwar dieselbe Datenbank, aber nur ein nachgebildetes R2: Quelltexte, Audio und Video eines lokal angelegten Notebooks fehlen in Produktion und in jeder Demo-Kopie.

## Vorher beachten

- **Im Vorlage-Konto anmelden.** Nur Notebooks von `demo@notebooklm.invalid` werden kopiert. Passwort unbekannt? Feld `DEMO_TEMPLATE_PASSWORD` in 1Password anlegen und setzen:
  ```sh
  node --env-file=.env.local scripts/demo-template-login.mjs --from demo@notebooklm.invalid --apply
  ```
- **Nur Fertiges wird kopiert.** Quellen, Berichte, Audios und Videos im Status „fehlgeschlagen“ oder „in Bearbeitung“ landen nicht in den Demo-Konten.
- **Nichts löschen**, solange Demo-Konten existieren. Die Kopien verweisen auf die Dateien der Vorlage.

## Notebook 1: Richtig arbeiten mit Claude Code

Vorhanden (30.09.2026): 9 Website-Quellen (u. a. offizielle Doku zu Überblick, Best Practices, Memory, Headless), 3 Chat-Fragen, Mindmap, Lernplan, Audio „Zusammenfassung“. Die folgenden Schritte ergänzen, was fehlt.

### Quellen aufräumen

1. **Löschen** (Affiliate-Blogs, ungeprüfte Kopien, Fork-Branch; die offizielle Doku deckt die Inhalte ab):
   - „Claude Code Befehle (100+): Die Referenz“ (gradually.ai)
   - „Claude Code: Anleitung für Installation und Start“ (gradually.ai)
   - „Claude Code – Vollständige Dokumentation - HackMD“
   - „GitHub - hsuanchenlin/claude-howto at refs/heads/fix/…“

   Behalten: die vier Seiten von `code.claude.com` und den Praxisartikel von devjobs.de.

2. **Website-Links** (offizielle Doku, alle erreichbar), jeweils einzeln über „Website“ hinzufügen:
   - `https://code.claude.com/docs/en/common-workflows`: typische Abläufe, Plan-Modus
   - `https://code.claude.com/docs/en/slash-commands`: Slash-Commands
   - `https://code.claude.com/docs/en/skills`: Skills
   - `https://code.claude.com/docs/en/sub-agents`: Subagents
   - `https://code.claude.com/docs/en/hooks`: Hooks
   - `https://code.claude.com/docs/en/mcp`: MCP-Server
   - `https://code.claude.com/docs/en/permissions`: Berechtigungen und Sicherheit
   - `https://code.claude.com/docs/en/cli-reference`: CLI-Befehle und Flags

3. **Text einfügen**: Inhalt von [`.claude/CLAUDE.md`](../.claude/CLAUDE.md), Titel „CLAUDE.md eines echten Projekts“. Damit lässt sich im Chat fragen, wie dieses Projekt mit Claude Code gebaut wurde.

Vor dem nächsten Schritt warten, bis keine Quelle mehr lädt und keine als fehlgeschlagen markiert ist.

### Chat neu aufbauen

Die bisherigen Antworten zitieren gelöschte Quellen. Den Chat-Verlauf des Notebooks deshalb leeren lassen (Datenbank, nur mit Freigabe) und diese Fragen nacheinander stellen:

1. Was ist der Unterschied zwischen CLAUDE.md, Skills, Slash-Commands und Hooks, und wann nehme ich was?
2. Welche harten Regeln gelten in diesem Projekt für Claude Code, und warum?
3. Wie schütze ich Secrets und die Produktionsdatenbank vor versehentlichen Aktionen von Claude Code?
4. Wie läuft ein sinnvoller Workflow mit dem Plan-Modus ab?
5. Wie setzt man Claude Code ohne Interaktion ein, etwa in CI?
6. Wofür sind Subagents gut, und wie unterscheiden sie sich von Skills?

### Studio ergänzen

Die Video-Übersicht zuerst erzeugen.

**1. Video-Übersicht**

- Format: „Zusammenfassung“
- Sprache: Deutsch
- Visueller Stil: „Whiteboard“
- Fokus:

  > Erkläre für Entwickler, die Claude Code noch nicht kennen, in dieser Reihenfolge: was Claude Code ist und wie man es im Terminal startet, CLAUDE.md als Projektgedächtnis, Plan-Modus für größere Änderungen, Erweiterung mit Skills, Hooks und Subagents, und der Einsatz ohne Interaktion mit claude -p. Für die Folienbilder: Terminal-Fenster, Entwickler-Arbeitsplatz, Flussdiagramme und Werkzeug-Metaphern, keine Logos.

**2. Audio-Übersicht**

- Format: „Kritische Bewertung“
- Sprache: Deutsch, Länge: „Kurz“
- Fokus:

  > Bewerte kritisch, wie viel Kontrolle man Claude Code geben sollte: Stärken und Risiken autonomer Änderungen, und welche Leitplanken helfen (Plan-Modus, Berechtigungen, harte Regeln in der CLAUDE.md, Hooks). Nenne konkrete Beispiele aus der CLAUDE.md dieses Projekts.

**3. Bericht**

- Format: „Überblick“
- Sprache: Deutsch (Standard)

**4. Datentabelle**

- Fokus:

  > Stelle die Erweiterungsmöglichkeiten von Claude Code gegenüber: CLAUDE.md, Slash-Commands, Skills, Hooks, Subagents und MCP-Server. Spalten: Zweck, wo sie liegen (Datei oder Ordner), wer sie auslöst, typisches Beispiel.

**5. Quiz**

- Anzahl: „Standard“ (10 Fragen), Schwierigkeitsgrad: „Mittel“
- Fokus:

  > Wann nutzt man welches Werkzeug: CLAUDE.md, Plan-Modus, Skills, Hooks, Subagents, MCP und claude -p. Dazu Berechtigungen und sichere Arbeitsweise.

**6. Karteikarten**

- Anzahl: „Weniger“ (10 Karten), Schwierigkeitsgrad: „Einfach“
- Fokus:

  > Nur Begriffe und Befehle, z. B. CLAUDE.md, Plan-Modus, Slash-Command, Skill, Hook, Subagent, MCP, claude -p, /init, /compact.

### Prüfen, bevor es in die Vorlage geht

- Keine Quelle, kein Bericht, kein Audio und kein Video lädt noch oder ist fehlgeschlagen.
- Das Video einmal abspielen: Die Länge in der Liste und beim Abspielen muss gleich sein.
- In einer Chat-Antwort einen Zitat-Chip anklicken: Er muss die passende Quelle hervorheben.

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
