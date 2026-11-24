import { defineConfig } from "vitest/config"

// Vitest reads this file. The page build is scripts/build.mjs.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setup.ts"],
    css: false,
    include: ["ui/*.test.ts", "src/**/*.test.ts"],
  },
})
