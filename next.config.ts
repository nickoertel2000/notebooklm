import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-auth", "@better-auth/kysely-adapter", "kysely", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"]
}

export default nextConfig
