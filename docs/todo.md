# ToDo

Stand: 30.09.2026. Beide Worker sind deployt (`pnpm cf:first-deploy` am 29.09.2026), die App läuft unter `https://notebooklm.fancy-cherry-09d8.workers.dev`. Offen sind Tests, das Video-Container-Image und ein paar Nacharbeiten.

## 1. Testen

- [ ] Smoke-Test in Produktion: Login, Quelle (PDF/URL/Text, Status `ready`), Chat mit Zitaten, Bericht, Audio. Video funktioniert erst nach Schritt 3.
- [ ] Demo-Vorlage fertig aufbauen ([`demo-notebooks.md`](demo-notebooks.md), Anleitung in [`anleitung-google-account.md`](anleitung-google-account.md), Abschnitt „Demo-Vorlage“).
- [ ] „Demo-Zugang erstellen“ testen: Kopie vollständig, Chat-Zitate klickbar, Audio und Video abspielbar.

## 2. Neon beobachten

Hyperdrive hält einen eigenen Connection-Pool. Ob der Scale-to-Zero verhindert, ist nicht dokumentiert. Wichtig, weil die 100 CU-Stunden im Free-Tarif nur für rund 400 Stunden mit 0,25 CU reichen, nicht für Dauerbetrieb.

- [ ] Neon-Dashboard: Geht die Compute bei Inaktivität auf „Idle“?
- [ ] Am 01.10. oder 02.10.2026: Branch-Übersicht → Usage → Compute. Bei normaler Nutzung deutlich unter 3 CU-Stunden pro Tag. Etwa 6 oder mehr pro Tag heißt, die Compute läuft rund um die Uhr (vermutlich hält Hyperdrive sie wach).

## 3. Workers Builds (baut auch das Video-Container-Image)

Im Dashboard unter Workers & Pages → jeweiliger Worker → Settings → Builds mit dem GitHub-Repo verbinden. Der Worker-Name muss zum `name` in der `wrangler.jsonc` im Root-Verzeichnis passen, deshalb hat der Jobs-Worker sein eigenes Root-Verzeichnis. Dort gibt es keine `package.json`, die Befehle wechseln daher selbst ins Repo-Root.

| Worker            | Root-Verzeichnis | Build command                                              | Deploy command                     |
| ----------------- | ---------------- | ---------------------------------------------------------- | ---------------------------------- |
| `notebooklm-jobs` | `workers/jobs`   | `cd ../.. && pnpm install --frozen-lockfile && pnpm build` | `cd ../.. && pnpm run deploy:jobs` |
| `notebooklm`      | `/` (Repo-Root)  | `pnpm build`                                               | `pnpm run deploy:app`              |

- [ ] Production-Branch bei beiden: `I-######-I-PRODUKTION-I-######-I`
- [ ] Builds für andere Branches (Preview/Non-production) **deaktivieren**.
- [ ] Ersten Merge in den Production-Branch auslösen. Der Jobs-Build führt `wrangler deploy` ohne `--containers-rollout=none` aus und baut dabei das Image aus `containers/video-renderer/Dockerfile` in Cloudflares Build-Umgebung. Docker auf dem eigenen Rechner ist nicht nötig, ohne Docker schlägt lokal nur der Schritt `render` einer Video-Übersicht fehl.
- [ ] Eine Video-Übersicht erstellen. Der allererste Container-Start kann einige Minuten dauern, während Cloudflare das Image verteilt.

## 4. Gemini-Kontingente

Die Free-Tier-Limits gelten pro Projekt und Modell (AI Studio → Rate Limits). Chat & Co. laufen deshalb auf Flash-Lite (500/Tag), Flash (20/Tag) nur für Studio-Inhalte, mit Ausweichmodell bei 429/5xx.

- [ ] Embeddings: Gemini Embedding 2 erlaubt 30.000 Tokens pro Minute, der Import schickt 100 Chunks (rund 80.000 Tokens) pro Anfrage. Größere Quellen scheitern daran. Batches verkleinern (etwa 30 Chunks) und zwischen den Batches `step.sleep`.
- [ ] TTS: Tageslimit von `gemini-3.8-flash-tts` in AI Studio prüfen. Ein Video braucht bis zu 8 TTS-Anfragen. Gegebenenfalls `gemini-3.8-flash-lite-tts` als Ausweichmodell.
- [ ] Optional: `gemini-3.5-flash` (eigene 20/Tag) als Stufe zwischen Flash und Flash-Lite für Studio-Inhalte.

## 5. Aufräumen

- [ ] AWS: Amplify-App, S3-Bucket, Lambda, Lambda-Layer und IAM-Policies löschen (falls noch vorhanden).
- [ ] 1Password: AWS-Felder (`AWS_REGION`, `S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) sowie `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` entfernen, falls noch vorhanden.

## 6. Später besprechen: Organisation der Env-Dateien

Aktueller Aufbau:

- `.env`: alle `NEXT_PUBLIC_`-Werte, wird ins Repo committet und in Produktion genutzt.
- `.env.development`: überschreibt Werte aus `.env` lokal (z. B. `NEXT_PUBLIC_APP_URL`).
- `.env.template`: nur `op://`-Referenzen auf die Secrets in 1Password, daraus erzeugt `pnpm env:pull` die `.env.local`.
- `.env.local`: die echten Secrets, nicht im Repo.

Es wird immer wieder angemerkt, dass die `.env` auf GitHub zu sehen ist. Klären, wie das üblicherweise organisiert wird und ob der Aufbau geändert werden sollte.

- [ ] Env-Organisation mit Claude durchsprechen.

## 7. Später: Kommentare aufräumen

Viele Kommentare im Projekt stammen aus der Zeit vor der Kommentar-Richtlinie in `.claude/CLAUDE.md` (Abschnitt „Kommentare“) und verstoßen dagegen: Sie wiederholen den Code, enthalten Anleitungen, Links oder Betriebshinweise oder beschreiben die Entstehung. Solange sie drinstehen, dienen sie beim Schreiben neuen Codes als Vorbild.

- [x] Alle Dateien mit Kommentaren durchgehen (Code, Konfiguration, Templates, SCSS, Skripte) und jeden Kommentar gegen die Richtlinie prüfen: behalten, kürzen oder löschen. Informationen, die woanders fehlen, vorher nach `README.md`, `docs/` oder `.claude/rules/` verschieben.
