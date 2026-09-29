# ToDo

## 1. Testen

- [ ] Smoke-Test in Produktion: Login, Quelle (PDF/URL/Text, Status `ready`), Chat mit Zitaten, Bericht, Audio, Video.
- [ ] Demo-Vorlage fertig aufbauen ([`demo-notebooks.md`](demo-notebooks.md), Anleitung in [`anleitung-google-account.md`](anleitung-google-account.md), Abschnitt „Demo-Vorlage“).
## 2. Neon beobachten

Hyperdrive hält einen eigenen Connection-Pool. Ob der Scale-to-Zero verhindert, ist nicht dokumentiert. Wichtig, weil die 100 CU-Stunden im Free-Tarif nur für rund 400 Stunden mit 0,25 CU reichen, nicht für Dauerbetrieb.

- [ ] Neon-Dashboard: Geht die Compute bei Inaktivität auf „Idle“?
- [ ] Am 01.10. oder 02.10.2026: Branch-Übersicht → Usage → Compute. Bei normaler Nutzung deutlich unter 3 CU-Stunden pro Tag. Etwa 6 oder mehr pro Tag heißt, die Compute läuft rund um die Uhr (vermutlich hält Hyperdrive sie wach).

## 3. Gemini-Kontingente

Die Free-Tier-Limits gelten pro Projekt und Modell (AI Studio → Rate Limits). Chat & Co. laufen deshalb auf Flash-Lite (500/Tag), Flash (20/Tag) nur für Studio-Inhalte, mit Ausweichmodell bei 429/5xx.

- [ ] Embeddings: Gemini Embedding 2 erlaubt 30.000 Tokens pro Minute, der Import schickt 100 Chunks (rund 80.000 Tokens) pro Anfrage. Größere Quellen scheitern daran. Batches verkleinern (etwa 30 Chunks) und zwischen den Batches `step.sleep`.
- [x] TTS: `gemini-3.8-flash-tts` erlaubt nur 10 Anfragen. Nur noch Kurzvideos (3–4 Folien), Vertonung vor den Bildern, `gemini-3.8-flash-lite-tts` als Ausweichmodell.
- [ ] In AI Studio prüfen, ob die 10 TTS-Anfragen pro Tag oder pro Minute gelten, und das Limit von `gemini-3.8-flash-lite-tts` nachsehen.
- [ ] Optional: `gemini-3.5-flash` (eigene 20/Tag) als Stufe zwischen Flash und Flash-Lite für Studio-Inhalte.
