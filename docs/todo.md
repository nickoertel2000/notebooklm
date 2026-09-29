# ToDo: Go-live auf Cloudflare

Stand: 29.09.2026. Der Code ist migriert (Branch `feat/cloudflare-migration`). Offen sind nur Infrastruktur- und Konto-Schritte. Reihenfolge einhalten, spätere Schritte bauen auf früheren auf.

Erledigt: Workers Paid ist aktiv, R2-Bucket `notebooklm` (Jurisdiction `eu`) ist angelegt, die Migrationen sind neu aufgebaut (`db/migrations/0000_enable_pgvector.sql`, `0001_init.sql`).

## 1. Datenbank (Neon)

Details und Begründung: [`umstellung-neon.md`](umstellung-neon.md).

- [ ] Neon-Projekt `notebooklm` anlegen, Region Frankfurt (`aws-eu-central-1`), direkte Verbindung ohne `-pooler`, `sslmode=require`.
- [ ] Connection-String in 1Password unter `Development → NotebookLM → DATABASE_URL` eintragen. `.env.template` nutzt denselben Eintrag für `DATABASE_URL` und `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.
- [ ] `pnpm env:pull`
- [ ] `pnpm db:migrate`. `0000_enable_pgvector` legt die Extension an, `0001_init` das komplette Schema. Danach prüfen, ob der HNSW-Index `source_chunks_embedding_idx` existiert.

## 2. Hyperdrive

- [ ] Hyperdrive anlegen, ohne dass der Connection-String im Terminal erscheint:

  ```sh
  pnpm exec wrangler hyperdrive create notebooklm-db --connection-string="$(op read op://Development/NotebookLM/DATABASE_URL)"
  ```

- [ ] Die zurückgegebene ID ersetzt `HYPERDRIVE_ID` in `wrangler.jsonc` **und** `workers/jobs/wrangler.jsonc`. Das Placement (`aws:eu-central-1`, passend zu Neon Frankfurt) ist dort bereits eingetragen. Falls Neon in einer anderen Region landet, dort anpassen.
- [ ] `pnpm cf-typegen`, `pnpm typecheck`.

## 3. Lokal testen

- [ ] `pnpm dev` → Login, Notebook anlegen, PDF/URL/Text-Quelle (Status `ready`), Chat mit Zitaten, Bericht, Audio. Die Video-Übersicht wird erst in Produktion getestet (siehe unten).

## 4. Google OAuth

- [ ] Google Cloud Console → OAuth-Client → autorisierte Redirect-URI ergänzen: `https://notebooklm.fancy-cherry-09d8.workers.dev/api/auth/callback/google`

## 5. Erster Deploy

Die App bindet die Workflows des Jobs-Workers per `script_name`, und beide Worker verlangen ihre Secrets (`secrets.required`) schon beim Deploy. `pnpm cf:first-deploy` erledigt beides in der richtigen Reihenfolge: erst der Jobs-Worker, dann die App, jeweils mit den Secrets aus 1Password (`wrangler deploy --secrets-file`, die Werte erscheinen nicht im Terminal). Der Jobs-Worker wird dabei mit `--containers-rollout=none` deployt: Worker-Code und Workflows sind live, das Container-Image für die Video-Übersicht baut Cloudflare in Schritt 6. **Docker auf dem eigenen Rechner ist nicht nötig.**

- [ ] `pnpm build`
- [ ] `pnpm cf:first-deploy`
- [ ] Smoke-Test auf der workers.dev-URL: Login, Quelle, Chat, Bericht, Audio. Video funktioniert erst nach Schritt 6.

Später geänderte Secrets überträgt `pnpm cf:secrets`. Die Secret-Listen stehen in `scripts/cf.mjs` und müssen nach der Gemini-Umstellung angepasst werden (siehe [`umstellung-gemini.md`](umstellung-gemini.md)).

## 6. Workers Builds (baut auch das Video-Container-Image)

Im Dashboard unter Workers & Pages → jeweiliger Worker → Settings → Builds mit dem GitHub-Repo verbinden. Der Worker-Name muss zum `name` in der `wrangler.jsonc` im Root-Verzeichnis passen, deshalb hat der Jobs-Worker sein eigenes Root-Verzeichnis. Dort gibt es keine `package.json`, die Befehle wechseln daher selbst ins Repo-Root.

| Worker            | Root-Verzeichnis | Build command                                              | Deploy command                     |
| ----------------- | ---------------- | ---------------------------------------------------------- | ---------------------------------- |
| `notebooklm-jobs` | `workers/jobs`   | `cd ../.. && pnpm install --frozen-lockfile && pnpm build` | `cd ../.. && pnpm run deploy:jobs` |
| `notebooklm`      | `/` (Repo-Root)  | `pnpm build`                                               | `pnpm run deploy:app`              |

- [ ] Production-Branch bei beiden: `I-######-I-PRODUKTION-I-######-I`
- [ ] Builds für andere Branches (Preview/Non-production) **deaktivieren**.
- [ ] Ersten Merge in den Production-Branch auslösen. Der Jobs-Build führt `wrangler deploy` ohne `--containers-rollout=none` aus und baut dabei das Image aus `containers/video-renderer/Dockerfile` in Cloudflares Build-Umgebung.
- [ ] Eine Video-Übersicht erstellen. Der allererste Container-Start kann einige Minuten dauern, während Cloudflare das Image verteilt.

## 7. Aufräumen

- [ ] AWS: Amplify-App, S3-Bucket, Lambda, Lambda-Layer und IAM-Policies löschen (falls noch vorhanden).
- [ ] 1Password: AWS-Felder (`AWS_REGION`, `S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) entfernen.

## Warum kein Docker nötig ist

Das `Dockerfile` ist nur das Rezept für das Image des Video-Renderers. Gebaut wird es von Cloudflare, sobald Workers Builds den Jobs-Worker deployt. Auf dem eigenen Rechner würde Docker nur gebraucht, um das Rendern lokal mit `pnpm dev` zu testen. Ohne Docker startet der Dev-Server trotzdem, nur der Schritt `render` einer Video-Übersicht schlägt lokal fehl.
