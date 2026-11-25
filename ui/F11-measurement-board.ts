import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { max, median, scaleLinear, scaleLog } from "d3"
import rowData from "../rows.json"
import type { Context, UI } from "../src/ui"

const OWN = "F11"
const SETS = [...new Set(rowData.map((r) => r.set))]
const W = 500
const H = 320
const LEFT = 60
const TRACK = 240

type Point = { id: string; set: string; title: string; snapshot: number | null; tree: number }

const fmt = (n: number) => (Number.isInteger(n) ? n : Number(n.toFixed(1))).toLocaleString("en-US")
const many = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
const measured = (p: Point): p is Point & { snapshot: number } => typeof p.snapshot === "number" && p.snapshot > 0 && p.tree > 0
const setName = (set: string) => (set === "all" ? "All sets" : `Set ${set}`)

// The own row is left out, so the gate's new F11 result does not change the screenshot between runs.
function points(results: Context["results"]): Point[] {
  return Object.entries(results ?? {})
    .filter(([id]) => id !== OWN)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, r]) => {
      const row = rowData.find((x) => x.id === id)
      return { id, set: row?.set ?? id.slice(0, 1), title: row?.title ?? id, snapshot: r.snapshotBytes, tree: r.treeBytes }
    })
}

function summary(all: Point[], set: string) {
  if (!all.length) return "No result is recorded."
  const group = set === "all" ? all : all.filter((p) => p.set === set)
  const name = setName(set)
  if (!group.length) return `${name}: no result is recorded.`
  const both = group.filter(measured)
  const none = group.filter((p) => !measured(p))
  if (!both.length) return `${name}: ${many(group.length, "UI")} with no snapshot (no UI SDK). Median tree ${fmt(median(group, (p) => p.tree)!)} bytes.`
  const smaller = both.filter((p) => p.snapshot < p.tree).length
  const text =
    `${name}: ${many(both.length, "UI")} with a snapshot. Median snapshot ${fmt(median(both, (p) => p.snapshot)!)} bytes, ` +
    `median tree ${fmt(median(both, (p) => p.tree)!)} bytes. The snapshot is smaller in ${smaller} of ${both.length}.`
  return none.length ? `${text} No snapshot: ${none.map((p) => p.id).join(", ")} (no UI SDK).` : text
}

function ticks(lo: number, hi: number) {
  const out: number[] = []
  for (let k = Math.floor(Math.log10(lo)); k <= Math.ceil(Math.log10(hi)); k++)
    for (const m of [1, 3]) if (m * 10 ** k >= lo && m * 10 ** k <= hi) out.push(m * 10 ** k)
  return out
}

function scatter(all: Point[]) {
  const both = all.filter(measured)
  if (!both.length) return `<p class="f11-note">No UI has a snapshot to draw.</p>`
  const values = both.flatMap((p) => [p.snapshot, p.tree])
  const lo = Math.min(...values) * 0.8
  const hi = Math.max(...values) * 1.25
  const x = scaleLog().domain([lo, hi]).range([0, W])
  const y = scaleLog().domain([lo, hi]).range([H, 0])
  const marks = ticks(lo, hi)
  const top = both.reduce((a, b) => (b.snapshot > a.snapshot ? b : a))
  const label =
    `Scatter of ${many(both.length, "UI")} on log scales: snapshot from ${fmt(Math.min(...both.map((p) => p.snapshot)))} ` +
    `to ${fmt(top.snapshot)} bytes, tree from ${fmt(Math.min(...both.map((p) => p.tree)))} to ${fmt(Math.max(...both.map((p) => p.tree)))} bytes.`
  const grid = marks
    .map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="0" y2="${H}"/><line x1="0" x2="${W}" y1="${y(t)}" y2="${y(t)}"/>`)
    .join("")
  const dots = both
    .map((p) => `<circle data-id="${p.id}" data-set="${p.set}" cx="${x(p.snapshot).toFixed(1)}" cy="${y(p.tree).toFixed(1)}" r="4.5"/>`)
    .join("")
  return `
    <div class="f11-plot">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}" focusable="false">
        <g class="f11-grid">${grid}</g>
        <line class="f11-equal" x1="0" y1="${H}" x2="${W}" y2="0"/>
        <g data-dots>${dots}</g>
      </svg>
      ${marks.map((t) => `<span class="f11-tick f11-x" style="left: ${LEFT + x(t)}px">${fmt(t)}</span>`).join("")}
      ${marks.map((t) => `<span class="f11-tick f11-y" style="top: ${y(t)}px">${fmt(t)}</span>`).join("")}
      <span class="f11-point" style="left: ${LEFT + x(top.snapshot) - 9}px; top: ${y(top.tree)}px">${top.id}</span>
    </div>
    <p class="f11-axis">Across: snapshot bytes. Up: tree bytes. Both scales are logarithmic.</p>`
}

function bars(all: Point[]) {
  const sets = SETS.map((set) => {
    const group = all.filter((p) => p.set === set)
    const both = group.filter(measured)
    return { set, n: group.length, snapshot: both.length ? median(both, (p) => p.snapshot)! : null, tree: median(both.length ? both : group, (p) => p.tree)! }
  }).filter((s) => s.n)
  if (!sets.length) return ""
  const x = scaleLinear()
    .domain([0, max(sets, (s) => Math.max(s.snapshot ?? 0, s.tree)) ?? 1])
    .nice()
    .range([0, TRACK])
  const bar = (kind: string, value: number | null) =>
    `<svg class="f11-track" viewBox="0 0 ${TRACK} 10" aria-hidden="true" focusable="false">${
      value === null ? "" : `<rect data-kind="${kind}" width="${Math.max(0, x(value)).toFixed(1)}" height="10" rx="2"/>`
    }</svg><span class="f11-value">${value === null ? "none" : fmt(value)}</span>`
  return sets
    .map(
      (s) => `<div class="f11-set" data-set="${s.set}">
        <span class="f11-set-name">Set ${s.set} <small>${many(s.n, "UI")}</small></span>
        <span class="f11-kind">Snapshot</span>${bar("snapshot", s.snapshot)}
        <span class="f11-kind">Tree</span>${bar("tree", s.tree)}
      </div>`,
    )
    .join("")
}

function note(all: Point[]) {
  const both = all.filter(measured)
  if (!both.length) return ""
  const top = both.reduce((a, b) => (b.snapshot > a.snapshot ? b : a))
  const mid = median(both, (p) => p.snapshot)!
  return `The largest snapshot is ${top.id}, ${top.title}: ${fmt(top.snapshot)} bytes, ${fmt(Number((top.snapshot / mid).toFixed(1)))} times the median of ${fmt(mid)}. The log scales keep the other points apart.`
}

const html = (all: Point[]) => `
<div class="f11-board">
  <header class="f11-head">
    <h2>Snapshot bytes against accessibility-tree bytes</h2>
    <p>My measurement: 1 gate run of each built UI, in its first state after mount. The gallery's own row, ${OWN}, is left out.</p>
    <dl class="f11-defs">
      <div><dt>Snapshot</dt><dd>bytes of the JSON of <code>agent.snapshot()</code></dd></div>
      <div><dt>Tree</dt><dd>bytes of the accessibility tree of the stage as text, 1 line for each node, from the gate</dd></div>
    </dl>
  </header>
  <div class="f11-controls">
    <ui-field>
      <ui-field-label>Highlight set</ui-field-label>
      <ui-select name="set" default-value="all">
        <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
        <ui-select-content>
          <ui-select-item value="all">All sets</ui-select-item>
          ${SETS.map((s) => `<ui-select-item value="${s}">Set ${s}</ui-select-item>`).join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
    <p role="status" data-status></p>
  </div>
  <div class="f11-charts">
    <figure class="f11-figure">
      <h2>Each UI</h2>
      ${scatter(all)}
      <ul class="f11-legend">
        <li><span class="f11-dot" data-on></span>Highlighted set</li>
        <li><span class="f11-dot"></span>Other sets</li>
        <li><span class="f11-dash"></span>Snapshot = tree</li>
      </ul>
      <p class="f11-note" data-note>${note(all)}</p>
    </figure>
    <figure class="f11-figure">
      <h2>Median bytes of each set</h2>
      <ul class="f11-legend">
        <li><span class="f11-swatch" data-kind="snapshot"></span>Snapshot</li>
        <li><span class="f11-swatch" data-kind="tree"></span>Tree</li>
      </ul>
      <div class="f11-bars">${bars(all)}</div>
      <ul class="f11-caveats">
        <li>A point above the dashed line has a larger tree than snapshot.</li>
        <li>The snapshot of F03 lists 100 of its 150 controls, then 1 "more" entry.</li>
        <li>D01 to D04 and E01 to E05 repeat almost the same UI, so their points are not independent.</li>
      </ul>
    </figure>
  </div>
</div>`

const css = `
[data-stage] { max-width: 1040px; }
[data-stage] h2, [data-stage] p, [data-stage] figure, [data-stage] ul, [data-stage] dl, [data-stage] dd { margin: 0; padding: 0; }
[data-stage] .f11-board { display: grid; gap: 28px; }
[data-stage] .f11-head { display: grid; gap: 10px; }
[data-stage] h2 { font-size: 1.125rem; font-weight: 600; }
[data-stage] .f11-head p, [data-stage] [data-status], [data-stage] .f11-note, [data-stage] .f11-axis { max-width: 60ch; }
[data-stage] .f11-defs { display: grid; gap: 4px; }
[data-stage] .f11-defs div { display: grid; grid-template-columns: 6em minmax(0, 60ch); gap: 12px; }
[data-stage] .f11-defs dt { font-weight: 600; }
[data-stage] .f11-defs dd, [data-stage] .f11-note, [data-stage] .f11-axis, [data-stage] .f11-caveats, [data-stage] small, [data-stage] .f11-kind { color: var(--ui-muted-foreground); }
[data-stage] code { font-family: var(--ui-font-mono); color: var(--ui-foreground); }
[data-stage] .f11-controls { display: grid; grid-template-columns: 200px minmax(0, 60ch); gap: 24px; align-items: end; }
[data-stage] .f11-controls ui-select-trigger button { width: 100%; }
[data-stage] [data-status] { padding-bottom: 6px; }
[data-stage] .f11-charts { display: grid; grid-template-columns: ${LEFT + W}px minmax(0, 1fr); gap: 48px; align-items: start; }
[data-stage] .f11-figure { display: grid; gap: 14px; align-content: start; }
[data-stage] .f11-plot { position: relative; width: ${LEFT + W}px; height: ${H + 28}px; }
[data-stage] .f11-plot svg { position: absolute; left: ${LEFT}px; top: 0; width: ${W}px; height: ${H}px; border: 1px solid var(--ui-border); box-sizing: border-box; }
[data-stage] .f11-grid line { stroke: var(--ui-border); stroke-width: 1; }
[data-stage] .f11-equal { stroke: var(--ui-muted-foreground); stroke-width: 1.5; stroke-dasharray: 5 5; }
[data-stage] [data-dots] circle { fill: var(--ui-primary); fill-opacity: 0.85; stroke: var(--ui-background); stroke-width: 1; }
[data-stage] [data-dots] circle[data-off] { fill: var(--ui-input); fill-opacity: 0.7; }
[data-stage] .f11-tick, [data-stage] .f11-point { position: absolute; padding: 2px 3px; font-size: 0.75rem; line-height: 1.25; font-variant-numeric: tabular-nums; color: var(--ui-muted-foreground); background: var(--ui-background); white-space: nowrap; }
[data-stage] .f11-x { top: ${H + 4}px; transform: translateX(-50%); }
[data-stage] .f11-y { left: 0; width: ${LEFT - 6}px; box-sizing: border-box; text-align: end; transform: translateY(-50%); }
[data-stage] .f11-point { transform: translate(-100%, -50%); color: var(--ui-foreground); }
[data-stage] .f11-legend { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 20px; font-size: 0.8125rem; }
[data-stage] .f11-legend li { display: flex; align-items: center; gap: 8px; }
[data-stage] .f11-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--ui-input); }
[data-stage] .f11-dot[data-on] { background: var(--ui-primary); }
[data-stage] .f11-dash { width: 22px; height: 0; border-top: 2px dashed var(--ui-muted-foreground); }
[data-stage] .f11-swatch { width: 14px; height: 10px; border-radius: 2px; }
[data-stage] [data-kind="snapshot"] { fill: var(--ui-primary); background: var(--ui-primary); }
[data-stage] [data-kind="tree"] { fill: var(--ui-ring); background: var(--ui-ring); }
[data-stage] .f11-bars { display: grid; gap: 4px; }
[data-stage] .f11-set { display: grid; grid-template-columns: 96px 64px ${TRACK}px 56px; gap: 4px 10px; align-items: center; padding: 6px 8px; border: 1px solid transparent; border-radius: var(--ui-radius); font-size: 0.8125rem; font-variant-numeric: tabular-nums; }
[data-stage] .f11-set[data-on] { background: var(--ui-muted); border-color: var(--ui-border); }
[data-stage] .f11-set-name { grid-row: span 2; font-weight: 600; }
[data-stage] .f11-set-name small { display: block; font-weight: 400; font-size: 0.75rem; }
[data-stage] .f11-track { display: block; width: ${TRACK}px; height: 10px; }
[data-stage] .f11-value { text-align: end; }
[data-stage] .f11-caveats { display: grid; gap: 6px; padding-inline-start: 18px; font-size: 0.8125rem; max-width: 60ch; }
@media (max-width: 1100px) { [data-stage] .f11-charts { grid-template-columns: minmax(0, 1fr); } }
`

function mount(root: HTMLElement, context: Context) {
  const all = points(context.results)
  root.innerHTML = html(all)
  const status = root.querySelector("[data-status]")!
  const show = (set: string) => {
    root.querySelectorAll("[data-dots] circle").forEach((c) => c.toggleAttribute("data-off", set !== "all" && c.getAttribute("data-set") !== set))
    const dots = root.querySelector("[data-dots]")
    root.querySelectorAll(`[data-dots] circle:not([data-off])`).forEach((c) => dots?.append(c))
    root.querySelectorAll<HTMLElement>(".f11-set").forEach((row) => row.toggleAttribute("data-on", row.dataset.set === set))
    status.textContent = summary(all, set)
  }
  root.querySelector("ui-select")!.addEventListener("valuechange", (e) => show(String((e as CustomEvent).detail.value)))
  show("all")
}

const ui: UI = {
  id: "F11",
  request: "Build a board that plots the snapshot bytes against the accessibility-tree bytes of each built UI, with a scatter, medians by set and a set filter.",
  css,
  mount,
  task: {
    steps: [{ ref: "Highlight set", action: "setValue", args: ["B"] }],
    done: (root) => root.querySelector("[data-status]")!.textContent!.startsWith("Set B:"),
  },
}

export default ui
