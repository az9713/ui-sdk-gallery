// npm run gate -- B01    runs the 6 stages on 1 UI, on a build that holds only that UI.
// npm run check          runs them on each built UI, on the full bundle, then writes dist/.
// Exit code 0 = each stage passed. A stage that fails prints "FAIL <stage>" and the reasons.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import puppeteer from "puppeteer-core"
import { build, here, uiFiles } from "./build.mjs"

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe"
const IMPECCABLE =
  process.env.IMPECCABLE ??
  "~/.claude/plugins/cache/impeccable/impeccable/4.4.0/skills/impeccable/scripts/impeccable"
const rows = JSON.parse(readFileSync(join(here, "rows.json"), "utf8"))
const PRIMITIVE_SETS = ["B", "C"]

class Fail extends Error {
  constructor(stage, reasons) {
    super(`FAIL ${stage}\n` + [].concat(reasons).map((r) => `  - ${r}`).join("\n"))
  }
}
const run = (command) => spawnSync(command, { cwd: here, shell: true, encoding: "utf8" })

function files(id) {
  const all = readdirSync(join(here, "ui")).filter((f) => f.startsWith(id + "-"))
  const ui = uiFiles([id])
  const tests = all.filter((f) => f.endsWith(".test.ts"))
  if (ui.length !== 1 || tests.length !== 1 || all.length !== 2)
    throw new Fail("files", `ui/ must hold 1 file ${id}-<name>.ts and 1 file ${id}-<name>.test.ts. Found: ${all.join(", ") || "none"}`)
  return { ui: ui[0], test: tests[0] }
}

function stageSource(id, row, file) {
  const source = readFileSync(join(here, "ui", file.ui), "utf8")
  const test = readFileSync(join(here, "ui", file.test), "utf8")
  const reasons = []
  const specs = []
  const names = new Set()
  for (const m of source.matchAll(/import\s+(?:type\s+)?(?:([^"']*?)\s+from\s+)?["']([^"']+)["']/g)) {
    specs.push(m[2])
    for (const name of (m[1] ?? "").replace(/[{}]/g, "").split(","))
      if (name.trim()) names.add(name.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, ""))
  }
  if (!source.includes(`id: "${id}"`)) reasons.push(`the definition must have id: "${id}"`)
  for (const add of row.adds)
    if (!names.has(add) && !specs.some((s) => s.startsWith("@ui-sdk/") && s.endsWith("/" + add)))
      reasons.push(`rows.json says that ${id} adds "${add}", but ${file.ui} does not import it`)
  if (row.set === "X" && specs.some((s) => s.startsWith("@ui-sdk/"))) reasons.push("a comparison build must not import @ui-sdk")
  if (specs.some((s) => s.includes("/internal"))) reasons.push("@ui-sdk/core/internal is not public")
  if (/createAgent\s*\(/.test(source)) reasons.push("the shell makes the bridge. Use context.agent.")
  // Module level may only define elements: each UI of the bundle is loaded, 1 is mounted.
  for (const line of source.split("\n"))
    if (/^[^\s/*}`<].*\b(localStorage|sessionStorage|document\.|window\.|addEventListener)\b/.test(line))
      reasons.push(`module level touches the page: "${line.trim().slice(0, 70)}". Move it into mount.`)
  if (/\b(test|it|describe)\.(skip|only|todo)\b/.test(test)) reasons.push("the test file has a skipped or focused test")
  if (reasons.length) throw new Fail("source", reasons)
  return source.split("\n").length
}

function stageTypes(id) {
  const out = run("npx tsc --noEmit -p .")
  const lines = (out.stdout + out.stderr).split("\n").filter((l) => /error TS/.test(l))
  if (out.status !== 0 && !lines.length) throw new Fail("types", `tsc did not run: ${(out.stdout + out.stderr).slice(0, 300)}`)
  // With an id, errors in the files of other UIs are not this UI's problem.
  const mine = id ? lines.filter((l) => l.replaceAll("\\", "/").includes(`ui/${id}-`)) : lines
  if (mine.length) throw new Fail("types", mine.slice(0, 20))
}

function stageTests(id) {
  const report = join(here, "dist", `tests-${id ?? "all"}.json`)
  mkdirSync(join(here, "dist"), { recursive: true })
  const out = run(`npx vitest run ${id ? `ui/${id}-` : ""} --reporter=json --outputFile="${report}"`)
  if (!existsSync(report)) throw new Fail("tests", `vitest did not run: ${(out.stdout + out.stderr).slice(-400)}`)
  const json = JSON.parse(readFileSync(report, "utf8"))
  const failed = json.testResults.flatMap((file) => [
    ...(file.status === "failed" && !file.assertionResults.length ? [`${file.name}: ${file.message}`] : []),
    ...file.assertionResults.filter((t) => t.status !== "passed").map((t) => `${t.fullName}: ${(t.failureMessages ?? []).join(" ").slice(0, 300)}`),
  ])
  if (failed.length) throw new Fail("tests", failed.slice(0, 20))
  return (uiId) =>
    json.testResults
      .filter((file) => file.name.replaceAll("\\", "/").includes(`/ui/${uiId}-`))
      .flatMap((file) => file.assertionResults.map((t) => t.title))
}

function requireTests(row, names) {
  const need = row.set === "X" ? ["keyboard:"] : ["keyboard:", "agent:"]
  if (PRIMITIVE_SETS.includes(row.set)) need.push("server:", "direction:")
  const missing = need.filter((prefix) => !names.some((n) => n.startsWith(prefix)))
  if (missing.length) throw new Fail("tests", `no test name starts with ${missing.map((m) => `"${m}"`).join(", ")}. Tests found: ${names.join(" | ") || "none"}`)
}

async function stageBrowser(browser, row, url) {
  const id = row.id
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  const reasons = []
  page.on("console", (m) => ["error", "warn", "warning"].includes(m.type()) && reasons.push(`console ${m.type()}: ${m.text().slice(0, 300)}`))
  page.on("pageerror", (e) => reasons.push(`page error: ${String(e).slice(0, 300)}`))
  page.on("requestfailed", (r) => reasons.push(`request failed: ${r.url()}`))
  try {
    await page.goto(`${url}?ui=${id}`)
    await page.waitForFunction(() => window.gallery, { timeout: 10000 }).catch(() => reasons.push("the UI did not mount in 10 s"))
    if (reasons.length) throw new Fail("browser", reasons)
    await new Promise((r) => setTimeout(r, 300))
    mkdirSync(join(here, "shots"), { recursive: true })
    await page.screenshot({ path: join(here, "shots", `${id}.png`), fullPage: true })

    // Tag prefix: each element that this UI defines starts with its id, so 100 UIs can share 1 page.
    const tags = await page.evaluate((prefix) => {
      const own = [...document.querySelectorAll("[data-stage] *")].map((el) => el.localName).filter((n) => n.includes("-") && !n.startsWith("ui-"))
      return [...new Set(own)].filter((n) => !n.startsWith(prefix))
    }, id.toLowerCase() + "-")
    if (tags.length) reasons.push(`custom element tags must start with "${id.toLowerCase()}-": ${tags.join(", ")}`)

    // Bridge: each component has a name, and no part of the shell is in the snapshot.
    let snapshotBytes = null
    if (row.set !== "X") {
      const snap = await page.evaluate(() => window.gallery.agent.snapshot())
      const live = snap.filter((e) => !e.offPage && e.component !== "more")
      if (!live.length) reasons.push("the bridge snapshot is empty: no control is a ui-sdk part")
      for (const e of live) if (!e.label) reasons.push(`snapshot entry ${e.component} ${e.ref} has no label`)
      const text = JSON.stringify(snap)
      if (/Run the agent task|Allow the agent/.test(text)) reasons.push("a control of the shell is in the snapshot")
      snapshotBytes = text.length
    }

    // Accessibility tree of the stage, as text: 1 line for each node. My measurement.
    const stage = await page.$("[data-stage]")
    const tree = await page.accessibility.snapshot({ root: stage })
    const lines = []
    const walk = (node, depth) => {
      const flags = ["value", "checked", "pressed", "expanded", "selected", "disabled", "level"].filter((k) => node[k] !== undefined).map((k) => `${k}=${node[k]}`)
      lines.push(`${" ".repeat(depth)}${node.role} "${node.name ?? ""}"${flags.length ? " " + flags.join(" ") : ""}`)
      for (const child of node.children ?? []) walk(child, depth + 1)
    }
    if (tree) walk(tree, 0)
    const treeBytes = Buffer.byteLength(lines.join("\n"))

    // Tab walk: focus goes into the stage, stops on a control, and comes out again.
    const seen = new Set()
    let tabStops = 0
    let left = false
    for (let i = 0; i < 400; i++) {
      await page.keyboard.press("Tab")
      const at = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        const path = []
        for (let n = el; n && n !== document.body; n = n.parentElement) path.push(`${n.localName}:${[...n.parentElement.children].indexOf(n)}`)
        return { key: path.join("/"), stage: !!el.closest("[data-stage]"), card: !!el.closest(".g-card") }
      })
      if (!at || seen.has(at.key)) break
      seen.add(at.key)
      if (at.stage) tabStops++
      if (at.card && tabStops) left = true
    }
    if (!tabStops) reasons.push("Tab does not reach a control of the UI")
    else if (!left) reasons.push("Tab does not leave the UI: focus is caught in it")

    // axe: WCAG A and AA rules on the stage. A contrast result that axe cannot decide is not a pass.
    await page.addScriptTag({ path: join(here, "node_modules", "axe-core", "axe.min.js") })
    const axe = await page.evaluate(() => window.axe.run("[data-stage]", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }))
    const say = (kind) => (r) => r.nodes.forEach((n) => reasons.push(`axe ${kind} ${r.id}: ${n.target.join(" ")} — ${(n.failureSummary ?? n.any?.[0]?.message ?? r.help).replace(/\s+/g, " ").slice(0, 220)}`))
    axe.violations.forEach(say("violation"))
    axe.incomplete.filter((r) => r.id === "color-contrast").forEach(say("not decided"))

    // The scripted agent task, with a person who answers the prompt of the page.
    if (row.set !== "X") {
      const info = await page.evaluate(() => ({ before: window.gallery.done(), person: window.gallery.person }))
      if (info.before === undefined) reasons.push("the definition has no task")
      else if (info.before !== false) reasons.push("task.done is true before the task runs, so it proves nothing")
      else {
        let outcome
        const pending = page.evaluate(() => window.gallery.runTask()).then((o) => (outcome = o))
        for (let i = 0; i < 100 && !outcome; i++) {
          await Promise.race([pending, new Promise((r) => setTimeout(r, 100))])
          if (outcome) break
          const answered = await page.evaluate((person) => {
            const want = person === "allow" ? "Allow" : "Deny"
            const button = [...document.querySelectorAll(".g-overlays button")].find((b) => b.textContent.trim() === want && b.checkVisibility())
            if (!button) return null
            const leaked = /Allow the agent/.test(JSON.stringify(window.gallery.agent.snapshot()))
            button.click()
            return { leaked }
          }, info.person)
          if (answered?.leaked) reasons.push("the Allow / Deny prompt is in the snapshot: an agent can answer it")
        }
        if (!outcome) reasons.push("the task did not end in 10 s")
        else {
          if (outcome.ok !== (info.person === "allow")) reasons.push(`the task ended with ok: ${outcome.ok}. ${outcome.error?.message ?? ""}`)
          if (!(await page.evaluate(() => window.gallery.done()))) reasons.push("task.done is false after the task")
        }
      }
    }
    if (reasons.length) throw new Fail("browser", reasons)
    const breaks = await page.evaluate(() => window.gallery.breaks)
    return { snapshotBytes, treeBytes, tabStops, breaks }
  } finally {
    await page.close()
  }
}

// Deliberate breaks: each one is applied to the UI file, and the test that it names must fail.
function stageBreaks(id, row, file, breaks) {
  if (!PRIMITIVE_SETS.includes(row.set)) return 0
  if (breaks.length < 3) throw new Fail("breaks", `a primitive needs a minimum of 3 deliberate breaks in its definition. Found: ${breaks.length}`)
  const path = join(here, "ui", file.ui)
  const original = readFileSync(path, "utf8")
  // The find text is also in the breaks list, so only the code before the list is searched and changed.
  const cut = original.indexOf("breaks: [")
  const code = original.slice(0, cut)
  const report = join(here, "dist", `breaks-${id}.json`)
  const reasons = []
  try {
    for (const b of breaks) {
      if (code.split(b.find).length !== 2) {
        reasons.push(`"${b.find}" must occur exactly 1 time in ${file.ui}, before the breaks list`)
        continue
      }
      writeFileSync(path, code.replace(b.find, b.replace) + original.slice(cut))
      run(`npx vitest run ui/${id}- --reporter=json --outputFile="${report}"`)
      const failed = JSON.parse(readFileSync(report, "utf8")).testResults.flatMap((f) => f.assertionResults.filter((t) => t.status === "failed").map((t) => t.title))
      if (!failed.includes(b.caught)) reasons.push(`break "${b.broke}": the test "${b.caught}" did not fail. Tests that failed: ${failed.join(" | ") || "none"}`)
    }
  } finally {
    writeFileSync(path, original)
  }
  if (reasons.length) throw new Fail("breaks", reasons)
  return breaks.length
}

function stageDesign(id, url) {
  if (!existsSync(IMPECCABLE)) throw new Fail("design", `the detector is not at ${IMPECCABLE}. Set the IMPECCABLE variable.`)
  const out = run(`"${IMPECCABLE}" detect --no-advisory "${url}?ui=${id}"`)
  if (out.status !== 0) throw new Fail("design", (out.stderr + out.stdout).trim().split("\n").slice(0, 30))
}

async function gate(ids, { full }) {
  const one = full ? null : ids[0]
  for (const id of ids) if (!rows.some((r) => r.id === id)) throw new Fail("files", `${id} is not a row of rows.json`)
  const perUI = new Map(ids.map((id) => [id, { file: files(id) }]))
  for (const [id, u] of perUI) u.lines = stageSource(id, rows.find((r) => r.id === id), u.file)
  console.log("pass source")
  stageTypes(one)
  console.log("pass types")
  const namesOf = stageTests(one)
  for (const id of ids) requireTests(rows.find((r) => r.id === id), namesOf(id))
  console.log("pass tests")
  const outDir = full ? "dist/gate/all" : `dist/gate/${one}`
  await build({ ids: full ? null : ids, outDir, strict: true })
  console.log("pass build")
  const url = pathToFileURL(join(here, outDir, "index.html")).href
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  try {
    for (const id of ids) {
      const row = rows.find((r) => r.id === id)
      const { breaks, ...measured } = await stageBrowser(browser, row, url)
      stageDesign(id, url)
      // The break stage changes the UI file for some seconds, so only a 1-UI run does it.
      const caught = full ? 0 : stageBreaks(id, row, perUI.get(id).file, breaks)
      if (caught) console.log(`pass breaks  ${caught} caught`)
      const names = namesOf(id)
      writeFileSync(
        join(here, "results", `${id}.json`),
        JSON.stringify({ at: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC", tests: { passed: names.length, names }, ...measured, lines: perUI.get(id).lines }, null, 1) + "\n",
      )
      console.log(`pass browser, design  ${id}  snapshot ${measured.snapshotBytes} bytes, tree ${measured.treeBytes} bytes, ${measured.tabStops} tab stops`)
    }
  } finally {
    await browser.close()
  }
  if (full) {
    await build()
    console.log(`dist/index.html: ${ids.length} UIs`)
  }
  console.log(`GATE PASSED: ${ids.join(" ")}`)
}

const arg = process.argv[2]
try {
  if (arg === "--all") await gate([...new Set(uiFiles(null).map((f) => f.slice(0, 3)))], { full: true })
  else if (/^[A-Z]\d\d$/.test(arg ?? "")) await gate([arg], { full: false })
  else throw new Error("Use: npm run gate -- <ID>   or   npm run check")
} catch (error) {
  console.error(error instanceof Fail ? error.message : error)
  process.exit(1)
}
