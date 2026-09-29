// Lernformate liegen als Zeilen in `reports` (type = Format-ID), `content` ist JSON statt Markdown.

export type StudioFormatId = "flashcards" | "quiz" | "table" | "mindmap"
export type StudioAmount = "fewer" | "standard" | "more"
export type StudioDifficulty = "easy" | "medium" | "hard"

export type StudioOptions = { amount: StudioAmount; difficulty: StudioDifficulty; focus: string }

export type Flashcards = { title: string; cards: { front: string; back: string }[] }
export type Quiz = { title: string; questions: { question: string; options: string[]; answer: number; explanation: string }[] }
export type DataTable = { title: string; columns: string[]; rows: string[][] }
export type MindmapNode = { label: string; children: MindmapNode[] }
export type Mindmap = { title: string; root: MindmapNode }

export type StudioContent =
  { format: "flashcards"; data: Flashcards } | { format: "quiz"; data: Quiz } | { format: "table"; data: DataTable } | { format: "mindmap"; data: Mindmap }

export type StudioFormat = {
  id: StudioFormatId
  label: string
  icon: string
  hasAmount: boolean
  hasOptions: boolean
  focusLabel: string
  focusPlaceholder: string
}

export const STUDIO_FORMATS: StudioFormat[] = [
  {
    id: "flashcards",
    label: "Karteikarten",
    icon: "style",
    hasAmount: true,
    hasOptions: true,
    focusLabel: "Worum sollen sich die Karteikarten drehen?",
    focusPlaceholder: "Zum Beispiel: nur die Fachbegriffe, die Zahlen und Daten, …"
  },
  {
    id: "quiz",
    label: "Quiz",
    icon: "quiz",
    hasAmount: true,
    hasOptions: true,
    focusLabel: "Worum soll es im Quiz gehen?",
    focusPlaceholder: "Zum Beispiel: die wichtigsten Zusammenhänge, ein bestimmtes Kapitel, …"
  },
  {
    id: "mindmap",
    label: "Mindmap",
    icon: "account_tree",
    hasAmount: false,
    hasOptions: false,
    focusLabel: "",
    focusPlaceholder: ""
  },
  {
    id: "table",
    label: "Datentabelle",
    icon: "table_chart",
    hasAmount: false,
    hasOptions: true,
    focusLabel: "Was soll die Tabelle gegenüberstellen?",
    focusPlaceholder: "Zum Beispiel: alle genannten Werkzeuge mit Zweck, Vorteilen und Grenzen"
  }
]

export function getStudioFormat(id: unknown): StudioFormat | undefined {
  return STUDIO_FORMATS.find((f) => f.id === id)
}

export const AMOUNT_OPTIONS: { id: StudioAmount; label: string }[] = [
  { id: "fewer", label: "Weniger" },
  { id: "standard", label: "Standard" },
  { id: "more", label: "Mehr" }
]

export const DIFFICULTY_OPTIONS: { id: StudioDifficulty; label: string }[] = [
  { id: "easy", label: "Einfach" },
  { id: "medium", label: "Mittel" },
  { id: "hard", label: "Schwer" }
]

export const getAmount = (value: unknown): StudioAmount => AMOUNT_OPTIONS.find((o) => o.id === value)?.id ?? "standard"
export const getDifficulty = (value: unknown): StudioDifficulty => DIFFICULTY_OPTIONS.find((o) => o.id === value)?.id ?? "medium"

const COUNTS: Record<"flashcards" | "quiz", Record<StudioAmount, number>> = {
  flashcards: { fewer: 10, standard: 20, more: 30 },
  quiz: { fewer: 5, standard: 10, more: 15 }
}

const DIFFICULTY_TEXT: Record<StudioDifficulty, string> = {
  easy: "Schwierigkeit leicht: grundlegende Fakten und Begriffe",
  medium: "Schwierigkeit mittel: Verständnis und Zusammenhänge",
  hard: "Schwierigkeit schwer: Details, Anwendung und Transfer"
}

export const STUDIO_SYSTEM_PROMPT = `Du erstellst Lernmaterial ausschließlich auf Basis der bereitgestellten Quellen-Dokumente.
- Stütze dich nur auf die Quellen, erfinde nichts und füge kein Allgemeinwissen hinzu.
- Schreibe alle Texte auf Deutsch, ohne Markdown, mit echten Umlauten und ß (ä, ö, ü, ß), niemals ae, oe, ue oder ss als Ersatz.
- title ist ein kurzer, konkreter Titel zum Thema (höchstens 60 Zeichen), ohne die Formatbezeichnung.`

// Im JSON-Modus ersetzt Gemini Umlaute sonst oft durch ae/oe/ue, der Hinweis im System-Prompt allein reicht nicht.
const UMLAUT_LINE = "\nSchreibe echte Umlaute und ß (ä, ö, ü, ß), niemals ae, oe, ue oder ss."

export function buildStudioInstruction(format: StudioFormat, options: StudioOptions): string {
  const focus = options.focus.trim().slice(0, 1000)
  const focusLine = focus ? `\nSchwerpunkt laut Nutzer: ${focus}` : ""
  return taskFor(format.id, options) + focusLine + UMLAUT_LINE
}

function taskFor(id: StudioFormatId, options: StudioOptions): string {
  switch (id) {
    case "flashcards":
      return `Erstelle ${COUNTS.flashcards[options.amount]} Karteikarten (${DIFFICULTY_TEXT[options.difficulty]}).
Vorderseite (front): eine kurze Frage oder ein Begriff. Rückseite (back): eine knappe, korrekte Antwort in höchstens zwei Sätzen.
Decke die wichtigsten Inhalte der Quellen ab, ohne Dopplungen.`
    case "quiz":
      return `Erstelle ein Quiz mit ${COUNTS.quiz[options.amount]} Multiple-Choice-Fragen (${DIFFICULTY_TEXT[options.difficulty]}).
Jede Frage hat genau vier Antwortmöglichkeiten (options), genau eine davon ist richtig; answer ist ihr Index (0 bis 3). Verteile die Position der richtigen Antwort gleichmäßig.
Die falschen Antworten sind plausibel. explanation erklärt in ein bis zwei Sätzen, warum die richtige Antwort stimmt.`
    case "table":
      return `Erstelle eine Datentabelle, die die wichtigsten Fakten der Quellen strukturiert gegenüberstellt.
Wähle 3 bis 7 sinnvolle Spalten (columns), die erste Spalte benennt den Eintrag. Höchstens 40 Zeilen (rows), jede Zeile hat genau so viele Zellen wie Spalten.
Zellen sind kurz: Stichworte statt Sätze, wo das reicht. Fehlt eine Angabe in den Quellen, schreibe „–“.`
    case "mindmap":
      return `Erstelle eine Mindmap der Quellen. root.label ist das Hauptthema (2 bis 5 Wörter).
Darunter 4 bis 8 Hauptthemen, darunter jeweils 2 bis 6 Unterpunkte, wo sinnvoll eine weitere Ebene.
Labels sind Stichworte mit höchstens 6 Wörtern, keine Sätze.`
  }
}

const str = { type: "string", description: "Deutscher Text mit echten Umlauten (ä, ö, ü, ß)" }
const label = { type: "object", properties: { label: str }, required: ["label"] }
const withChildren = (child: object) => ({
  type: "object",
  properties: { label: str, children: { type: "array", items: child } },
  required: ["label", "children"]
})

// Gemini unterstützt keine rekursiven Schemas, deshalb ist die Tiefe (4 Ebenen) ausgeschrieben.
const MINDMAP_ROOT = withChildren(withChildren(withChildren(label)))

export const STUDIO_SCHEMAS: Record<StudioFormatId, object> = {
  flashcards: {
    type: "object",
    properties: {
      title: str,
      cards: { type: "array", items: { type: "object", properties: { front: str, back: str }, required: ["front", "back"] } }
    },
    required: ["title", "cards"]
  },
  quiz: {
    type: "object",
    properties: {
      title: str,
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: str,
            options: { type: "array", items: str, minItems: 4, maxItems: 4 },
            answer: { type: "integer", minimum: 0, maximum: 3 },
            explanation: str
          },
          required: ["question", "options", "answer", "explanation"]
        }
      }
    },
    required: ["title", "questions"]
  },
  table: {
    type: "object",
    properties: {
      title: str,
      columns: { type: "array", items: str },
      rows: { type: "array", items: { type: "array", items: str } }
    },
    required: ["title", "columns", "rows"]
  },
  mindmap: {
    type: "object",
    properties: { title: str, root: MINDMAP_ROOT },
    required: ["title", "root"]
  }
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "")
const list = (value: unknown, max: number): unknown[] => (Array.isArray(value) ? value.slice(0, max) : [])
const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {})

function parseNode(value: unknown, depth: number): MindmapNode | null {
  const node = record(value)
  const nodeLabel = text(node.label, 120)
  if (!nodeLabel) return null
  const children = depth < 4 ? list(node.children, 12).flatMap((c) => parseNode(c, depth + 1) ?? []) : []
  return { label: nodeLabel, children }
}

// Ungültige Einträge werden verworfen, null erst ohne JSON oder ohne einen gültigen Eintrag.
export function parseStudioContent(formatId: StudioFormatId, raw: string): StudioContent | null {
  let json: Record<string, unknown>
  try {
    json = record(JSON.parse(raw))
  } catch {
    return null
  }
  const title = text(json.title, 120)

  switch (formatId) {
    case "flashcards": {
      const cards = list(json.cards, 60).flatMap((c) => {
        const card = record(c)
        const front = text(card.front, 500)
        const back = text(card.back, 1000)
        return front && back ? [{ front, back }] : []
      })
      return cards.length ? { format: "flashcards", data: { title, cards } } : null
    }
    case "quiz": {
      const questions = list(json.questions, 30).flatMap((q) => {
        const item = record(q)
        const question = text(item.question, 500)
        const options = list(item.options, 4).map((o) => text(o, 300))
        const answer = item.answer
        const valid = question && options.length === 4 && options.every(Boolean) && Number.isInteger(answer) && (answer as number) >= 0 && (answer as number) <= 3
        return valid ? [{ question, options, answer: answer as number, explanation: text(item.explanation, 1000) }] : []
      })
      return questions.length ? { format: "quiz", data: { title, questions } } : null
    }
    case "table": {
      const columns = list(json.columns, 12).map((c) => text(c, 120))
      if (!columns.length) return null
      const rows = list(json.rows, 100).flatMap((r) => {
        const cells = list(r, columns.length).map((c) => text(c, 500))
        if (!cells.some(Boolean)) return []
        while (cells.length < columns.length) cells.push("–")
        return [cells]
      })
      return rows.length ? { format: "table", data: { title, columns, rows } } : null
    }
    case "mindmap": {
      const root = parseNode(json.root, 1)
      return root && root.children.length ? { format: "mindmap", data: { title: title || root.label, root } } : null
    }
  }
}
