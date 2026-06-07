import type { Metadata } from "next"
import { Google_Sans } from "next/font/google"
import "@/styles/globals.scss"
import Header from "@/components/Header/Header"

const googleSans = Google_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-google-sans"
})

export const metadata: Metadata = {
  title: "NotebookLM Clone",
  icons: {
    icon: [
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" }
    ]
  },
  robots: {
    index: false,
    follow: false
  }
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="de" className={googleSans.variable}>
      <body>
        <Header />
        {children}
      </body>
    </html>
  )
}
