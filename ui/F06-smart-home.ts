import "@ui-sdk/web/button"
import "@ui-sdk/web/slider"
import "@ui-sdk/web/switch"
import { registerTools } from "@ui-sdk/web/agent"
import type { AgentAction } from "@ui-sdk/web/agent"
import type { Context, UI } from "../src/ui"

type Tool = {
  name: string
  description: string
  inputSchema: object
  annotations?: Record<string, boolean>
  execute: (input: object, client: object) => unknown
}
type Glow = "read" | "act"

const switches = [
  { key: "lamp", label: "Living room lamp", start: false, on: "on", off: "off" },
  { key: "kitchen", label: "Kitchen lights", start: true, on: "on", off: "off" },
  { key: "lock", label: "Front door lock", start: true, on: "locked", off: "unlocked" },
] as const
const sliders = [
  { key: "thermostat", label: "Thermostat", start: 19, min: 16, max: 26, step: 1, unit: " °C" },
  { key: "blinds", label: "Bedroom blinds", start: 60, min: 0, max: 100, step: 5, unit: "% open" },
] as const
const labelOf: Record<string, string> = Object.fromEntries([...switches, ...sliders].map((d) => [d.key, d.label]))
const keyOf = (label?: string) => Object.keys(labelOf).find((key) => labelOf[key] === label)

const requests = [
  {
    id: "evening",
    label: "Evening scene",
    tool: "act",
    input: {
      steps: [
        { ref: "Living room lamp", action: "setChecked", args: [true] },
        { ref: "Bedroom blinds", action: "setValue", args: [20] },
        { ref: "Thermostat", action: "setValue", args: [21] },
      ],
    },
  },
  {
    id: "work",
    label: "Leave for work",
    tool: "act",
    input: {
      steps: [
        { ref: "Living room lamp", action: "setChecked", args: [false] },
        { ref: "Kitchen lights", action: "setChecked", args: [false] },
        { ref: "Thermostat", action: "setValue", args: [17] },
      ],
    },
  },
  { id: "courier", label: "Let the courier in", tool: "act", input: { steps: [{ ref: "Front door lock", action: "setChecked", args: [false] }] } },
  { id: "read", label: "Read the house", tool: "snapshot", input: {} },
] as const
type Request = (typeof requests)[number]

// The browser agent may not open the door, switch off its own tools, or press its own request buttons.
const GUARDED = ["Front door lock", "WebMCP tools"]
const HINTS: Record<string, string> = { readOnlyHint: "read-only", consequentialHint: "consequential", untrustedContentHint: "untrusted content" }

const S = 30
const H = 1.6
const VB = { x: -220, y: -64, w: 492, h: 350 }
const iso = (x: number, y: number, z = 0) => [(x - y) * 0.866 * S, (x + y) * 0.5 * S - z * S] as const
const pts = (...points: [number, number, number?][]) => points.map(([x, y, z]) => iso(x, y, z).map((n) => n.toFixed(1)).join(",")).join(" ")
const at = (x: number, y: number, z = 0) => {
  const [px, py] = iso(x, y, z)
  return `left: ${(((px - VB.x) / VB.w) * 100).toFixed(1)}%; top: ${(((py - VB.y) / VB.h) * 100).toFixed(1)}%`
}

const rooms = [
  { name: "Living room", box: [0, 0, 6, 4], fill: "#1e293b", label: [4.3, 3.1] },
  { name: "Kitchen", box: [6, 0, 10, 4], fill: "#22314a", label: [8.7, 3.2] },
  { name: "Bedroom", box: [0, 4, 6, 8], fill: "#1b283c", label: [3.4, 6.8] },
  { name: "Hall", box: [6, 4, 10, 8], fill: "#253247", label: [8.8, 5.0] },
] as const
const partitions: [number, number, number, number][] = [
  [6, 0, 6, 1.4], [6, 2.6, 6, 5.2], [6, 6.4, 6, 8],
  [0, 4, 2.4, 4], [3.6, 4, 6, 4], [6, 4, 7, 4], [8.2, 4, 10, 4],
  [6, 8, 7.4, 8], [8.6, 8, 10, 8],
]
const LOW = 0.35

const halo = (x: number, y: number, z: number) => {
  const [cx, cy] = iso(x, y, z)
  return `<circle class="f06-halo" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="24" filter="url(#f06-blur)"/>`
}
const lampAt = iso(1.6, 1.6)
const lampTop = iso(1.6, 1.6, 1.45)
const lampLow = iso(1.6, 1.6, 1.05)
const dial = iso(4.9, 0, 1.0)

const plan = () => `
<svg class="f06-svg" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" aria-hidden="true" focusable="false">
  <defs><filter id="f06-blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter></defs>
  ${rooms.map((r) => `<polygon points="${pts([r.box[0], r.box[1]], [r.box[2], r.box[1]], [r.box[2], r.box[3]], [r.box[0], r.box[3]])}" fill="${r.fill}" stroke="#334155"/>`).join("")}
  <polygon points="${pts([0, 0, 0], [10, 0, 0], [10, 0, H], [0, 0, H])}" fill="#334155"/>
  <polygon points="${pts([0, 0, 0], [0, 8, 0], [0, 8, H], [0, 0, H])}" fill="#2b3a50"/>
  <polyline points="${pts([0, 8, H], [0, 0, H], [10, 0, H])}" fill="none" stroke="#64748b" stroke-width="2"/>
  ${partitions.map(([x0, y0, x1, y1]) => `<polygon points="${pts([x0, y0, 0], [x1, y1, 0], [x1, y1, LOW], [x0, y0, LOW])}" fill="#3b4a61" stroke="#475569" stroke-width="0.8"/>`).join("")}
  <g data-device="lamp">
    ${halo(1.6, 1.6, 0.8)}
    <ellipse data-light cx="${lampAt[0].toFixed(1)}" cy="${lampAt[1].toFixed(1)}" rx="48" ry="26" fill="#fde68a"/>
    <ellipse cx="${lampAt[0].toFixed(1)}" cy="${lampAt[1].toFixed(1)}" rx="9" ry="5" fill="#94a3b8"/>
    <line x1="${lampAt[0].toFixed(1)}" y1="${lampAt[1].toFixed(1)}" x2="${lampLow[0].toFixed(1)}" y2="${lampLow[1].toFixed(1)}" stroke="#cbd5e1" stroke-width="2"/>
    <polygon data-shade points="${lampTop[0] - 7},${lampTop[1]} ${lampTop[0] + 7},${lampTop[1]} ${lampLow[0] + 13},${lampLow[1]} ${lampLow[0] - 13},${lampLow[1]}"/>
  </g>
  <g data-device="kitchen">
    ${halo(8.1, 1.8, 1.3)}
    ${[7.4, 8.8]
      .map((x) => {
        const [fx, fy] = iso(x, 1.8)
        const [tx, ty] = iso(x, 1.8, 2.1)
        const [bx, by] = iso(x, 1.8, 1.3)
        return `<ellipse data-light cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" rx="30" ry="16" fill="#fde68a"/>
    <line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#94a3b8" stroke-width="1.5"/>
    <circle data-bulb cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="6"/>`
      })
      .join("")}
  </g>
  <g data-device="thermostat">
    ${halo(4.9, 0, 1.0)}
    <circle cx="${dial[0].toFixed(1)}" cy="${dial[1].toFixed(1)}" r="12" fill="#0f172a" stroke="#94a3b8" stroke-width="1.5"/>
    <path data-arc fill="none" stroke="#fb923c" stroke-width="3" stroke-linecap="round"/>
  </g>
  <g data-device="blinds">
    ${halo(0, 6, 0.95)}
    <polygon points="${pts([0, 5, 0.5], [0, 7, 0.5], [0, 7, 1.4], [0, 5, 1.4])}" fill="#38bdf8" fill-opacity="0.45" stroke="#94a3b8"/>
    <polygon data-blind fill="#e2e8f0"/>
    <g data-slats stroke="#64748b" stroke-width="1"></g>
  </g>
  <g data-device="lock">
    ${halo(8, 8, 0.75)}
    <polygon points="${pts([7.4, 8, 0], [8.6, 8, 0], [8.6, 8, 1.5], [7.4, 8, 1.5])}" fill="#7c4a1e" stroke="#a16207"/>
    <circle data-latch cx="${iso(8.35, 8, 0.75)[0].toFixed(1)}" cy="${iso(8.35, 8, 0.75)[1].toFixed(1)}" r="4.5"/>
  </g>
</svg>`

const switchRow = (s: (typeof switches)[number] | { key: string; label: string; start: boolean }) => `
      <label data-slot="label" class="f06-switch">${s.label}<ui-switch data-control="${s.key}"${s.start ? " default-checked" : ""}><ui-switch-thumb></ui-switch-thumb></ui-switch></label>`

const html = `
<div class="f06">
  <section class="f06-plan" aria-labelledby="f06-plan-title">
    <h2 id="f06-plan-title">Floor plan</h2>
    <div class="f06-figure">
      ${plan()}
      ${rooms.map((r) => `<span class="f06-room" style="${at(r.label[0], r.label[1])}">${r.name}</span>`).join("")}
    </div>
    <p class="f06-legend"><span class="f06-key" data-kind="read"></span>Read by a tool <span class="f06-key" data-kind="act"></span>Changed by a tool</p>
  </section>
  <div class="f06-side">
    <section class="f06-box" aria-labelledby="f06-devices-title">
      <h2 id="f06-devices-title">Devices</h2>
      ${switches.map(switchRow).join("")}
      ${sliders
        .map(
          (s) => `
      <ui-slider data-control="${s.key}" aria-label="${s.label}" default-value="${s.start}" min="${s.min}" max="${s.max}" step="${s.step}">
        <span class="f06-row"><span>${s.label}</span><span data-read="${s.key}">${s.start}${s.unit}</span></span>
        <ui-slider-control><ui-slider-track><ui-slider-indicator></ui-slider-indicator><ui-slider-thumb aria-label="${s.label}"></ui-slider-thumb></ui-slider-track></ui-slider-control>
      </ui-slider>`,
        )
        .join("")}
    </section>
    <section class="f06-box" aria-labelledby="f06-webmcp-title">
      <h2 id="f06-webmcp-title">WebMCP</h2>
      ${switchRow({ key: "webmcp", label: "WebMCP tools", start: true })}
      <p class="f06-note">Mock <code>document.modelContext</code> holds <span data-count>0 tools</span>.</p>
      <ul class="f06-tools" data-tools aria-label="Registered tools"></ul>
    </section>
    <section class="f06-box" aria-labelledby="f06-browser-title">
      <h2 id="f06-browser-title">Browser agent</h2>
      <div class="f06-requests">
        ${requests.map((r) => `<ui-button data-request="${r.id}"><button>${r.label}</button></ui-button>`).join("")}
      </div>
      <ol class="f06-log" data-log aria-label="Tool calls"></ol>
      <p role="status" data-status></p>
    </section>
  </div>
</div>`

const css = `
[data-stage] .f06 { display: flex; flex-wrap: wrap; gap: 24px; align-items: start; }
[data-stage] .f06 h2 { margin: 0; font-size: 1.125rem; font-weight: 600; }
[data-stage] .f06 p, [data-stage] .f06 ul, [data-stage] .f06 ol { margin: 0; }
[data-stage] .f06-plan {
  display: grid; gap: 12px; width: min(100%, 580px); padding: 18px;
  border: 1px solid #334155; border-radius: 10px; background: #0f172a; color: #e2e8f0;
}
[data-stage] .f06-figure { position: relative; }
[data-stage] .f06-svg { display: block; width: 100%; height: auto; }
[data-stage] .f06-room {
  position: absolute; transform: translate(-50%, -50%); padding: 5px 8px; border: 1px solid #334155; border-radius: 4px;
  background: #0f172a; color: #cbd5e1; font-size: 0.8125rem; line-height: 1.2; white-space: nowrap;
}
[data-stage] .f06-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; color: #cbd5e1; font-size: 0.875rem; }
[data-stage] .f06-key { width: 12px; height: 12px; border-radius: 50%; }
[data-stage] .f06-key[data-kind="read"] { background: #2dd4bf; }
[data-stage] .f06-key[data-kind="act"] { background: #fb923c; margin-left: 8px; }
[data-stage] .f06-halo { opacity: 0; fill: #2dd4bf; }
[data-stage] [data-glow] .f06-halo { opacity: 0.85; animation: f06-pulse 1.4s ease-in-out infinite alternate; }
[data-stage] [data-glow="act"] .f06-halo { fill: #fb923c; }
[data-stage] [data-calm] [data-glow] .f06-halo { animation: none; }
@keyframes f06-pulse { from { opacity: 0.9; } to { opacity: 0.45; } }
[data-stage] [data-light] { opacity: 0; }
[data-stage] [data-on="true"] [data-light] { opacity: 0.22; }
[data-stage] .f06-side { display: grid; gap: 16px; width: min(100%, 340px); }
[data-stage] .f06-box { display: grid; gap: 12px; }
[data-stage] .f06-switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
[data-stage] .f06 ui-slider { display: grid; gap: 8px; }
[data-stage] .f06-row { display: flex; justify-content: space-between; gap: 12px; }
[data-stage] [data-read] { font-variant-numeric: tabular-nums; color: var(--ui-muted-foreground); }
[data-stage] .f06-note { color: var(--ui-muted-foreground); }
[data-stage] .f06-tools { display: grid; gap: 6px; padding: 0; list-style: none; }
[data-stage] .f06-tools li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
[data-stage] .f06-tools code { font-weight: 600; }
[data-stage] .f06-hint { color: var(--ui-muted-foreground); font-size: 0.875rem; }
[data-stage] .f06-requests { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
[data-stage] .f06-requests button { width: 100%; }
[data-stage] .f06-log { display: grid; gap: 4px; padding-left: 20px; font-size: 0.875rem; color: var(--ui-muted-foreground); }
[data-stage] .f06-log:empty { display: none; }
[data-stage] [data-status] { max-width: 60ch; }
`

function mount(root: HTMLElement, context: Context) {
  root.innerHTML = html
  const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  const svg = root.querySelector<SVGSVGElement>(".f06-svg")!
  const status = root.querySelector("[data-status]")!
  const log = root.querySelector("[data-log]")!
  const list = root.querySelector("[data-tools]")!
  const device = (key: string) => svg.querySelector<SVGGElement>(`[data-device="${key}"]`)!
  const say = (text: string) => (status.textContent = text)
  const state: Record<string, boolean | number> = Object.fromEntries([...switches, ...sliders].map((d) => [d.key, d.start]))
  const tools = new Map<string, Tool>()
  const byTool = new Set<string>()
  let unregister: (() => void) | null = null

  const draw = () => {
    for (const s of switches) device(s.key).setAttribute("data-on", String(state[s.key]))
    for (const s of sliders) {
      device(s.key).setAttribute("data-level", String(state[s.key]))
      root.querySelector(`[data-read="${s.key}"]`)!.textContent = `${state[s.key]}${s.unit}`
    }
    device("lamp").querySelector("[data-shade]")!.setAttribute("fill", state.lamp ? "#fde68a" : "#64748b")
    for (const bulb of device("kitchen").querySelectorAll("[data-bulb]")) bulb.setAttribute("fill", state.kitchen ? "#fde68a" : "#475569")
    device("lock").querySelector("[data-latch]")!.setAttribute("fill", state.lock ? "#2dd4bf" : "#fb923c")

    const t = ((state.thermostat as number) - 16) / 10
    const start = (135 * Math.PI) / 180
    const end = start + Math.max(0.02, t) * 1.5 * Math.PI
    const point = (a: number) => `${(dial[0] + 8 * Math.cos(a)).toFixed(1)} ${(dial[1] + 8 * Math.sin(a)).toFixed(1)}`
    device("thermostat").querySelector("[data-arc]")!.setAttribute("d", `M${point(start)} A8 8 0 ${end - start > Math.PI ? 1 : 0} 1 ${point(end)}`)

    const cover = 0.9 * (1 - (state.blinds as number) / 100)
    const low = 1.4 - cover
    device("blinds").querySelector("[data-blind]")!.setAttribute("points", pts([0, 5, low], [0, 7, low], [0, 7, 1.4], [0, 5, 1.4]))
    const slats: string[] = []
    for (let z = 1.4 - 0.15; z > low + 0.01; z -= 0.15) {
      const [x0, y0] = iso(0, 5, z)
      const [x1, y1] = iso(0, 7, z)
      slats.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/>`)
    }
    device("blinds").querySelector("[data-slats]")!.innerHTML = slats.join("")
  }

  const glow = (key: string, kind: Glow) => {
    svg.toggleAttribute("data-calm", calm())
    device(key).setAttribute("data-glow", kind)
  }
  const clearGlow = () => svg.querySelectorAll("[data-glow]").forEach((g) => g.removeAttribute("data-glow"))

  const renderTools = () => {
    list.replaceChildren(
      ...[...tools.values()].map((tool) => {
        const item = document.createElement("li")
        const name = document.createElement("code")
        name.textContent = tool.name
        const hints = document.createElement("span")
        hints.className = "f06-hint"
        hints.textContent = Object.entries(tool.annotations ?? {})
          .filter(([hint, on]) => on && HINTS[hint])
          .map(([hint]) => HINTS[hint])
          .join(", ")
        item.append(name, hints)
        return item
      }),
    )
    root.querySelector("[data-count]")!.textContent = `${tools.size} ${tools.size === 1 ? "tool" : "tools"}`
  }

  // The mock records what registerTools gives the browser. registerTool must return a Promise, and
  // the cleanup aborts each tool's signal instead of calling an unregister method.
  const modelContext = {
    registerTool: (tool: Tool, options?: { signal?: AbortSignal }) => {
      tools.set(tool.name, tool)
      options?.signal?.addEventListener("abort", () => (tools.delete(tool.name), renderTools()), { once: true })
      renderTools()
      return Promise.resolve()
    },
  }
  Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext })

  // Runs after the bridge's own allow, for each step that the browser agent asks for.
  const allow = (step: AgentAction) => {
    if (step.confirm || step.component === "button" || GUARDED.includes(step.label ?? "")) {
      say(`registerTools allow refused ${step.action} on ${step.label}.`)
      return false
    }
    const key = keyOf(step.label)
    if (key) {
      byTool.add(key)
      glow(key, "act")
    }
    return true
  }

  const register = () => {
    unregister = registerTools(context.agent, { allow })
    say(`registerTools put ${[...tools.keys()].join(", ")} on document.modelContext.`)
  }
  const unregisterAll = () => {
    const count = tools.size
    unregister?.()
    unregister = null
    clearGlow()
    say(`The cleanup aborted ${count} tool signals. document.modelContext holds ${tools.size} tools.`)
  }

  const report = (key: string, source: string | undefined, text: string) => {
    const tool = byTool.delete(key) && source === "agent"
    const who = tool ? "Browser agent" : source === "agent" ? "Page agent" : "You"
    if (!tool) device(key).removeAttribute("data-glow")
    device(key).setAttribute("data-via", tool ? "tool" : source === "agent" ? "agent" : "person")
    say(`${who} set ${labelOf[key]} to ${text}${tool ? " through the WebMCP act tool" : ""}.`)
    draw()
  }

  for (const el of root.querySelectorAll<HTMLElement>("ui-switch[data-control]")) {
    const key = el.dataset.control!
    el.addEventListener("checkedchange", (event) => {
      const { value, source } = (event as CustomEvent<{ value: boolean; source?: string }>).detail
      if (key === "webmcp") return value ? register() : unregisterAll()
      state[key] = value
      const s = switches.find((d) => d.key === key)!
      report(key, source, value ? s.on : s.off)
    })
  }
  for (const el of root.querySelectorAll<HTMLElement>("ui-slider[data-control]")) {
    const key = el.dataset.control!
    el.addEventListener("valuechange", (event) => {
      const { value, source } = (event as CustomEvent<{ value: number; source?: string }>).detail
      state[key] = value
      report(key, source, `${value}${sliders.find((d) => d.key === key)!.unit}`)
    })
  }

  const call = async (request: Request) => {
    const line = document.createElement("li")
    log.prepend(line)
    while (log.children.length > 5) log.lastElementChild!.remove()
    const tool = tools.get(request.tool)
    if (!tool) {
      line.textContent = `${request.label}: no ${request.tool} tool.`
      say(`${request.label}: document.modelContext has no ${request.tool} tool.`)
      return
    }
    clearGlow()
    line.textContent = `${request.label}: ${request.tool} is running.`
    const result = (await tool.execute(request.input, {})) as
      | { ok: boolean; steps: unknown[]; error?: { message: string } }
      | { label?: string; offPage?: boolean }[]
    // A step that set a device to the value it had fired no change: it did not change that device.
    for (const key of byTool) device(key).removeAttribute("data-glow")
    byTool.clear()
    if (Array.isArray(result)) {
      const seen = result.filter((entry) => !entry.offPage)
      for (const entry of seen) {
        const key = keyOf(entry.label)
        if (key) glow(key, "read")
      }
      line.textContent = `${request.label}: snapshot read ${seen.length} components.`
      say(`Browser agent read ${seen.length} components with the WebMCP snapshot tool.`)
    } else {
      line.textContent = result.ok
        ? `${request.label}: act ran ${result.steps.length} steps.`
        : `${request.label}: act stopped. ${result.error?.message ?? ""}`
    }
  }
  for (const el of root.querySelectorAll<HTMLElement>("ui-button[data-request]")) {
    const request = requests.find((r) => r.id === el.dataset.request)!
    el.addEventListener("action", () => void call(request))
  }

  draw()
  register()
  setTimeout(() => root.isConnected && tools.size && void call(requests.find((r) => r.id === "read")!), 40)
}

const ui: UI = {
  id: "F06",
  request:
    "Build a smart home floor plan whose devices an agent in the browser reaches through WebMCP tools registered on a mock document.modelContext, and make each device glow when a tool reads or changes it.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Kitchen lights", action: "setChecked", args: [false] },
      { ref: "Evening scene", action: "press" },
    ],
    // The press returns before the tool's act runs, and each later step of the scene waits a timer.
    // So done reads only the scene's first step, which lands in the same microtask run.
    done: (root) => {
      const device = (key: string) => root.querySelector(`[data-device="${key}"]`)!
      return (
        device("kitchen").getAttribute("data-on") === "false" &&
        device("kitchen").getAttribute("data-via") === "agent" &&
        device("lamp").getAttribute("data-on") === "true" &&
        device("lamp").getAttribute("data-via") === "tool"
      )
    },
  },
}

export default ui
