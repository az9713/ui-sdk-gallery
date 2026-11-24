// npm run rows            checks rows.json against the installed packages and prints the coverage.
// npm run rows -- B04     prints the brief of 1 row: what to build, and where its docs are.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { components, core, web } from "./exports.mjs"

const here = join(dirname(fileURLToPath(import.meta.url)), "..")
const rows = JSON.parse(readFileSync(join(here, "rows.json"), "utf8"))
const docs = "node_modules/@ui-sdk/web/docs"
const coreMd = readFileSync(join(here, docs, "core.md"), "utf8")
const all = { ...core, ...web }
const modules = Object.keys(core).map((spec) => spec.split("/")[2]).filter(Boolean)

const slug = (heading) => heading.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/\s+/g, "-")
const headings = new Map(
  [...coreMd.matchAll(/^(#{1,4}) (.+)$/gm)].map((m) => [slug(m[2]), `${"#".repeat(m[1].length)} ${m[2]}`]),
)

// Where an "adds" item is documented: a component page, or a heading of core.md from the "All Behaviors" tables.
function pointer(add) {
  if (components.includes(add)) return `${docs}/components/${add}.md`
  const linked = coreMd.match(new RegExp("\\[`" + add + "`\\]\\(\\./core\\.md#([a-z0-9-]+)\\)"))
  if (linked) return `${docs}/core.md, heading "${headings.get(linked[1]) ?? "MISSING #" + linked[1]}"`
  const owner = Object.keys(all).find((spec) => all[spec].includes(add))
  const needle = owner ? add : modules.includes(add) ? `@ui-sdk/core/${add}` : null
  if (!needle) return null
  const files = readdirSync(join(here, docs), { recursive: true })
    .filter((f) => f.endsWith(".md") && readFileSync(join(here, docs, f), "utf8").includes(needle))
    .map((f) => f.replaceAll("\\", "/"))
  return `${owner ? "export of " + owner : "entry " + needle}. Search for \`${needle}\` in ${docs}/: ${files.slice(0, 5).join(", ") || "NO DOCS PAGE NAMES IT: read its .d.ts"}`
}

const built = (id) => readdirSync(join(here, "ui")).some((f) => f.startsWith(id + "-") && !f.endsWith(".test.ts"))

const id = process.argv[2]
if (id) {
  const row = rows.find((r) => r.id === id)
  if (!row) throw new Error(`${id} is not a row of rows.json`)
  console.log(`${row.id}  ${row.title}`)
  console.log(`Position: axis 1 ${row.role}, axis 2 ${row.kind}, axis 3 layer ${row.layer}. Set ${row.set}.`)
  console.log(`Shows: ${row.shows}`)
  console.log(`Model: ${row.model}  Effort: ${row.effort}  Built: ${built(row.id) ? "yes" : "no"}`)
  if (row.note) console.log(`Note: ${row.note}`)
  if (row.domain) console.log(`Domain: ${row.domain}\nVisual: ${row.visual}\nLibrary: ${row.lib} (see BUILDER.md, "Visuals and libraries")`)
  console.log(row.adds.length ? "Adds (each must be imported by the UI file):" : "Adds: none")
  for (const add of row.adds) console.log(`  ${add}  ->  ${pointer(add)}`)
  process.exit(0)
}

let bad = 0
const ids = new Set()
for (const row of rows) {
  if (ids.has(row.id)) (bad++, console.log(`DUPLICATE id ${row.id}`))
  ids.add(row.id)
  for (const add of row.adds) {
    const where = pointer(add)
    if (!where || where.includes("MISSING")) (bad++, console.log(`${row.id}: "${add}" is not an export, an entry or a documented heading (${where})`))
  }
}
const used = new Set(rows.flatMap((r) => r.adds))
const behaviors = [
  ...core["@ui-sdk/core"].filter((n) => /^(create|bind)[A-Z]/.test(n)),
  "createVelocityTracker",
  "createAgent",
  "createHistory",
]
// The shell makes the bridge, so createAgent is used by each UI.
const missing = (list) => list.filter((n) => !used.has(n) && n !== "createAgent")
const count = (set) => rows.filter((r) => r.set === set).length
console.log(`rows: ${rows.length} (A ${count("A")}, B ${count("B")}, C ${count("C")}, D ${count("D")}, E ${count("E")}, F ${count("F")}, X ${count("X")})`)
console.log(`built: ${rows.filter((r) => built(r.id)).map((r) => r.id).join(" ") || "none"}`)
console.log(`components: ${components.length}, not in a row: ${missing(components).join(" ") || "none"}`)
console.log(`behaviors (create*, bind*): ${behaviors.length}, not in a row: ${missing(behaviors).join(" ") || "none"}`)
for (const f of existsSync(join(here, "ui")) ? readdirSync(join(here, "ui")) : [])
  if (!ids.has(f.slice(0, 3))) (bad++, console.log(`ui/${f} has no row`))
console.log(bad ? `${bad} problems` : "rows.json: no problems")
process.exit(bad ? 1 : 0)
