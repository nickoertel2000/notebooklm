import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // better-auth zieht ueber seinen kysely-Adapter CJS-Module herein, deren
  // Named Exports Turbopack nicht statisch aufloesen kann. Diese Pakete vom
  // Server-Bundle ausschliessen, damit Node sie zur Laufzeit aufloest.
  serverExternalPackages: ["better-auth", "@better-auth/kysely-adapter", "kysely"]
}

export default nextConfig
