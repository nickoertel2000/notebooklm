# ToDo

## 1. Testen

- [ ] Abmelden dauert auffällig lange: Ursache prüfen.

## 2. Neon beobachten

Hyperdrive hält einen eigenen Connection-Pool. Ob der Scale-to-Zero verhindert, ist nicht dokumentiert. Wichtig, weil die 100 CU-Stunden im Free-Tarif nur für rund 400 Stunden mit 0,25 CU reichen, nicht für Dauerbetrieb.

- [ ] Neon-Dashboard: Geht die Compute bei Inaktivität auf „Idle“?
- [ ] Am 01.10. oder 02.10.2026: Branch-Übersicht → Usage → Compute. Bei normaler Nutzung deutlich unter 3 CU-Stunden pro Tag. Etwa 6 oder mehr pro Tag heißt, die Compute läuft rund um die Uhr (vermutlich hält Hyperdrive sie wach).

## 3. Tests

Unit-Tests (Vitest), Deploy-Sperre in Workers Builds und GitHub Actions sind eingerichtet.

- [ ] E2E-Tests mit Playwright (3–5 Abläufe ohne KI: Login, Demo-Zugang, Notebook anlegen, Text-Quelle, Demo-Notebook mit Zitaten öffnen). Voraussetzung: eigener Neon-Branch für Entwicklung und Tests.

## 4. Rollenspiel: Bewertung durch einen KI-Agenten

Recruiter lassen ein Projekt vermutlich von einem KI-Agenten prüfen, der einen Bericht mit Bewertung schreibt.

- [ ] Das einmal simulieren: Agent bekommt Repo und Live-URL, schreibt eine Bewertung wie für einen Recruiter. Schwächen daraus beheben.
