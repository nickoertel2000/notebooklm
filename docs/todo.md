# ToDo

## 1. Testen

- [ ] Smoke-Test in Produktion: Login, Quelle (PDF/URL/Text, Status `ready`), Chat mit Zitaten, Bericht, Audio, Video.
- [ ] Große Quelle importieren (PDF mit 30+ Seiten, mehr als 25 Chunks): Import läuft mit Pausen zwischen den Batches bis `ready` durch.
- [ ] Demo-Vorlage fertig aufbauen ([`demo-notebooks.md`](demo-notebooks.md), Anleitung in [`anleitung-google-account.md`](anleitung-google-account.md), Abschnitt „Demo-Vorlage“).

## 2. Neon beobachten

Hyperdrive hält einen eigenen Connection-Pool. Ob der Scale-to-Zero verhindert, ist nicht dokumentiert. Wichtig, weil die 100 CU-Stunden im Free-Tarif nur für rund 400 Stunden mit 0,25 CU reichen, nicht für Dauerbetrieb.

- [ ] Neon-Dashboard: Geht die Compute bei Inaktivität auf „Idle“?
- [ ] Am 01.10. oder 02.10.2026: Branch-Übersicht → Usage → Compute. Bei normaler Nutzung deutlich unter 3 CU-Stunden pro Tag. Etwa 6 oder mehr pro Tag heißt, die Compute läuft rund um die Uhr (vermutlich hält Hyperdrive sie wach).

## 3. Tests

automatisierte tests mit e2e und playwirtght (falls sinnvoll)
