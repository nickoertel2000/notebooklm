import { cloudflare } from "@cloudflare/vite-plugin"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import path from "node:path"
import vinext from "vinext"
import { defineConfig } from "vite"
import { patchCssModules } from "vite-css-modules"

// E2E-Tests laufen in der CI ohne Cloudflare-Login: keine Remote-Bindungen (Workers AI), kein Container-Build.
const e2e = process.env.E2E === "1"

// Ohne Docker startet der Dev-Server trotzdem, nur das Rendern der Video-Übersicht schlägt fehl.
const dockerAvailable = !e2e && spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0

export default defineConfig({
  plugins: [
    patchCssModules({ exportMode: "default" }),
    vinext(),
    cloudflare({
      remoteBindings: !e2e,
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"]
      },
      auxiliaryWorkers: [
        {
          configPath: "./workers/jobs/wrangler.jsonc",
          config: (config) => ({ dev: { ...config.dev, enable_containers: dockerAvailable } })
        }
      ]
    })
  ],
  css: {
    modules: {
      generateScopedName(name: string, filename: string) {
        const relativePath = path.relative(import.meta.dirname, filename.replace(/\?.*$/, "")).replaceAll("\\", "/")
        return `_${name}_${createHash("sha256").update(relativePath).digest("hex").slice(0, 7)}`
      }
    }
  }
})
