import { CHAT_MODEL, getAnthropic } from "@/lib/anthropic"

// Standard-Emoji neuer Notebooks (muss zum Default in db/schema.ts passen).
export const DEFAULT_NOTEBOOK_EMOJI = "📔"

// Kuratierte Icon-Bibliothek. Für einen Notebook-Titel wird hieraus automatisch
// genau EIN passendes Emoji gewählt. Bewusst breit über viele Themen gestreut.
export const NOTEBOOK_ICON_LIBRARY = [
  "📔", "📚", "📝", "🔬", "🧪", "🧬", "🚀", "🛰️", "🪐", "💻", "🤖", "📡",
  "📈", "💰", "🏦", "💼", "📊", "🥦", "🍎", "🍳", "🍷", "🌱", "🌳", "🌍",
  "🗺️", "🐾", "🐶", "🐱", "🦠", "💊", "🩺", "🧠", "❤️", "🏛️", "⚖️", "📜",
  "🎓", "🗣️", "🎮", "🚗", "✈️", "🏗️", "⚡", "🔋", "♻️", "🎨", "🎵", "🎬",
  "📷", "⚽", "🏀", "🏋️", "🧘", "🌦️", "☀️", "🔢", "📐", "🧮", "🔑", "🛡️",
  "🔒", "🌐", "📅", "🏠", "🏢", "🛒", "👗", "💡", "🔧", "⛏️", "🛢️", "🌾",
  "🐟", "🍴", "👶", "🐝", "🔥", "💧", "🏔️", "📰", "🎤", "🏥"
]

const SYSTEM_PROMPT = `Du wählst für einen Notebook-Titel das thematisch am besten passende Emoji.
- Antworte NUR mit genau EINEM Emoji aus dieser Liste, ohne weiteren Text:
${NOTEBOOK_ICON_LIBRARY.join(" ")}
- Wähle das Emoji, das das Thema des Titels am treffendsten darstellt.`

// Lässt Claude aus der Bibliothek das passendste Emoji zum Titel wählen.
// Gibt null zurück, wenn nichts Sinnvolles bestimmt werden konnte (leerer Titel,
// API-Fehler, keine Übereinstimmung) — Aufrufer behalten dann das bisherige Emoji.
export async function pickNotebookEmoji(title: string): Promise<string | null> {
  const clean = title.trim()
  if (!clean) return null

  try {
    const message = await getAnthropic().messages.create({
      model: CHAT_MODEL,
      max_tokens: 8,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: clean.slice(0, 200) }]
    })

    const raw = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()

    // Nur ein Emoji aus der Bibliothek akzeptieren.
    return NOTEBOOK_ICON_LIBRARY.find((e) => raw.includes(e)) ?? null
  } catch (err) {
    console.error("Emoji-Auswahl fehlgeschlagen:", err)
    return null
  }
}
