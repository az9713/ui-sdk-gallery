import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/select"
import "@ui-sdk/web/switch"
import { createHistory, stageChanges, type HistoryEntry } from "@ui-sdk/core/history"
import { observe, withSource } from "@ui-sdk/core/observe"
import { curveBasis, curveLinear, line, scaleUtc, utcFormat, utcMinute } from "d3"
import type { UI } from "../src/ui"

type Source = Parameters<typeof withSource>[0]
type Values = { text: string; fill: string; connector: string; snap: boolean }
type Api = { setValue: (value: unknown) => void; setChecked: (value: boolean) => void }

const MINUTE = 60_000
const START = Date.UTC(2026, 10, 24, 14, 0)
const NOW = START + 12 * MINUTE
const END = START + 20 * MINUTE
const W = 640
const LANE = 34
const TOP = 6
const H = TOP * 2 + LANE * 2
const FILLS: Record<string, { label: string; color: string }> = {
  yellow: { label: "Yellow", color: "#fde68a" },
  blue: { label: "Blue", color: "#bfdbfe" },
  green: { label: "Green", color: "#bbf7d0" },
  pink: { label: "Pink", color: "#fbcfe8" },
}
const CONNECTORS: Record<string, string> = { straight: "Straight", elbow: "Elbow", curved: "Curved" }
const LABELS: Record<string, keyof Values> = { "Note text": "text", "Fill color": "fill", Connector: "connector", "Snap to grid": "snap" }
const FIRST: Values = { text: "Checkout", fill: "yellow", connector: "straight", snap: false }
const SEED: { at: number; source: Source; key: keyof Values; value: string | boolean }[] = [
  { at: 2, source: "mouse", key: "fill", value: "blue" },
  { at: 4, source: "agent", key: "connector", value: "elbow" },
  { at: 7, source: "keyboard", key: "text", value: "Checkout flow" },
  { at: 9, source: "agent", key: "snap", value: true },
  { at: 11, source: "mouse", key: "fill", value: "yellow" },
]
const SUGGESTION = [
  { ref: "Fill color", value: "green" },
  { ref: "Connector", value: "curved" },
  { ref: "Note text", value: "Checkout: 3 steps" },
]
const clock = utcFormat("%H:%M")

const show = (label: string, value: unknown) => {
  const key = LABELS[label]
  if (key === "fill") return FILLS[String(value)]?.label ?? String(value)
  if (key === "connector") return CONNECTORS[String(value)] ?? String(value)
  if (key === "snap") return value ? "on" : "off"
  return String(value)
}
const who = (source: string) => (source === "agent" ? "Agent" : "Mara")
const describe = (entry: Pick<HistoryEntry, "label" | "value" | "source">) =>
  `${who(entry.source)} set ${entry.label} to ${show(entry.label, entry.value)}`
const esc = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

const html = `
<header class="f16-head">
  <h2>Checkout flow board</h2>
  <p>Mara and the agent edit the same sticky note. Each edit goes on the log with who made it.</p>
</header>
<div class="f16-top">
  <div class="f16-board" data-board aria-hidden="true">
    <svg viewBox="0 0 360 220" data-board-art>
      <g data-dots></g>
      <path data-connector />
    </svg>
    <div class="f16-shape" data-cart>Cart</div>
    <div class="f16-note" data-note></div>
  </div>
  <section class="f16-panel" data-panel aria-labelledby="f16-panel-title">
    <h3 id="f16-panel-title">Sticky note</h3>
    <ui-field>
      <ui-field-label>Note text</ui-field-label>
      <ui-input data-control="text"><input value="${FIRST.text}" /></ui-input>
    </ui-field>
    <ui-field>
      <ui-field-label>Fill color</ui-field-label>
      <ui-select data-control="fill" default-value="${FIRST.fill}">
        <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
        <ui-select-content>
          ${Object.entries(FILLS).map(([value, fill]) => `<ui-select-item value="${value}">${fill.label}</ui-select-item>`).join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
    <ui-field>
      <ui-field-label>Connector</ui-field-label>
      <ui-select data-control="connector" default-value="${FIRST.connector}">
        <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
        <ui-select-content>
          ${Object.entries(CONNECTORS).map(([value, label]) => `<ui-select-item value="${value}">${label}</ui-select-item>`).join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
    <ui-field data-row>
      <ui-switch data-control="snap"><ui-switch-thumb></ui-switch-thumb></ui-switch>
      <ui-field-label>Snap to grid</ui-field-label>
    </ui-field>
  </section>
</div>
<section class="f16-log" aria-labelledby="f16-log-title">
  <div class="f16-log-head">
    <h3 id="f16-log-title">Edit log</h3>
    <div class="f16-actions">
      <ui-button data-undo-last><button>Undo last edit</button></ui-button>
      <ui-button data-undo-agent><button>Undo agent edits</button></ui-button>
    </div>
  </div>
  <div class="f16-lanes">
    <svg viewBox="0 0 ${W} ${H}" aria-hidden="true" data-swimlane></svg>
    <span class="f16-lane-name" style="top: ${((TOP + LANE / 2) / H) * 100}%">Mara</span>
    <span class="f16-lane-name" style="top: ${((TOP + LANE * 1.5) / H) * 100}%">Agent</span>
  </div>
  <div class="f16-ticks" data-ticks aria-hidden="true"></div>
  <ul class="f16-legend">
    <li><span class="f16-key" data-shape="person"></span>Mara</li>
    <li><span class="f16-key" data-shape="agent"></span>Agent</li>
    <li><span class="f16-key" data-shape="agent" data-state="preview"></span>Preview</li>
    <li><span class="f16-key" data-shape="agent" data-state="undone"></span>Undone</li>
  </ul>
  <ol class="f16-entries" data-entries aria-label="Edits, newest first"></ol>
</section>
<section class="f16-suggest" data-suggest aria-labelledby="f16-suggest-title">
  <h3 id="f16-suggest-title">Agent suggestion</h3>
  <p>Tidy the note: Fill color Green, Connector Curved, Note text "Checkout: 3 steps".</p>
  <div class="f16-actions">
    <ui-button data-preview><button>Preview suggestion</button></ui-button>
    <ui-button data-keep hidden data-agent-confirm="Keeps 3 agent edits"><button>Keep suggestion</button></ui-button>
    <ui-button data-discard hidden><button>Discard suggestion</button></ui-button>
  </div>
</section>
<p role="status" data-status></p>`

const css = `
[data-stage] { display: grid; gap: 20px; max-width: 880px; }
[data-stage] h2, [data-stage] h3, [data-stage] p, [data-stage] ul, [data-stage] ol { margin: 0; padding: 0; }
[data-stage] h2 { font-size: 1.375rem; font-weight: 700; }
[data-stage] h3 { font-size: 1.125rem; font-weight: 600; }
[data-stage] .f16-head { display: grid; gap: 4px; }
[data-stage] .f16-head p { color: var(--ui-muted-foreground); max-width: 60ch; }
[data-stage] .f16-top { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 20px; align-items: start; }
[data-stage] .f16-board { position: relative; aspect-ratio: 360 / 220; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-muted); }
[data-stage] [data-board-art] { display: block; width: 100%; height: 100%; }
[data-stage] [data-dots] circle { fill: var(--ui-input); }
[data-stage] [data-connector] { fill: none; stroke: var(--ui-foreground); stroke-width: 2; }
[data-stage] .f16-shape, [data-stage] .f16-note { position: absolute; display: grid; place-items: center; padding: 6px 8px; border-radius: 4px; font-weight: 600; text-align: center; }
[data-stage] .f16-shape { left: 6.67%; top: 13.6%; width: 30.5%; height: 25.5%; background: var(--ui-background); color: var(--ui-foreground); border: 1px solid var(--ui-input); }
[data-stage] .f16-note { width: 33.3%; height: 31.8%; color: #0f172a; border: 1px solid #0f172a; }
[data-stage] .f16-board[data-staged] .f16-note { outline: 2px dashed var(--ui-ring); outline-offset: 3px; }
[data-stage] .f16-panel, [data-stage] .f16-log, [data-stage] .f16-suggest { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-background); }
[data-stage] [data-row] { flex-direction: row; align-items: center; gap: 12px; }
[data-stage] .f16-panel ui-select-trigger button { width: 100%; }
[data-stage] .f16-log-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
[data-stage] .f16-actions { display: flex; flex-wrap: wrap; gap: 10px; }
[data-stage] .f16-lanes { position: relative; padding-left: 64px; }
[data-stage] [data-swimlane] { display: block; width: 100%; height: auto; }
[data-stage] [data-swimlane] [data-band] { fill: var(--ui-muted); }
[data-stage] [data-swimlane] [data-tick] { stroke: var(--ui-border); stroke-width: 1; }
[data-stage] [data-swimlane] [data-now] { stroke: var(--ui-ring); stroke-width: 1.5; stroke-dasharray: 4 3; }
[data-stage] [data-swimlane] [data-mark] { stroke-width: 2; }
[data-stage] [data-mark][data-lane="person"] { fill: var(--g-warm, #fb923c); stroke: var(--g-warm, #fb923c); }
[data-stage] [data-mark][data-lane="agent"] { fill: var(--ui-primary); stroke: var(--ui-primary); }
[data-stage] [data-mark][data-state="preview"] { fill: var(--ui-background); stroke-dasharray: 3 2; }
[data-stage] [data-mark][data-state="undone"], [data-stage] [data-mark][data-state="reverted"] { fill: var(--ui-background); stroke: var(--ui-input); }
[data-stage] .f16-lane-name { position: absolute; left: 0; transform: translateY(-50%); font-size: 0.875rem; font-weight: 600; }
[data-stage] .f16-ticks { position: relative; height: 1.25rem; margin-left: 64px; font-size: 0.75rem; color: var(--ui-muted-foreground); font-variant-numeric: tabular-nums; }
[data-stage] .f16-ticks span { position: absolute; top: 0; transform: translateX(-50%); }
[data-stage] .f16-legend { display: flex; flex-wrap: wrap; gap: 16px; list-style: none; font-size: 0.875rem; color: var(--ui-muted-foreground); }
[data-stage] .f16-legend li { display: flex; align-items: center; gap: 6px; }
[data-stage] .f16-key { width: 12px; height: 12px; border: 2px solid; }
[data-stage] .f16-key[data-shape="person"] { border-radius: 50%; background: var(--g-warm, #fb923c); border-color: var(--g-warm, #fb923c); }
[data-stage] .f16-key[data-shape="agent"] { border-radius: 2px; background: var(--ui-primary); border-color: var(--ui-primary); }
[data-stage] .f16-key[data-state="preview"] { background: var(--ui-background); border-style: dashed; }
[data-stage] .f16-key[data-state="undone"] { background: var(--ui-background); border-color: var(--ui-input); }
[data-stage] .f16-entries { display: grid; gap: 4px; list-style: none; font-size: 0.875rem; }
[data-stage] .f16-entries li { display: grid; grid-template-columns: 3.5rem minmax(0, 1fr) auto; gap: 8px; }
[data-stage] .f16-entries time { color: var(--ui-muted-foreground); font-variant-numeric: tabular-nums; }
[data-stage] .f16-entries [data-state-name] { color: var(--ui-muted-foreground); }
[data-stage] .f16-entries li[data-state="undone"] span:first-of-type, [data-stage] .f16-entries li[data-state="reverted"] span:first-of-type { text-decoration: line-through; color: var(--ui-muted-foreground); }
[data-stage] .f16-suggest p { max-width: 60ch; }
[data-stage] [data-status] { max-width: 60ch; color: var(--ui-muted-foreground); }
@media (max-width: 720px) {
  [data-stage] .f16-top { grid-template-columns: minmax(0, 1fr); }
}
`

function mount(root: HTMLElement, { agent }: Parameters<UI["mount"]>[1]) {
  const values: Values = { ...FIRST }
  const times = new Map<string, number>()
  let at: number | null = null
  let quiet = false
  let preview = new Set<string>()
  let discarded = new Set<string>()
  // A discard puts the old values back through the bridge, so the history records them as agent edits. The log leaves them out.
  const restores = new Set<string>()
  let staged: Awaited<ReturnType<typeof stageChanges>> | null = null
  const mountedAt = performance.now()
  const now = () => at ?? NOW + (performance.now() - mountedAt)

  const panel = () => root.querySelector("[data-panel]")
  const history = createHistory(agent, { within: panel, keys: ["value", "checked"] })
  observe(
    (change) => {
      if (quiet || !change.label || !(change.label in LABELS)) return
      const line = root.querySelector("[data-status]")
      if (line) line.textContent = `${describe({ label: change.label, value: change.value, source: change.source })}.`
    },
    { within: panel },
  )
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const control = (key: keyof Values) => root.querySelector<HTMLElement & { api: Api }>(`[data-control="${key}"]`)!

  for (const key of ["text", "fill", "connector"] as const)
    control(key).addEventListener("valuechange", (e) => {
      values[key] = String((e as CustomEvent<{ value: string }>).detail.value)
      drawBoard()
    })
  control("snap").addEventListener("checkedchange", (e) => {
    values.snap = Boolean((e as CustomEvent<{ value: boolean }>).detail.value)
    drawBoard()
  })

  const stateOf = (entry: HistoryEntry, index: number) => {
    if (entry.reverted) return "reverted"
    if (index >= history.position()) return "undone"
    if (discarded.has(entry.id)) return "reverted"
    if (staged && preview.has(entry.id)) return "preview"
    return "applied"
  }

  const drawBoard = () => {
    const board = root.querySelector<HTMLElement>("[data-board]")!
    const note = root.querySelector<HTMLElement>("[data-note]")!
    const [x, y] = values.snap ? [216, 140] : [226, 132]
    note.textContent = values.text
    note.style.left = `${(x / 360) * 100}%`
    note.style.top = `${(y / 220) * 100}%`
    note.style.background = FILLS[values.fill]?.color ?? FILLS.yellow!.color
    board.toggleAttribute("data-staged", !!staged)
    const dots: string[] = []
    if (values.snap) for (let gx = 12; gx < 360; gx += 24) for (let gy = 12; gy < 220; gy += 24) dots.push(`<circle cx="${gx}" cy="${gy}" r="1.5" />`)
    root.querySelector("[data-dots]")!.innerHTML = dots.join("")
    const from: [number, number] = [134, 58]
    const to: [number, number] = [x + 60, y]
    const points: [number, number][] =
      values.connector === "elbow" ? [from, [to[0], from[1]], to] : values.connector === "curved" ? [from, [to[0] - 40, from[1]], [to[0], from[1] + 30], to] : [from, to]
    const path = line().curve(values.connector === "curved" ? curveBasis : curveLinear)(points)
    root.querySelector("[data-connector]")!.setAttribute("d", path ?? "")
  }

  const drawLog = () => {
    const entries = history.entries()
    for (const entry of entries) if (!times.has(entry.id)) times.set(entry.id, now())
    const end = Math.max(END, now() + 2 * MINUTE)
    const x = scaleUtc().domain([START, end]).range([10, W - 10])
    const ticks = x.ticks(utcMinute.every(5)!)
    const last = { person: -Infinity, agent: -Infinity }
    const shown = entries
      .map((entry, index) => ({ entry, state: stateOf(entry, index), lane: entry.source === "agent" ? ("agent" as const) : ("person" as const) }))
      .filter(({ entry }) => !restores.has(entry.id))
    const marks = shown.map(({ entry, state, lane }) => {
      const cx = Math.max(x(times.get(entry.id)!), last[lane] + 13)
      last[lane] = cx
      const cy = TOP + LANE * (lane === "agent" ? 1.5 : 0.5)
      const attrs = `data-mark data-lane="${lane}" data-state="${state}" data-id="${entry.id}"`
      return lane === "agent"
        ? `<rect ${attrs} x="${cx - 6}" y="${cy - 6}" width="12" height="12" rx="2" />`
        : `<circle ${attrs} cx="${cx}" cy="${cy}" r="6.5" />`
    })
    root.querySelector("[data-swimlane]")!.innerHTML = [
      `<rect data-band x="0" y="${TOP}" width="${W}" height="${LANE - 4}" rx="4" />`,
      `<rect data-band x="0" y="${TOP + LANE}" width="${W}" height="${LANE - 4}" rx="4" />`,
      ...ticks.map((t) => `<line data-tick x1="${x(t)}" x2="${x(t)}" y1="0" y2="${H}" />`),
      `<line data-now x1="${x(now())}" x2="${x(now())}" y1="0" y2="${H}" />`,
      ...marks,
    ].join("")
    root.querySelector("[data-ticks]")!.innerHTML = ticks.map((t) => `<span style="left: ${(x(t) / W) * 100}%">${clock(t)}</span>`).join("")
    root.querySelector("[data-entries]")!.innerHTML = shown
      .reverse()
      .slice(0, 6)
      .map(
        ({ entry, state, lane }) =>
          `<li data-state="${state}" data-lane="${lane}"><time>${clock(new Date(times.get(entry.id)!))}</time><span>${esc(describe(entry))}</span><span data-state-name>${state === "applied" ? "" : state}</span></li>`,
      )
      .join("")
  }

  history.subscribe(drawLog)

  const apply = (key: keyof Values, value: string | boolean) =>
    key === "snap" ? control(key).api.setChecked(value as boolean) : control(key).api.setValue(value)

  drawBoard()
  drawLog()
  setTimeout(() => {
    quiet = true
    for (const seed of SEED) {
      at = START + seed.at * MINUTE
      withSource(seed.source, () => apply(seed.key, seed.value))
      drawLog()
    }
    at = null
    quiet = false
    drawBoard()
    drawLog()
    status.textContent = `${history.entries().length} edits since ${clock(new Date(START))}. No edit is undone.`
  })

  const undo = async (run: () => Promise<{ ref: string }[]>, done: string) => {
    quiet = true
    const missed = await run()
    quiet = false
    drawLog()
    status.textContent = missed.length ? `${done} ${missed.length} edits could not go back.` : done
  }
  // A preview's revert puts back the values it captured, so an undo during a preview would come back.
  const blocked = () => {
    if (staged) status.textContent = "Keep or discard the suggestion first."
    return !!staged
  }
  root.querySelector("[data-undo-last]")!.addEventListener("action", () => {
    if (blocked()) return
    const entries = history.entries()
    let index = history.position() - 1
    while (index >= 0 && (restores.has(entries[index]!.id) || stateOf(entries[index]!, index) !== "applied")) index--
    if (index < 0) return void (status.textContent = "No edit is left to undo.")
    void undo(() => history.seek(index), `Undid: ${describe(entries[index]!)}.`)
  })
  root.querySelector("[data-undo-agent]")!.addEventListener("action", () => {
    if (blocked()) return
    const count = history
      .entries()
      .filter((entry, index) => entry.source === "agent" && !restores.has(entry.id) && stateOf(entry, index) === "applied").length
    void undo(() => history.undoSource("agent"), `Undid ${count} agent edits. Mara's edits stay.`)
  })

  const preview_ = root.querySelector<HTMLElement>("[data-preview]")!
  const keep = root.querySelector<HTMLElement>("[data-keep]")!
  const discard = root.querySelector<HTMLElement>("[data-discard]")!
  const previewing = (on: boolean) => {
    preview_.hidden = on
    keep.hidden = !on
    discard.hidden = !on
    drawBoard()
    drawLog()
  }
  preview_.addEventListener("action", async () => {
    const before = new Set(history.entries().map((entry) => entry.id))
    quiet = true
    staged = await stageChanges(agent, SUGGESTION)
    quiet = false
    preview = new Set(history.entries().filter((entry) => !before.has(entry.id)).map((entry) => entry.id))
    previewing(true)
    status.textContent = `Preview: the agent's suggestion puts ${staged.applied.length} edits on the board. Keep it or discard it.`
  })
  keep.addEventListener("action", () => {
    staged = null
    previewing(false)
    status.textContent = `Kept the agent's suggestion: ${preview.size} edits.`
  })
  discard.addEventListener("action", async () => {
    if (!staged) return
    const before = new Set(history.entries().map((entry) => entry.id))
    quiet = true
    await staged.revert()
    quiet = false
    discarded = new Set([...discarded, ...preview])
    for (const entry of history.entries()) if (!before.has(entry.id)) restores.add(entry.id)
    staged = null
    previewing(false)
    status.textContent = "Discarded the agent's suggestion. The note is as it was before the preview."
  })
}

const ui: UI = {
  id: "F16",
  request:
    "Build a whiteboard sticky-note editor with an audit log that shows each edit on a time swimlane by Mara or the agent, undoes the agent's edits, and previews an agent suggestion before Mara keeps or discards it.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Note text", action: "setValue", args: ["Checkout v2"] },
      { ref: "Fill color", action: "setValue", args: ["Pink"] },
    ],
    done: (root) => {
      const items = [...root.querySelectorAll("[data-entries] li")].map((li) => li.textContent ?? "")
      return items.some((t) => t.includes("Agent set Note text to Checkout v2")) && items.some((t) => t.includes("Agent set Fill color to Pink"))
    },
  },
}

export default ui
