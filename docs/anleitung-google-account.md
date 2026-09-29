# Anleitung: Demo-Vorlage und Kontrolle

## Demo-Vorlage

Jeder Besucher, der auf „Demo-Zugang erstellen“ klickt, bekommt ein eigenes Konto mit einer Kopie aller Notebooks des Vorlage-Kontos **`demo@notebooklm.invalid`** (muss exakt `DEMO_TEMPLATE_EMAIL` in `wrangler.jsonc` entsprechen). Welche Notebooks dort hineingehören, steht in [`demo-notebooks.md`](demo-notebooks.md).

**Vorlage bearbeiten:** Mit dem Vorlage-Konto anmelden (Passwort in 1Password unter `Development → NotebookLM → DEMO_TEMPLATE_PASSWORD`), Quellen hinzufügen, Chat-Fragen stellen, Studio-Inhalte erzeugen. Kopiert wird nur, was fertig ist. Das lokale `pnpm dev` nutzt dieselbe Datenbank und denselben R2-Bucket wie die Produktion, Änderungen sind also sofort auch live.

**Prüfen:** Abmelden, auf **„Demo-Zugang erstellen“** klicken und kontrollieren, ob alles angekommen ist.

**Wichtig:** Notebooks, Audios und Videos im Vorlage-Konto **nicht löschen**, solange Demo-Konten existieren. Die Kopien verweisen auf die Dateien der Vorlage. Neue Notebooks hinzufügen oder bestehende ergänzen ist unkritisch, das bekommen aber nur neue Demo-Konten.

**E-Mail oder Passwort ändern** (z. B. Passwort vergessen): Das neue Passwort in 1Password unter `DEMO_TEMPLATE_PASSWORD` ablegen, dann

```sh
node --env-file=.env.local scripts/demo-template-login.mjs --from <bisherige E-Mail> --to demo@notebooklm.invalid          # Vorschau
node --env-file=.env.local scripts/demo-template-login.mjs --from <bisherige E-Mail> --to demo@notebooklm.invalid --apply  # ausführen
```

Ändert sich die E-Mail, muss `DEMO_TEMPLATE_EMAIL` in `wrangler.jsonc` angepasst werden.

## Secrets ändern

Neuen Wert in 1Password unter `Development → NotebookLM` eintragen, dann `pnpm env:pull` (lokal) und `pnpm cf:secrets` (Produktion).

## Kontrolle

- **Kein Billing im Google-Projekt einrichten** („Abrechnung einrichten“, „Upgrade“ nicht anklicken, auch wenn AI Studio bei erreichten Limits dazu auffordert). Mit Zahlungsmethode wird jeder Aufruf kostenpflichtig, ein Gratis-Kontingent gibt es dann nicht mehr. Tarif prüfen: [aistudio.google.com/api-keys](https://aistudio.google.com/api-keys) (muss „Free“ bleiben).
- Gemini-Limits pro Modell: [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit?timeRange=last-28-days). Die Tageskontingente setzen sich um Mitternacht Pacific-Zeit zurück (09:00 deutscher Zeit).
- Tavily-Credits (1.000 pro Monat, keine Zahlungsmethode hinterlegen): [app.tavily.com](https://app.tavily.com)
- Folienbilder (Neuronen pro Tag): Cloudflare-Dashboard → **AI** → **Workers AI**
- Aufräumen der Demo-Konten: Cloudflare-Dashboard → Worker `notebooklm-jobs` → **Logs** (täglich 3 Uhr UTC, „Inaktive Demo-Konten gelöscht: n“)
