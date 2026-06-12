// Whitelist seriöser deutschsprachiger Nachrichtenquellen für den „Nachrichten"-
// Modus der Web-Quellensuche. Wird als `allowed_domains` an das Claude-
// web_search-Tool übergeben – die Suche liefert dann ausschließlich Treffer von
// diesen Domains. Domains ohne Protokoll/„www"; Subdomains sind eingeschlossen.

export const NEWS_DOMAINS: string[] = [
  // ── Öffentlich-rechtlich (Deutschland) ──────────────────────────────────────
  "tagesschau.de",
  "zdf.de",
  "heute.de",
  "dw.com", // Deutsche Welle
  "deutschlandfunk.de",
  "br.de",
  "wdr.de",
  "ndr.de",
  "swr.de",
  "mdr.de",
  "hessenschau.de",
  "rbb24.de",
  "sr.de",
  "radiobremen.de",
  "tagesschau24.de",

  // ── Überregionale Tageszeitungen / Wochenzeitungen ─────────────────────────
  "sueddeutsche.de",
  "faz.net", // Frankfurter Allgemeine
  "zeit.de",
  "welt.de",
  "tagesspiegel.de",
  "taz.de",
  "fr.de", // Frankfurter Rundschau
  "rnd.de", // RedaktionsNetzwerk Deutschland

  // ── Nachrichtenmagazine / -portale ─────────────────────────────────────────
  "spiegel.de",
  "stern.de",
  "focus.de",
  "ntv.de", // n-tv
  "n-tv.de",
  "t-online.de",

  // ── Wirtschaft / Finanzen (journalistisch) ──────────────────────────────────
  "handelsblatt.com",
  "wiwo.de", // WirtschaftsWoche
  "manager-magazin.de",
  "capital.de",
  "boerse-online.de",

  // ── IT / Technik / Investigativ ─────────────────────────────────────────────
  "heise.de",
  "golem.de",
  "correctiv.org",

  // ── Große regionale Qualitätstitel ──────────────────────────────────────────
  "rp-online.de", // Rheinische Post
  "ksta.de", // Kölner Stadt-Anzeiger
  "merkur.de", // Münchner Merkur
  "tz.de",
  "abendblatt.de", // Hamburger Abendblatt
  "morgenpost.de", // Berliner Morgenpost
  "berliner-zeitung.de",
  "waz.de", // Westdeutsche Allgemeine
  "wa.de",
  "augsburger-allgemeine.de",
  "stuttgarter-zeitung.de",
  "stuttgarter-nachrichten.de",
  "swp.de", // Südwest Presse
  "nordbayern.de",
  "mainpost.de",
  "noz.de", // Neue Osnabrücker Zeitung
  "weser-kurier.de",
  "kn-online.de", // Kieler Nachrichten
  "haz.de", // Hannoversche Allgemeine
  "saarbruecker-zeitung.de",
  "lvz.de", // Leipziger Volkszeitung
  "freiepresse.de",
  "sächsische.de",
  "saechsische.de",
  "general-anzeiger-bonn.de",

  // ── Österreich (deutschsprachig, seriös) ────────────────────────────────────
  "orf.at",
  "derstandard.at",
  "diepresse.com",
  "kurier.at",
  "krone.at",

  // ── Schweiz (deutschsprachig, seriös) ───────────────────────────────────────
  "nzz.ch", // Neue Zürcher Zeitung
  "srf.ch",
  "tagesanzeiger.ch",
  "watson.ch"
]
