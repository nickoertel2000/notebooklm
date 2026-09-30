export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

const LOCAL_HOSTNAME = /(^|\.)(localhost|local|internal|home|lan)$/i

function isPrivateIPv4(host: string) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

// Hostnamen, die per DNS auf private Adressen zeigen, erkennt das nicht. In Workers erreicht
// fetch() keine privaten Netze, im lokalen Dev-Server aber schon, deshalb die Prüfung.
export function parsePublicUrl(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (url.username || url.password) return null
  const host = url.hostname
  if (host.startsWith("[") || LOCAL_HOSTNAME.test(host) || isPrivateIPv4(host) || !host.includes(".")) return null
  return url
}
