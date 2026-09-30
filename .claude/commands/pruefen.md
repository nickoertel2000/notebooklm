---
description: Prüft die aktuellen Änderungen vollständig – pnpm check, E2E-Tests und Review durch den Reviewer-Agenten
---

1. `pnpm check` ausführen und alle Fehler beheben.
2. Wenn Notebook-Routen, Auth, Demo, Schema oder UI-Abläufe geändert wurden: `pnpm test:e2e` ausführen (braucht Docker) und Fehler beheben.
3. Den Subagenten `reviewer` auf die Änderungen ansetzen. Jeden Befund prüfen: umsetzen oder mit Begründung verwerfen.
4. Nach Fixes Schritt 1 wiederholen.
5. Kurz berichten: welche Prüfungen gelaufen sind, welche Befunde umgesetzt und welche verworfen wurden.
