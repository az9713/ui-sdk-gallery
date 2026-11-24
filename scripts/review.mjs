// Writes review.html: a grid of every built UI, with its screenshot and its measured result.
// Run: npm run review. Open review.html in a browser; a card opens the UI in dist/index.html.
import { execSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const rows = JSON.parse(readFileSync("rows.json", "utf8"))
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
// Accepted = committed. A row that a builder left half done has files on disk but none in git.
const committed = execSync("git ls-files ui", { encoding: "utf8" })
const built = rows.filter((r) => committed.includes(`ui/${r.id}-`) && existsSync(`results/${r.id}.json`) && existsSync(`shots/${r.id}.png`))

const cards = built
  .map((r) => {
    const res = JSON.parse(readFileSync(`results/${r.id}.json`, "utf8"))
    const text = [r.id, r.title, r.shows, r.role, r.kind, `layer ${r.layer}`, `set ${r.set}`, ...r.adds].join(" ").toLowerCase()
    return `<a class="card" href="dist/index.html?ui=${r.id}" data-set="${r.set}" data-text="${esc(text)}">
  <div class="thumb"><img src="shots/${r.id}.png" alt="Screenshot of ${r.id} ${esc(r.title)}"></div>
  <div class="body">
    <div class="head"><b>${r.id}</b> ${esc(r.title)}</div>
    <p>${esc(r.shows)}</p>
    <div class="tags"><span>${esc(r.role)}</span><span>${esc(r.kind)}</span><span>layer ${r.layer}</span></div>
    <div class="nums">${res.tests.passed} tests · ${res.tabStops} tab stops · ${res.lines} lines${res.snapshotBytes == null ? "" : ` · snapshot ${res.snapshotBytes} B`}</div>
  </div>
</a>`
  })
  .join("\n")

const sets = [...new Set(built.map((r) => r.set))]
writeFileSync(
  "review.html",
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Gallery review</title>
<style>
  body { margin: 0; background: #0f172a; color: #e2e8f0; font: 14px/1.45 system-ui, sans-serif; }
  header { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 14px 16px; background: #0f172a; border-bottom: 1px solid #334155; }
  h1 { margin: 0; font-size: 18px; }
  .count { color: #94a3b8; }
  input { flex: 1 1 220px; max-width: 360px; padding: 8px 10px; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; }
  button { padding: 6px 12px; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #cbd5e1; cursor: pointer; }
  button[aria-pressed="true"] { border-color: #fb923c; color: #fb923c; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; padding: 16px; }
  .card { display: flex; flex-direction: column; background: #1e293b; border: 1px solid #334155; border-radius: 8px; overflow: hidden; color: inherit; text-decoration: none; }
  .card:hover, .card:focus-visible { border-color: #2dd4bf; outline: none; }
  /* ponytail: crops the 1280 x 880 shot to its stage, the left 720 px below the 64 px nav bar. Change both numbers if the shell layout changes. */
  .thumb { aspect-ratio: 16 / 10; overflow: hidden; background: #0f172a; border-bottom: 1px solid #334155; }
  .thumb img { display: block; width: 177.8%; margin-top: -8.9%; }
  .body { padding: 10px 12px 12px; display: grid; gap: 6px; }
  .head b { color: #fb923c; margin-right: 4px; }
  p { margin: 0; color: #cbd5e1; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tags span { padding: 1px 8px; border-radius: 99px; border: 1px solid #334155; color: #94a3b8; font-size: 12px; }
  .nums { color: #2dd4bf; font-size: 12px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<header>
  <h1>Gallery review</h1>
  <span class="count" id="count">${built.length} UIs</span>
  <input type="search" id="q" placeholder="Filter: ID, title, axis, component" aria-label="Filter">
  <button aria-pressed="true" data-set="">All</button>
  ${sets.map((s) => `<button aria-pressed="false" data-set="${s}">Set ${s}</button>`).join("\n  ")}
</header>
<main id="grid">
${cards}
</main>
<script>
  const q = document.getElementById("q"), count = document.getElementById("count")
  const cards = [...document.querySelectorAll(".card")]
  let set = ""
  function apply() {
    const words = q.value.toLowerCase().split(/\\s+/).filter(Boolean)
    let shown = 0
    for (const c of cards) {
      const hide = (set && c.dataset.set !== set) || !words.every((w) => c.dataset.text.includes(w))
      c.hidden = hide
      if (!hide) shown++
    }
    count.textContent = shown + " of " + cards.length + " UIs"
  }
  q.addEventListener("input", apply)
  for (const b of document.querySelectorAll("button[data-set]"))
    b.addEventListener("click", () => {
      set = b.dataset.set
      for (const o of document.querySelectorAll("button[data-set]")) o.setAttribute("aria-pressed", String(o === b))
      apply()
    })
</script>
</body>
</html>
`,
)
console.log(`review.html: ${built.length} UIs`)
