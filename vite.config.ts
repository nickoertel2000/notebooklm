import { cloudflare } from "@cloudflare/vite-plugin"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import path from "node:path"
import vinext from "vinext"
import { defineConfig } from "vite"
import { patchCssModules } from "vite-css-modules"

// Der Video-Renderer-Container braucht lokal einen Docker-Daemon. Ohne Docker
// startet der Dev-Server trotzdem, nur das Rendern der Video-Übersicht schlägt fehl.
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0

export default defineConfig({
  plugins: [
    patchCssModules({ exportMode: "default" }),
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"]
      },
      // Jobs-Worker läuft im selben Dev-Server, damit die Workflow-Bindings der App lokal funktionieren.
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
