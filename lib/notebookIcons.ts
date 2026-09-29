import { chatModel, generateText } from "@/lib/gemini"

// Muss zum Default in db/schema.ts passen.
export const DEFAULT_NOTEBOOK_EMOJI = "📔"

export const NOTEBOOK_ICON_LIBRARY = [
  "📔",
  "📚",
  "📝",
  "🔬",
  "🧪",
  "🧬",
  "🚀",
  "🛰️",
  "🪐",
  "💻",
  "🤖",
  "📡",
  "📈",
  "💰",
  "🏦",
  "💼",
  "📊",
  "🥦",
  "🍎",
  "🍳",
  "🍷",
  "🌱",
  "🌳",
  "🌍",
  "🗺️",
  "🐾",
  "🐶",
  "🐱",
  "🦠",
  "💊",
  "🩺",
  "🧠",
  "❤️",
  "🏛️",
  "⚖️",
  "📜",
  "🎓",
  "🗣️",
  "🎮",
  "🚗",
  "✈️",
  "🏗️",
  "⚡",
  "🔋",
  "♻️",
  "🎨",
  "🎵",
  "🎬",
  "📷",
  "⚽",
  "🏀",
  "🏋️",
  "🧘",
  "🌦️",
  "☀️",
  "🔢",
  "📐",
  "🧮",
  "🔑",
  "🛡️",
  "🔒",
  "🌐",
  "📅",
  "🏠",
  "🏢",
  "🛒",
  "👗",
  "💡",
  "🔧",
  "⛏️",
  "🛢️",
  "🌾",
  "🐟",
  "🍴",
  "👶",
  "🐝",
  "🔥",
  "💧",
  "🏔️",
  "📰",
  "🎤",
  "🏥"
]

const SYSTEM_PROMPT = `Du wählst für einen Notebook-Titel das thematisch am besten passende Emoji.
- Antworte NUR mit genau EINEM Emoji aus dieser Liste, ohne weiteren Text:
${NOTEBOOK_ICON_LIBRARY.join(" ")}
- Wähle das Emoji, das das Thema des Titels am treffendsten darstellt.`

export async function pickNotebookEmoji(title: string): Promise<string | null> {
  const clean = title.trim()
  if (!clean) return null

  try {
    const raw = await generateText({
      model: chatModel(),
      system: SYSTEM_PROMPT,
      prompt: clean.slice(0, 200),
      maxOutputTokens: 50,
      minimalThinking: true
    })

    return NOTEBOOK_ICON_LIBRARY.find((e) => raw.includes(e)) ?? null
  } catch (err) {
    console.error("Emoji-Auswahl fehlgeschlagen:", err)
    return null
  }
}
