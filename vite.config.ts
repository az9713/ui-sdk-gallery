import { svelte } from "@sveltejs/vite-plugin-svelte"
import { defineConfig } from "vitest/config"

// Vitest reads this file. The page build is scripts/build.mjs.
export default defineConfig({
  plugins: [svelte({ configFile: false })],
  // Set D: Svelte and Solid give their server build without this condition.
  resolve: { conditions: ["browser"] },
  test: {
    // Vite resolves these, so that each one gets its browser build and 1 copy of core.
    server: { deps: { inline: [/solid-js/, /@solidjs/, /svelte/, /@ui-sdk/] } },
    environment: "jsdom",
    setupFiles: ["./src/setup.ts"],
    css: false,
    include: ["ui/*.test.ts", "src/**/*.test.ts"],
  },
})
