// npm run pages    Writes the GitHub Pages site in docs/ (gallery, review grid, thumbnails) and the README grid.
// docs/explainer.html, docs/plan.html and docs/.nojekyll are hand-kept files. This script does not touch them.
import { execSync } from "node:child_process"
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { build } from "./build.mjs"

const SITE = "https://az9713.github.io/ui-sdk-gallery/"
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe"
const rows = JSON.parse(readFileSync("rows.json", "utf8"))
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

// The gallery. Not built straight into docs/, because the build empties its out folder.
await build()
mkdirSync("docs/thumbs", { recursive: true })
for (const f of ["index.html", "gallery.js"]) copyFileSync(`dist/${f}`, `docs/${f}`)

// Thumbnails: the stage of each screenshot (above the card), cut to the content, in a 16:10 box.
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage()
for (const { id } of rows) {
  const url = `data:image/png;base64,${readFileSync(`shots/${id}.png`).toString("base64")}`
  const jpg = await page.evaluate(async (url) => {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const g = c.getContext("2d", { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    const { data } = g.getImageData(0, 0, img.width, img.height)
    const px = (x, y) => data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)
    const differs = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 12
    const top = 66
    // The card under the stage has the color #1e293b. With no such row, take the first 800 px.
    let end = Math.min(img.height, top + 800)
    for (let y = 100; y < img.height; y++)
      if (!differs(px(3, y), [30, 41, 59])) {
        end = y - 1
        break
      }
    const bg = px(3, top + 4)
    let x0 = img.width, y0 = end, x1 = 0, y1 = top
    for (let y = top; y < end; y++)
      for (let x = 0; x < img.width; x++)
        if (differs(px(x, y), bg)) {
          x0 = Math.min(x0, x)
          y0 = Math.min(y0, y)
          x1 = Math.max(x1, x)
          y1 = Math.max(y1, y)
        }
    x0 = Math.max(0, x0 - 16)
    y0 = Math.max(top, y0 - 16)
    const w = Math.min(img.width, x1 + 16) - x0
    // A tall stage keeps its top part, so that the text stays large enough to see.
    const h = Math.min(Math.min(end, y1 + 16) - y0, Math.round(w * 0.8))
    const out = document.createElement("canvas")
    out.width = 420
    out.height = 262
    const o = out.getContext("2d")
    o.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`
    o.fillRect(0, 0, 420, 262)
    const s = Math.min(420 / w, 262 / h, 1)
    o.imageSmoothingQuality = "high"
    o.drawImage(img, x0, y0, w, h, (420 - w * s) / 2, (262 - h * s) / 2, w * s, h * s)
    return out.toDataURL("image/jpeg", 0.82).split(",")[1]
  }, url)
  writeFileSync(`docs/thumbs/${id}.jpg`, Buffer.from(jpg, "base64"))
}
await browser.close()

// The review grid, with its links and pictures changed to the paths of docs/.
execSync("node scripts/review.mjs", { stdio: "inherit" })
writeFileSync(
  "docs/review.html",
  readFileSync("review.html", "utf8")
    .replaceAll("dist/index.html?ui=", "./?ui=")
    .replace(/shots\/(\w+)\.png/g, "thumbs/$1.jpg")
    .replace("width: 177.8%; margin-top: -8.9%;", "width: 100%;"),
)

// The README grid, between the 2 markers.
const SETS = {
  A: "Shipped components only",
  B: "Primitives made from shipped behaviors",
  C: "2 behaviors that the package does not ship",
  D: "1 primitive through 4 framework adapters",
  E: "UI A01 with 5 different looks",
  F: "Agent use",
  X: "Comparison builds without UI SDK",
}
const cell = (r) => {
  const link = `${SITE}?ui=${r.id}`
  return `<td width="33%" valign="top"><a href="${link}"><img src="docs/thumbs/${r.id}.jpg" alt="${r.id} ${esc(r.title)}" width="280"></a><br><b>${r.id}</b> <a href="${link}">${esc(r.title)}</a><br><sub>${esc(r.domain ?? r.shows)}</sub></td>`
}
const grid = Object.entries(SETS)
  .map(([set, name]) => {
    const list = rows.filter((r) => r.set === set)
    const trs = []
    for (let i = 0; i < list.length; i += 3) trs.push(`<tr>\n${list.slice(i, i + 3).map(cell).join("\n")}\n</tr>`)
    return `### Set ${set}: ${name} (${list.length})\n\n<table>\n${trs.join("\n")}\n</table>`
  })
  .join("\n\n")
writeFileSync(
  "README.md",
  readFileSync("README.md", "utf8").replace(
    /<!-- grid:start -->[\s\S]*<!-- grid:end -->/,
    () => `<!-- grid:start -->\n\n${grid}\n\n<!-- grid:end -->`,
  ),
)
console.log(`docs/: ${rows.length} thumbnails, review.html, README grid`)
