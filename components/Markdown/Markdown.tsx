import { Fragment, ReactNode } from "react"
import styles from "./markdown.module.scss"

// Minimaler Markdown-Renderer für die von Claude erzeugten Berichte.
// Unterstützt: Überschriften (#/##/###), Aufzählungen (- / *), Nummerierungen
// (1.), Absätze und **fett**. Bewusst klein gehalten — kein HTML, keine Tabellen.

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "p"; text: string }

function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "p", text: paragraph.join(" ") })
      paragraph = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      continue
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushParagraph()
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] })
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph()
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""))
        i++
      }
      i--
      blocks.push({ kind: "ul", items })
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph()
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""))
        i++
      }
      i--
      blocks.push({ kind: "ol", items })
      continue
    }

    paragraph.push(trimmed)
  }
  flushParagraph()

  return blocks
}

// **fett** in React-Nodes auflösen.
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part)
    if (bold) return <strong key={i}>{bold[1]}</strong>
    return <Fragment key={i}>{part}</Fragment>
  })
}

export default function Markdown({ children }: { children: string }) {
  const blocks = parse(children)
  return (
    <div className={styles.markdown}>
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          const Tag = (`h${block.level}` as "h1" | "h2" | "h3")
          return <Tag key={i}>{renderInline(block.text)}</Tag>
        }
        if (block.kind === "ul") {
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          )
        }
        if (block.kind === "ol") {
          return (
            <ol key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ol>
          )
        }
        return <p key={i}>{renderInline(block.text)}</p>
      })}
    </div>
  )
}
