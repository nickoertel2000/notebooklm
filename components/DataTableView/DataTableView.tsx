import type { DataTable } from "@/lib/studio"
import styles from "./DataTableView.module.scss"

export default function DataTableView({ data }: { data: DataTable }) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            {data.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, r) => (
            <tr key={r}>{row.map((cell, c) => (c === 0 ? <th key={c}>{cell}</th> : <td key={c}>{cell}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Tabulatorgetrennt, damit das Einfügen in Tabellenkalkulationen Spalten ergibt.
export function tableToTsv(data: DataTable): string {
  return [data.columns, ...data.rows].map((row) => row.map((cell) => cell.replace(/[\t\n]+/g, " ")).join("\t")).join("\n")
}
