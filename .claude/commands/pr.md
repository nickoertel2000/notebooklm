---
description: Reicht die aktuellen Änderungen als Pull Request ein – Branch, Commits, Push, PR mit Beschreibung
argument-hint: "[Kurzbeschreibung]"
---

Thema: $ARGUMENTS

1. Zuerst `/pruefen` vollständig durchlaufen. Ohne grüne Prüfungen keinen PR.
2. Liegt die Arbeit auf `main`, einen Branch `<typ>/<thema>` anlegen (`feat/`, `fix/`, `docs/`, `test/`, `chore/`, `refactor/`, Bezeichner ohne Umlaute).
3. In logisch getrennten Commits committen, Nachrichten als Conventional Commits auf Deutsch mit echten Umlauten, z. B. `fix(chat): leere Quellenauswahl wird abgelehnt`. Keine Sammel-Commits über unabhängige Themen.
4. Pushen und mit `gh pr create` einen PR gegen `main` öffnen. Beschreibung auf Deutsch:
   - **Was und warum:** zwei bis vier Sätze.
   - **Prüfungen:** welche Befehle gelaufen sind, mit Ergebnis.
   - **Hinweise:** Migrationen (vor dem Deploy einspielen), neue Secrets oder Bindings, manuelle Schritte.
5. Das automatische Review im PR abwarten und die Befunde wie in `/pruefen` abarbeiten.
6. Nie direkt auf `main` pushen, nie force-pushen. Gemergt wird nur auf meine Anweisung.
