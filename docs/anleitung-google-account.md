# Anleitung: Gemini-Key und Demo-Vorlage

Stand: 29.09.2026. Die App braucht von Google nur noch einen **Gemini-API-Key** (alle KI-Funktionen außer Folienbildern und Websuche), dazu einen **Tavily-API-Key** für die Websuche. Einen OAuth-Client gibt es nicht: Der Google-Button auf der Login-Seite ist nur ein Teaser, Besucher nutzen den Demo-Zugang. Die Beschriftungen in Googles Oberfläche hängen von der Spracheinstellung ab, deshalb stehen die englischen Begriffe in Klammern dahinter.

Anthropic und Voyage AI werden nicht mehr gebraucht. Für die Folienbilder ist nichts zu tun, sie laufen über Workers AI im vorhandenen Cloudflare-Konto.

## 1. Gemini-API-Key erstellen

1. Im neuen Google-Account anmelden und [aistudio.google.com](https://aistudio.google.com) öffnen. Beim ersten Aufruf die Nutzungsbedingungen bestätigen.
2. Links auf **„API-Schlüssel“ (API keys)** klicken oder direkt [aistudio.google.com/api-keys](https://aistudio.google.com/api-keys) öffnen.
3. **„API-Schlüssel erstellen“ (Create API key)** klicken.
4. Im Dialog ein Projekt wählen. Gibt es noch keins, **„Projekt erstellen“ (Create project)** wählen und `NotebookLM` nennen.
5. Den Key kopieren und sofort in 1Password eintragen (siehe Schritt 2).
6. In der Liste der Keys muss beim Projekt **„Free“ / „Kostenlos“** als Tarif stehen.

**Wichtig:** Im Projekt **kein Billing einrichten** („Set up billing“, „Upgrade“, „Abrechnung einrichten“ nicht anklicken). Sobald am Projekt eine Zahlungsmethode hängt, wird jeder Aufruf kostenpflichtig, ein Gratis-Kontingent gibt es dann nicht mehr.

## 1b. Tavily-API-Key erstellen (Websuche)

Die Websuche nach neuen Quellen läuft über Tavily, weil die Google-Suche von Gemini im Gratis-Tarif kein Kontingent hat. Gratis sind 1.000 Credits pro Monat ohne Kreditkarte (schnelle Recherche 1 Credit, Deep Research 2). Ist das Kontingent aufgebraucht, meldet nur die Websuche einen Fehler, Kosten entstehen keine.

1. [app.tavily.com](https://app.tavily.com) öffnen und mit Google oder GitHub anmelden.
2. Im Dashboard steht unter **„API Keys“** bereits ein Key (`tvly-…`). Kopieren und in 1Password eintragen (siehe Schritt 2).
3. **Keine Zahlungsmethode hinterlegen**, dann bleibt es beim Gratis-Tarif.

## 2. 1Password aktualisieren

Im Tresor `Development`, Eintrag `NotebookLM`, das Feld `GEMINI_API_KEY` mit dem Key aus Schritt 1 ersetzen und ein neues Feld `TAVILY_API_KEY` mit dem Key aus Schritt 1b anlegen. `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` können gelöscht werden, der Code liest sie nicht mehr.

Danach lokal übernehmen:

```sh
pnpm env:pull   # .env.local neu aus 1Password erzeugen
```

## 3. Modell-IDs prüfen

Einmal prüfen, ob die Modell-IDs in den `wrangler.jsonc` (`gemini-3.8-flash`, `gemini-embedding-2`, `gemini-3.8-flash-tts`) für den Key verfügbar sind. Das Skript gibt nur Modellnamen aus, nie den Key:

```sh
node --env-file=.env.local scripts/gemini-models.mjs
```

## 4. Demo-Vorlage anlegen

Jeder Besucher, der auf „Demo-Zugang erstellen“ klickt, bekommt eine Kopie aller Notebooks des Vorlage-Kontos.

1. `pnpm dev` starten, [localhost:3000/login](http://localhost:3000/login) öffnen.
2. **„Noch kein Konto? Registrieren“** klicken und das Vorlage-Konto anlegen:
   - Nutzername: `Vorlage`
   - E-Mail: **`demo@notebooklm.invalid`** (muss exakt `DEMO_TEMPLATE_EMAIL` in `wrangler.jsonc` entsprechen)
   - Passwort: ein starkes Passwort, in 1Password speichern (z. B. als Feld `DEMO_TEMPLATE_PASSWORD`)
3. Im Vorlage-Konto die Beispiel-Notebooks aufbauen: Quellen hinzufügen, ein paar Chat-Fragen stellen, je einen Bericht, eine Audio- und eine Video-Übersicht erzeugen. Kopiert wird nur, was fertig ist.
4. Abmelden, auf **„Demo-Zugang erstellen“** klicken, anmelden und prüfen, ob alles angekommen ist.

Das lokale `pnpm dev` nutzt dieselbe Datenbank und denselben R2-Bucket wie die Produktion, die Vorlage ist also auch in Produktion sofort da.

**E-Mail oder Passwort nachträglich ändern** (z. B. Passwort vergessen): Das neue Passwort in 1Password unter `Development → NotebookLM → DEMO_TEMPLATE_PASSWORD` ablegen, dann

```sh
node --env-file=.env.local scripts/demo-template-login.mjs --from <bisherige E-Mail> --to demo@notebooklm.invalid          # Vorschau
node --env-file=.env.local scripts/demo-template-login.mjs --from <bisherige E-Mail> --to demo@notebooklm.invalid --apply  # ausführen
```

Ändert sich die E-Mail, muss `DEMO_TEMPLATE_EMAIL` in `wrangler.jsonc` angepasst werden.

**Wichtig:** Notebooks, Audios und Videos im Vorlage-Konto **nicht löschen**, solange Demo-Konten existieren. Die Kopien verweisen auf die Dateien der Vorlage. Neue Notebooks hinzufügen oder bestehende ergänzen ist unkritisch, das bekommen aber nur neue Demo-Konten.

## 5. Produktion

- Vor dem ersten Deploy: `pnpm cf:first-deploy` überträgt die Secrets aus 1Password automatisch (siehe [`todo.md`](todo.md), Schritt 5).
- Sind die Worker schon deployt: `pnpm cf:secrets`.

## Kontrolle

- Gemini-Verbrauch: [aistudio.google.com/usage](https://aistudio.google.com/usage)
- Tarif des Projekts: [aistudio.google.com/api-keys](https://aistudio.google.com/api-keys) (muss „Free“ bleiben)
- Folienbilder (Neuronen pro Tag): Cloudflare-Dashboard → **AI** → **Workers AI**
- Aufräumen der Demo-Konten: Cloudflare-Dashboard → Worker `notebooklm-jobs` → **Logs** (täglich 3 Uhr UTC, „Inaktive Demo-Konten gelöscht: n“)
