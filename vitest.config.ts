import path from "node:path"
import { defineConfig } from "vitest/config"

// Eigene Konfiguration statt vite.config.ts: Die Unit-Tests laufen in Node, ohne vinext und Cloudflare-Plugin.
export default defineConfig({
  resolve: {
    alias: {
      "@": import.meta.dirname,
      // Gibt es nur in workerd. Tests, die env brauchen, befüllen den Ersatz selbst.
      "cloudflare:workers": path.resolve(import.meta.dirname, "test/cloudflare-workers.ts")
    }
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node"
  }
})
