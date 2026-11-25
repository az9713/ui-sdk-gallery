// npm run build    writes dist/index.html and dist/gallery.js with each UI of ui/.
// The gate calls build() with 1 id, so that a broken file of a different UI cannot stop it.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import { build as vite } from "vite"

const here = join(dirname(fileURLToPath(import.meta.url)), "..")

const uiFiles = (ids) =>
  readdirSync(join(here, "ui"))
    .filter((f) => /^[A-Z]\d\d-[a-z0-9-]+\.tsx?$/.test(f))
    .filter((f) => !ids || ids.includes(f.slice(0, 3)))
    .sort()

async function build({ ids = null, outDir = "dist", strict = false } = {}) {
  const files = uiFiles(ids)
  const result = (file) => {
    const path = join(here, "results", `${file.slice(0, 3)}.json`)
    return existsSync(path) ? readFileSync(path, "utf8") : "null"
  }
  const entry = [
    // Strict mode turns each development warning of the SDK into an error. The gate build uses it.
    strict ? `import "../src/strict.ts"` : "",
    `import { start } from "../src/shell.ts"`,
    ...files.flatMap((f, i) => [`import ui${i} from "../ui/${f}"`, `import raw${i} from "../ui/${f}?raw"`]),
    `start([${files.map((f, i) => `{ def: ui${i}, source: raw${i}, result: ${result(f)} }`).join(", ")}])`,
  ].join("\n")
  // The entry is a real file: 1 for each out folder, so that 2 gate runs at the same time do not share it.
  const entryFile = join(here, ".entries", `${outDir.replaceAll("/", "-")}.ts`)
  mkdirSync(dirname(entryFile), { recursive: true })
  writeFileSync(entryFile, entry)
  await vite({
    root: here,
    configFile: false,
    logLevel: "warn",
    // Set D: React and Vue read these names at run time, and a lib build does not replace them.
    plugins: [svelte({ configFile: false })],
    define: {
      "process.env.NODE_ENV": '"production"',
      __VUE_OPTIONS_API__: "false",
      __VUE_PROD_DEVTOOLS__: "false",
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
    },
    build: {
      outDir,
      emptyOutDir: true,
      minify: !strict,
      lib: { entry: entryFile, formats: ["iife"], name: "galleryBundle", fileName: () => "gallery.js" },
    },
  })
  writeFileSync(
    join(here, outDir, "index.html"),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>UI SDK gallery</title>
<style>body { margin: 0; background: #0f172a; }</style>
</head>
<body>
<script src="gallery.js"></script>
</body>
</html>
`,
  )
  return files
}

export { build, here, uiFiles }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = await build()
  console.log(`dist/index.html: ${files.length} UIs`)
}
