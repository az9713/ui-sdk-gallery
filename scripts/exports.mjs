// Lists every public name of the installed @ui-sdk packages: the value exports of each entry.
// Used by `npm run rows` to check that each "adds" item of rows.json is a real export or entry.
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "@ui-sdk")

function namesOf(file, seen = new Set()) {
  if (seen.has(file)) return []
  seen.add(file)
  let text
  try {
    text = readFileSync(file, "utf8")
  } catch {
    return []
  }
  const names = []
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g))
    for (const part of m[1].split(",")) {
      const p = part.trim()
      if (!p || p.startsWith("type ")) continue
      names.push(p.split(/\s+as\s+/).pop().trim())
    }
  for (const m of text.matchAll(/export\s+declare\s+(?:function|const|class)\s+([A-Za-z0-9_$]+)/g)) names.push(m[1])
  for (const m of text.matchAll(/export\s+\*\s+from\s+"([^"]+)"/g))
    if (m[1].startsWith(".")) names.push(...namesOf(join(dirname(file), m[1].replace(/\.js$/, ".d.ts")), seen))
  return names
}

function entries(pkg) {
  const json = JSON.parse(readFileSync(join(root, pkg, "package.json"), "utf8"))
  const out = {}
  for (const [key, value] of Object.entries(json.exports)) {
    if (typeof value !== "object" || !value.types) continue
    const spec = `@ui-sdk/${pkg}${key === "." ? "" : key.slice(1)}`
    out[spec] = [...new Set(namesOf(join(root, pkg, value.types)))]
  }
  return out
}

const core = entries("core")
const web = entries("web")
// The 55 component pages are the list of shipped components.
const components = readdirSync(join(root, "web", "docs", "components")).map((file) => file.replace(/\.md$/, ""))

export { components, core, web }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const find = process.argv[2]
  if (find) {
    for (const [spec, names] of Object.entries({ ...core, ...web })) if (names.includes(find)) console.log(find, "<-", spec)
  } else {
    console.log("components:", components.length)
    console.log("core entries:", Object.keys(core).length, "root names:", core["@ui-sdk/core"].length)
  }
}
