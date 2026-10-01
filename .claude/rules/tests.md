---
paths:
  - "**/*.test.ts"
  - "vitest.config.ts"
  - "test/**"
  - "e2e/**"
  - "playwright.config.ts"
  - ".github/workflows/**"
---

# Tests (Vitest)

- Nur Unit-Tests, für reine Logik ohne DB-, R2-, Netzwerk- oder KI-Aufrufe: Parser für Modellausgaben, Chunking, Zitat-Mapping, WAV-Verarbeitung, Modellketten, Eingabevalidierung. Sie liegen neben dem Code als `lib/<name>.test.ts`.
- `vitest.config.ts` ist absichtlich von `vite.config.ts` getrennt: Tests laufen in Node ohne vinext und das Cloudflare-Plugin. `cloudflare:workers` ist auf `test/cloudflare-workers.ts` gemappt (ein leeres `env`-Objekt); ein Test, der Env-Werte braucht, setzt sie mit `Object.assign(env, { … })`, weil die generierten `Cloudflare.Env`-Typen String-Literale sind.
- Code, der getestet werden soll, aber in einer Route-Datei liegt, nach `lib/` verschieben (Beispiel: `lib/citations.ts` aus der Chat-Route). Route-Dateien exportieren nur Handler.
- Auch in Tests nie ein Literal-NUL schreiben, `String.fromCharCode(0)` verwenden.
- Unit-Tests legen nie Daten in der Produktions-DB an und rufen keine echten APIs auf.

# E2E (Playwright)

- `e2e/*.spec.ts`, ausgeführt mit `pnpm test:e2e`, lokal und in CI gleich (Chromium wird einmalig mit `pnpm exec playwright install chromium` installiert, in CI als eigener Schritt): `e2e/global-setup.ts` führt `docker compose up -d --wait --force-recreate` aus (`compose.yaml`, tmpfs, bei jedem Lauf frische DB auf `localhost:5433`) und gibt `docker compose down` als Teardown zurück. Voraussetzungen: ein laufendes Docker (Docker Desktop auf dem Rechner des Nutzers) und das installierte Chromium.
- Schutz vor Produktion: Der Dev-Server lädt weiterhin `.env.local`, aber Prozess-Env hat Vorrang (wrangler `loadDotEnv`). Daher muss `webServer.env` jedes Secret aus `secrets.required` beider Worker sowie den Hyperdrive-Connection-String überschreiben; ein neues Pflicht-Secret kommt ebenfalls dorthin. `reuseExistingServer: false`, weil ein laufendes `pnpm dev` mit der Produktion spricht.
- `e2e/global-setup.ts` führt die Drizzle-Migrationen aus und befüllt die Demo-Vorlage (`DEMO_TEMPLATE_EMAIL`, gelesen aus `wrangler.jsonc`) mit einer fertigen Quelle, einem Chunk ohne Embedding, einer Chat-Antwort mit Zitat `[1]` sowie je einem Bericht, Audio und Video ohne Datei. Die Vorlage hat feste IDs (`templateIds`), `e2e/authz.spec.ts` greift darauf als fremder Nutzer zu. Texte, auf die die Specs prüfen, liegen in `e2e/seed-data.ts`.
- Playwright startet `pnpm dev` mit `E2E=1`: `vite.config.ts` schaltet dann Remote-Bindings (Workers AI) und Container ab, sodass kein Cloudflare-Login nötig ist. Gemini/Tavily bekommen Platzhalter-Keys: Tests warten nie auf KI-Ergebnisse (die Ingestion endet im Hintergrund als `failed`, Auto-Titel wird verschluckt). Tests prüfen nur, was ohne KI passiert.
- Ein Worker: `POST /api/demo` ist pro IP auf 2 Konten pro Minute begrenzt, daher nutzt höchstens ein Test den Demo-Zugang. Andere Tests legen ihr Konto mit `createAccount()` direkt in der Test-DB an (Passwort-Hash über `better-auth/crypto`) und melden sich mit `signIn()` an, zusammen `signInAsNewUser()` (`e2e/helpers.ts`). Alle Anmeldungen teilen sich `AUTH_RATE_LIMITER` (20 pro Minute pro IP, `local` im Dev): Die gesamte Suite muss innerhalb einer Minute darunter bleiben.
- Der Dev-Server kompiliert Client-Code bei der ersten Anfrage: Klicks vor der Hydration gehen stillschweigend verloren (Buttons tun nichts, Formulare werden nativ abgeschickt, `Link` lädt komplett neu). Nach jedem vollständigen Seitenaufruf `gotoPage()` / `waitForHydration()` / `expectHome()` aus `e2e/helpers.ts` aufrufen. Reine CSS-Effekte (Tooltips bei Hover) funktionieren ohne Hydration und beweisen nichts.
- Turnstile läuft in den Tests mit Cloudflares Test-Keys, die jedes Token bestätigen. Negativtests prüfen deshalb nur fehlende Tokens.
- `e2e/quota.spec.ts` prüft das Tageslimit über `discover` (das Kontingent wird vor dem Tavily-Aufruf gebucht, der mit dem Platzhalter-Key scheitert) und die Obergrenze für Notebooks, deren Notebooks der Test per SQL anlegt.
- `e2e/jobs.spec.ts` legt hängende Jobs per SQL an und prüft, dass die Listen sie als `failed` zeigen, die DB-Zeile aber `processing` bleibt.
- `e2e/authz.spec.ts` ruft jede Notebook-Route als zweiter Nutzer auf und erwartet 404; ein eigener Test vergleicht die Liste mit allen exportierten Handlern unter `app/api/notebooks/[notebookId]/`. Eine neue Route unter `app/api/notebooks/[notebookId]/` bekommt dort einen Eintrag in `notebookRoutes`.
- Ein leeres Notebook öffnet den Dialog zum Hinzufügen von Quellen von selbst; dort nicht auf "Quellen hinzufügen" klicken.
- Locators verwenden sichtbare deutsche Texte und `aria-label`s; CSS-Modul-Klassen nur über den Originalnamen (`toHaveClass(/sourceItemActive/)`, gescopte Namen behalten ihn).
- Deploy-Gate: Die Build-Befehle von Workers Builds beider Worker führen vor `pnpm build` `pnpm check` aus (Lint, Format-Check, Typecheck, Tests), sodass ein roter Check das Deploy beider Worker stoppt. GitHub Actions (`.github/workflows/ci.yml`) führt bei jedem Push auf `main` dieselben Checks plus den E2E-Job aus, für frühes Feedback und das README-Badge; es blockiert nichts.
