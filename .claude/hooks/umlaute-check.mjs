// Meldet ae/oe/ue-Ersatzschreibungen in Kommentaren. Bezeichner (camelCase, snake_case, in Backticks) werden ignoriert.
import { readFileSync } from "node:fs"

const STAEMME =
  /fuer|ueber|koenn|muess|wuerd|gehoer|haeng|pruef|schluessel|zurueck|rueck|loes|aender|waehl|moeglich|naechst|groess|haeufig|abhaengig|veroeffentlich|fuell|laess|laeuft|laedt|faerb|spaet|frueh|zusaetz|oeffn|stoer|natuerlich|duerf|hoeh|laeng|kuerz|gueltig|traeg|fuehr|bestaetig|noetig|beruecksicht|verfueg|aehnlich|waehrend|gruen|schoen|uebersetz|waere|haette|kaeme|zaehl|faell|haelt|raeum|schuetz|eintraeg|geraet|plaetz|zustaend|woert|bloeck|buendig|fuenf|duenn|schlaeg|beruehr|praef|waehr|koerper|hoer|gefaehr|ungefaehr|erklaer|klaer|spaeter|staend|tuer|fuehl/i

const datei = process.argv[2]
const quelle = readFileSync(datei, "utf8")
const treffer = []

for (const kommentar of quelle.matchAll(/\/\*[\s\S]*?\*\/|(?<![:"'\\])\/\/[^\n]*/g)) {
  const zeile = quelle.slice(0, kommentar.index).split("\n").length
  const text = kommentar[0].replace(/`[^`]*`/g, "")
  for (const wort of text.match(/[A-Za-z_]+/g) ?? []) {
    if (wort.includes("_") || /[a-z][A-Z]/.test(wort)) continue
    if (STAEMME.test(wort)) treffer.push(`${datei}:${zeile}: "${wort}"`)
  }
}

if (treffer.length) {
  console.error("Kommentare mit ae/oe/ue statt echter Umlaute, bitte korrigieren:")
  console.error(treffer.join("\n"))
  process.exit(2)
}
