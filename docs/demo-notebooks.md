# Demo-Notebooks

Stand: 29.09.2026. Plan für die Notebooks im Vorlage-Konto `demo@notebooklm.invalid`. Jedes neue Demo-Konto bekommt eine Kopie davon (siehe [`anleitung-google-account.md`](anleitung-google-account.md), Abschnitt „Demo-Vorlage“).

Ablauf: Notebook 1 lokal mit `pnpm dev` anlegen, danach Deploy in Produktion, Notebook 2 und 3 dort.

## Vorher beachten

- **Im Vorlage-Konto anmelden.** Nur Notebooks von `demo@notebooklm.invalid` werden kopiert. Passwort unbekannt? Feld `DEMO_TEMPLATE_PASSWORD` in 1Password anlegen und setzen:
  ```sh
  node --env-file=.env.local scripts/demo-template-login.mjs --from demo@notebooklm.invalid --apply
  ```
- **Video lokal nur mit Docker.** Ohne Docker schlägt der Schritt `render` fehl. Dann das Video nach dem Deploy in Produktion erzeugen. Lokal und Produktion nutzen dieselbe Datenbank, das Notebook ist dort sofort vorhanden.
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

## Notebook 2: James-Webb-Weltraumteleskop

Bildstark, ideal für die Video-Übersicht mit FLUX-Hintergründen. Quellen: Seiten von NASA und ESA (gemeinfrei bzw. frei nutzbar), Wikipedia, Websuche. Wird in Produktion angelegt.

## Notebook 3: Schlaf und Gesundheit

Alltagsnah, gut für die Audio-Übersicht als Podcast-Dialog und für Chat-Fragen mit klaren Zitaten. Quellen: Artikel von Gesundheitsportalen (z. B. gesund.bund.de), Studien-Zusammenfassung als Text, Websuche. Wird in Produktion angelegt.
