import "@/styles/globals.scss"
import type { Metadata } from "next"
import localFont from "next/font/local"

const googleSans = localFont({
  src: [
    { path: "./fonts/GoogleSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/GoogleSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/GoogleSans-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/GoogleSans-Bold.woff2", weight: "700", style: "normal" }
  ],
  variable: "--font-google-sans",
  fallback: ["Arial", "sans-serif"],
  display: "swap"
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
      <body>{children}</body>
    </html>
  )
}
