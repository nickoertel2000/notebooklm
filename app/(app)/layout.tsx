// vinext erkennt dynamische APIs (headers()) nicht beim Build. Alle Seiten hier sind
// nutzerspezifisch und dürfen nie aus einem Cache kommen.
export const dynamic = "force-dynamic"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
