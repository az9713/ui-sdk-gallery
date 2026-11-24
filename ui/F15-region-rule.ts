import type { AgentAction } from "@ui-sdk/web/agent"
import "@ui-sdk/web/button"
import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import type { Context, UI } from "../src/ui"

const regions = [
  { value: "us-west", name: "US West", code: "PDX", eu: false, col: 0, row: 1 },
  { value: "us-east", name: "US East", code: "IAD", eu: false, col: 2, row: 1 },
  { value: "ca-central", name: "Canada", code: "YUL", eu: false, col: 2, row: 0 },
  { value: "sa-east", name: "Brazil", code: "GRU", eu: false, col: 3, row: 4 },
  { value: "eu-west", name: "Ireland", code: "DUB", eu: true, col: 5, row: 1 },
  { value: "eu-central", name: "Germany", code: "FRA", eu: true, col: 6, row: 1 },
  { value: "eu-north", name: "Sweden", code: "ARN", eu: true, col: 7, row: 0 },
  { value: "ap-south", name: "India", code: "BOM", eu: false, col: 8, row: 2 },
  { value: "ap-northeast", name: "Japan", code: "NRT", eu: false, col: 11, row: 1 },
  { value: "au-east", name: "Australia", code: "SYD", eu: false, col: 11, row: 4 },
] as const

// Land tiles with no storage region, as [col, row] on the same odd-row offset grid.
const land = [
  [1, 0], [3, 0], [6, 0], [8, 0], [9, 0], [10, 0],
  [1, 1], [7, 1], [8, 1], [9, 1], [10, 1],
  [1, 2], [5, 2], [6, 2], [7, 2], [9, 2], [10, 2],
  [2, 3], [3, 3], [6, 3], [7, 3], [9, 3],
  [6, 4], [10, 4],
  [3, 5],
] as const

const policies = [
  { value: "eu", label: "EU only" },
  { value: "any", label: "Any region" },
] as const
type Policy = (typeof policies)[number]["value"]

// The agent may run only these actions. Each other step is refused before it runs.
const ALLOW = [
  { label: "Storage regions", action: "setValue" },
  { label: "Save residency", action: "press" },
] as const

const START = ["eu-west", "eu-central"]
const SAVE_CONFIRM = "Moves stored customer data to the checked regions"

const R = 26
const HEX_W = Math.sqrt(3) * R
const PAD = 10
const W = Math.ceil(PAD * 2 + HEX_W * 12.5)
const H = Math.ceil(PAD * 2 + R * 9.5)

const center = (col: number, row: number) => ({
  x: PAD + HEX_W / 2 + HEX_W * (col + (row % 2) * 0.5),
  y: PAD + R + R * 1.5 * row,
})
const hex = (col: number, row: number) => {
  const { x, y } = center(col, row)
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 90) * Math.PI) / 180
    return `${(x + (R - 1.5) * Math.cos(a)).toFixed(1)},${(y + (R - 1.5) * Math.sin(a)).toFixed(1)}`
  }).join(" ")
}
const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(2)}%`

const regionOf = (value: string) => regions.find((r) => r.value === value)
const names = (values: readonly string[]) => values.map((v) => regionOf(v)?.name ?? v).join(", ")
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const map = () => `
<div data-map aria-hidden="true">
  <svg viewBox="0 0 ${W} ${H}" focusable="false">
    <g>${land.map(([col, row]) => `<polygon data-land points="${hex(col, row)}"/>`).join("")}</g>
    <g>${regions.map((r) => `<polygon data-tile="${r.value}" ${r.eu ? "data-eu" : ""} points="${hex(r.col, r.row)}"/>`).join("")}</g>
  </svg>
  ${regions
    .map((r) => {
      const { x, y } = center(r.col, r.row)
      return `<span data-code="${r.value}" style="left: ${pct(x, W)}; top: ${pct(y, H)}">${r.code}</span>`
    })
    .join("")}
</div>`

const html = `
<div data-residency>
  <section data-map-card aria-labelledby="f15-map-title">
    <h2 id="f15-map-title">Residency map</h2>
    ${map()}
    <ul data-legend aria-label="Map legend">
      <li><span data-swatch="eu"></span>Stored, in the EU</li>
      <li><span data-swatch="outside"></span>Stored, outside the EU</li>
      <li><span data-swatch="free"></span>Region not used</li>
      <li><span data-swatch="denied"></span>Agent change canceled</li>
    </ul>
    <dl data-telemetry>
      <div><dt>Policy</dt><dd data-read="policy"></dd></div>
      <div><dt>Stored in</dt><dd data-read="stored"></dd></div>
      <div><dt>Outside the EU</dt><dd data-read="outside"></dd></div>
      <div><dt>Canceled</dt><dd data-read="canceled"></dd></div>
    </dl>
    <ol data-log aria-label="Change log"></ol>
  </section>
  <section data-form aria-labelledby="f15-form-title">
    <h2 id="f15-form-title">Storage regions</h2>
    <ui-field>
      <ui-field-label>Residency policy</ui-field-label>
      <ui-select default-value="eu">
        <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
        <ui-select-content>
          ${policies.map((p) => `<ui-select-item value="${p.value}">${p.label}</ui-select-item>`).join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
    <ui-checkbox-group aria-labelledby="f15-form-title" default-value="${START.join(",")}">
      ${regions
        .map(
          (r) => `<label data-slot="label"><ui-checkbox value="${r.value}"><ui-checkbox-indicator></ui-checkbox-indicator></ui-checkbox>${r.name}</label>`,
        )
        .join("")}
    </ui-checkbox-group>
    <ui-button data-save data-agent-confirm="${SAVE_CONFIRM}"><button type="button">Save residency</button></ui-button>
    <p role="status" data-status></p>
    <div data-allow>
      <p>Agent allow list</p>
      <ul>${ALLOW.map((a) => `<li><code>${a.action}</code> on ${a.label}</li>`).join("")}</ul>
      <p>The agent cannot change the policy or a single region. Under EU only, an agent change that adds a region outside the EU is canceled.</p>
    </div>
  </section>
</div>`

const css = `
[data-stage] [data-residency] { display: flex; flex-wrap: wrap; gap: 24px; align-items: start; }
[data-stage] h2 { margin: 0; font-size: 1.125rem; font-weight: 600; }
[data-stage] p, [data-stage] dl, [data-stage] dd, [data-stage] ol, [data-stage] ul { margin: 0; }
[data-stage] [data-map-card] {
  display: grid; gap: 14px; width: min(100%, 560px); padding: 18px;
  border: 1px solid #334155; border-radius: 10px; background: #0f172a; color: #e2e8f0;
}
[data-stage] [data-map] { position: relative; }
[data-stage] [data-map] svg { display: block; width: 100%; height: auto; }
[data-stage] [data-land] { fill: #1e293b; }
[data-stage] [data-tile] { fill: #334155; stroke: #94a3b8; stroke-width: 1.5; transition: fill 240ms ease; }
[data-stage] [data-tile][data-eu] { stroke: #2dd4bf; }
[data-stage] [data-tile][data-stored] { fill: #fb923c; stroke: #fb923c; }
[data-stage] [data-tile][data-stored][data-eu] { fill: #2dd4bf; stroke: #2dd4bf; }
[data-stage] [data-tile][data-denied] { stroke: #fda4af; stroke-width: 3; stroke-dasharray: 5 4; }
[data-stage] [data-code] {
  position: absolute; transform: translate(-50%, -50%); padding: 0 3px; border-radius: 3px;
  background: #334155; color: #e2e8f0; font: 600 0.6875rem/1.4 ui-monospace, Consolas, monospace;
  transition: background-color 240ms ease;
}
[data-stage] [data-code][data-stored] { background: #fb923c; color: #0f172a; }
[data-stage] [data-code][data-stored][data-eu] { background: #2dd4bf; }
[data-stage] [data-legend] { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 0; list-style: none; color: #cbd5e1; font-size: 0.8125rem; }
[data-stage] [data-legend] li { display: flex; align-items: center; gap: 6px; }
[data-stage] [data-swatch] { width: 12px; height: 12px; border-radius: 3px; border: 1px solid #94a3b8; background: #334155; }
[data-stage] [data-swatch="eu"] { background: #2dd4bf; border-color: #2dd4bf; }
[data-stage] [data-swatch="outside"] { background: #fb923c; border-color: #fb923c; }
[data-stage] [data-swatch="denied"] { background: transparent; border: 2px dashed #fda4af; }
[data-stage] [data-telemetry] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px; }
[data-stage] [data-telemetry] dt { color: #94a3b8; font-size: 0.875rem; }
[data-stage] [data-telemetry] dd { font-variant-numeric: tabular-nums; font-weight: 600; }
[data-stage] [data-read="outside"][data-warn] { color: #fdba74; }
[data-stage] [data-log] { display: grid; gap: 4px; padding-left: 20px; color: #cbd5e1; font-size: 0.875rem; }
[data-stage] [data-log]:empty { display: none; }
[data-stage] [data-form] { display: grid; gap: 18px; width: min(100%, 340px); justify-items: start; }
[data-stage] [data-form] > ui-field { width: 100%; }
[data-stage] ui-checkbox-group { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; width: 100%; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); max-width: 60ch; }
[data-stage] [data-allow] { display: grid; gap: 6px; width: 100%; padding: 12px 14px; border: 1px solid #334155; border-radius: 8px; color: #cbd5e1; font-size: 0.875rem; }
[data-stage] [data-allow] > p:first-child { color: #e2e8f0; font-weight: 600; }
[data-stage] [data-allow] ul { display: grid; gap: 2px; padding-left: 20px; }
[data-stage] [data-allow] code { color: #2dd4bf; font-family: ui-monospace, Consolas, monospace; }
@media (prefers-reduced-motion: reduce) {
  [data-stage] [data-tile], [data-stage] [data-code] { transition: none; }
}
`

type Change = { value: string[]; source?: string }

function mount(root: HTMLElement) {
  root.innerHTML = html
  let policy: Policy = "eu"
  let stored: string[] = [...START]
  let canceled = 0
  const status = root.querySelector("[data-status]")!
  const log = root.querySelector("[data-log]")!
  const group = root.querySelector("ui-checkbox-group")!
  const read = (key: string) => root.querySelector<HTMLElement>(`[data-read="${key}"]`)!
  const say = (text: string) => (status.textContent = text)
  const note = (text: string) => {
    const line = document.createElement("li")
    line.textContent = text
    log.prepend(line)
    while (log.children.length > 4) log.lastElementChild!.remove()
  }
  const outsideOf = (values: readonly string[]) => values.filter((v) => !regionOf(v)?.eu)

  const draw = (denied: readonly string[] = []) => {
    for (const el of root.querySelectorAll<Element>("[data-tile], [data-code]")) {
      const value = el.getAttribute("data-tile") ?? el.getAttribute("data-code")!
      el.toggleAttribute("data-stored", stored.includes(value))
      el.toggleAttribute("data-eu", !!regionOf(value)?.eu)
      if (el.hasAttribute("data-tile")) el.toggleAttribute("data-denied", denied.includes(value))
    }
    const outside = outsideOf(stored)
    read("policy").textContent = policies.find((p) => p.value === policy)!.label
    read("stored").textContent = `${plural(stored.length, "region")} of ${regions.length}`
    read("outside").textContent = outside.length ? names(outside) : "None"
    read("outside").toggleAttribute("data-warn", outside.length > 0)
    read("canceled").textContent = plural(canceled, "agent change")
  }

  group.addEventListener("valuechange", (event) => {
    const { value, source } = (event as CustomEvent<Change>).detail
    const added = value.filter((v) => !stored.includes(v))
    const unknown = added.filter((v) => !regionOf(v))
    const outside = policy === "eu" ? outsideOf(added).filter((v) => regionOf(v)) : []
    // The web event has no details.cancel(): preventDefault() is the cancel.
    if (source === "agent" && (unknown.length || outside.length)) {
      event.preventDefault()
      canceled += 1
      const is = (list: string[]) => (list.length === 1 ? "is" : "are")
      const text = unknown.length
        ? `Canceled an agent change: ${unknown.join(", ")} ${unknown.length === 1 ? "is not a storage region" : "are not storage regions"}.`
        : `Canceled an agent change: ${names(outside)} ${is(outside)} outside the EU.`
      say(text)
      note(text)
      draw(outside)
      return
    }
    stored = [...value]
    const who = source === "agent" ? "Agent" : "Person"
    note(`${who} set regions: ${names(stored) || "none"}`)
    say(`Storing in ${plural(stored.length, "region")}: ${names(stored) || "none"}.`)
    draw()
  })

  root.querySelector("ui-select")!.addEventListener("valuechange", (event) => {
    policy = (event as CustomEvent<{ value: Policy }>).detail.value
    const text =
      policy === "eu" ? "Policy: EU only. Agent changes that add a region outside the EU are canceled." : "Policy: Any region. Agent changes may add any region."
    say(text)
    note(text)
    draw()
  })

  root.querySelector("[data-save]")!.addEventListener("action", () => {
    say(`Saved ${plural(stored.length, "region")}: ${names(stored) || "none"}. ${plural(canceled, "agent change")} canceled.`)
  })

  say(`Storing in ${plural(stored.length, "region")}: ${names(stored)}. Policy: EU only.`)
  draw()
}

function allow(step: AgentAction, ask: Context["ask"]) {
  if (!ALLOW.some((rule) => rule.label === step.label && rule.action === step.action)) return false
  return step.confirm ? ask(step.confirm) : true
}

const ui: UI = {
  id: "F15",
  request:
    "Build a data residency page with a hexagon tile map of storage regions, a residency policy and a region list, where an agent may only set the region list and save, and an agent change that adds a region outside the EU is canceled.",
  css,
  mount,
  allow,
  task: {
    steps: [
      { ref: "Storage regions", action: "setValue", args: [["eu-west", "eu-central", "ap-northeast"]] },
      { ref: "Storage regions", action: "setValue", args: [["eu-west", "eu-central", "eu-north"]] },
      { ref: "Save residency", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Saved 3 regions: Ireland, Germany, Sweden. 1 agent change canceled.",
  },
}

export default ui
