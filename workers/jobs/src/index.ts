import { deleteInactiveDemoAccounts } from "@/lib/demo"

export { IngestSourceWorkflow } from "./workflows/ingestSource"
export { ReportWorkflow } from "./workflows/report"
export { AudioWorkflow } from "./workflows/audio"
export { VideoWorkflow } from "./workflows/video"
export { VideoRenderer } from "./videoRenderer"

export default {
  fetch() {
    return new Response(null, { status: 404 })
  },
  async scheduled() {
    const deleted = await deleteInactiveDemoAccounts()
    console.log(`Inaktive Demo-Konten gelöscht: ${deleted}`)
  }
} satisfies ExportedHandler
