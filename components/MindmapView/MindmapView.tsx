"use client"

import { useState } from "react"
import "material-symbols"
import type { Mindmap, MindmapNode } from "@/lib/studio"
import styles from "./MindmapView.module.scss"

function collectPaths(node: MindmapNode, path: string, out: string[]) {
  if (!node.children.length) return out
  out.push(path)
  node.children.forEach((c, i) => collectPaths(c, `${path}.${i}`, out))
  return out
}

export default function MindmapView({ data }: { data: Mindmap }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(["0"]))

  function toggle(path: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.toolBtn} onClick={() => setOpen(new Set(collectPaths(data.root, "0", [])))}>
          <span className="material-symbols-outlined">unfold_more</span>
          Alle aufklappen
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => setOpen(new Set(["0"]))}>
          <span className="material-symbols-outlined">unfold_less</span>
          Einklappen
        </button>
      </div>
      <div className={styles.canvas}>
        <Branch node={data.root} path="0" depth={0} open={open} onToggle={toggle} />
      </div>
    </div>
  )
}

type BranchProps = { node: MindmapNode; path: string; depth: number; open: Set<string>; onToggle: (path: string) => void }

function Branch({ node, path, depth, open, onToggle }: BranchProps) {
  const hasChildren = node.children.length > 0
  const expanded = hasChildren && open.has(path)

  return (
    <div className={styles.branch}>
      <button
        type="button"
        className={`${styles.node} ${styles[`level${Math.min(depth, 3)}`]}`}
        onClick={() => hasChildren && onToggle(path)}
        aria-expanded={hasChildren ? expanded : undefined}
        disabled={!hasChildren}
      >
        <span className={styles.label}>{node.label}</span>
        {hasChildren && <span className={`material-symbols-outlined ${styles.chevron}`}>{expanded ? "chevron_left" : "chevron_right"}</span>}
      </button>
      {expanded && (
        <ul className={styles.children}>
          {node.children.map((child, i) => (
            <li key={i} className={styles.child}>
              <Branch node={child} path={`${path}.${i}`} depth={depth + 1} open={open} onToggle={onToggle} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
