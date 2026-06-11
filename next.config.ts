import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // better-auth zieht ueber seinen kysely-Adapter CJS-Module herein, deren
  // Named Exports Turbopack nicht statisch aufloesen kann. Diese Pakete vom
  // Server-Bundle ausschliessen, damit Node sie zur Laufzeit aufloest.
  // Zusätzlich die AWS-SDK-S3-Pakete extern halten (nicht ins Server-Bundle
  // ziehen) — senkt den Speicherbedarf des Builds.
  serverExternalPackages: [
    "better-auth",
    "@better-auth/kysely-adapter",
    "kysely",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner"
  ],

  // Build-Speicher senken (OOM "Build container ran out of memory" auf Amplify).
  productionBrowserSourceMaps: false,
  experimental: {
    webpackMemoryOptimizations: true,
    serverSourceMaps: false
  },

  // Build-/Backend-only-Pakete aus der File-Trace-Analyse ausschließen — sie
  // werden zur Laufzeit nicht gebraucht und blähen "Collecting build traces" auf.
  // NICHT ausgeschlossen: @aws-sdk/client-s3, @smithy/* (Laufzeit), better-auth,
  // drizzle, postgres, @anthropic-ai/sdk, unpdf.
  outputFileTracingExcludes: {
    "/*": [
      "**/@aws-amplify/**",
      "**/aws-cdk-lib/**",
      "**/@aws-cdk/**",
      "**/esbuild/**",
      "**/@esbuild/**",
      "**/typescript/**",
      "**/@swc/core-*/**"
    ]
  }
}

export default nextConfig
