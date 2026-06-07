import type { Metadata } from "next"
import { Google_Sans } from "next/font/google"
import "@/styles/globals.scss"

const googleSans = Google_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-google-sans",
})
export const metadata: Metadata = {
  title: "NotebookLM Clone",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="de" className={googleSans.variable}>
      <body>{children}</body>
    </html>
  )
}
