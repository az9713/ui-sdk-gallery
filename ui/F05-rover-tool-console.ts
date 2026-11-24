import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/radio"
import "@ui-sdk/web/select"
import "@ui-sdk/web/tabs"
import "@ui-sdk/web/textarea"
import { agentTools } from "@ui-sdk/web/agent"
import type { AgentStep } from "@ui-sdk/web/agent"
import type { Context, UI } from "../src/ui"

const COLS = 8
const ROWS = 6
const CELL = 48
const W = COLS * CELL
const H = ROWS * CELL
const LETTERS = "ABCDEFGH"
const START = { col: 2, row: 3, heading: "north" }

const headings = [
  { value: "north", label: "North", dc: 0, dr: -1, angle: 0 },
  { value: "east", label: "East", dc: 1, dr: 0, angle: 90 },
  { value: "south", label: "South", dc: 0, dr: 1, angle: 180 },
  { value: "west", label: "West", dc: -1, dr: 0, angle: 270 },
] as const
const distances = [
  { value: "1", label: "1 cell" },
  { value: "2", label: "2 cells" },
  { value: "3", label: "3 cells" },
] as const

const STEPS: AgentStep[] = [
  { ref: "Heading", action: "setValue", args: ["East"] },
  { ref: "Distance", action: "setValue", args: ["3"] },
  { ref: "Drive", action: "press" },
  { ref: "Drill core sample", action: "press" },
]
const EXAMPLES: Record<string, unknown> = {
  snapshot: {},
  act: { steps: STEPS.slice(0, 3) },
  query: { within: "Heading" },
}

const cellName = (col: number, row: number) => `${LETTERS[col]}${row + 1}`
const center = (n: number) => n * CELL + CELL / 2

const signature = (tool: (typeof agentTools)[number]) => {
  const required: string[] = (tool.inputSchema as { required?: string[] }).required ?? []
  const params = Object.keys(tool.inputSchema.properties).map((p) => (required.includes(p) ? p : `${p}?`))
  return `${tool.name}(${params.join(", ")})`
}

// Steps in the textarea: one per line, so a person can edit each one.
const pretty = (input: unknown) => {
  const steps = (input as { steps?: unknown[] }).steps
  if (!steps) return JSON.stringify(input)
  return `{ "steps": [\n${steps.map((s) => `  ${JSON.stringify(s)}`).join(",\n")}\n] }`
}

// Seeded so the terrain is the same in each screenshot.
function terrain() {
  let seed = 412
  const next = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const shades = ["#1d1203", "#251704", "#2e1d06", "#382407"]
  const cells: string[] = []
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++)
      cells.push(`<rect x="${col * CELL}" y="${row * CELL}" width="${CELL}" height="${CELL}" fill="${shades[Math.floor(next() * shades.length)]}"/>`)
  const craters = Array.from({ length: 7 }, () => {
    const r = Math.max(0, 6 + next() * 10)
    return `<circle cx="${(next() * W).toFixed(1)}" cy="${(next() * H).toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="#7a5214" stroke-width="1.5"/>`
  })
  const rocks = Array.from({ length: 14 }, () => {
    const r = Math.max(0, 1.5 + next() * 2.5)
    return `<circle cx="${(next() * W).toFixed(1)}" cy="${(next() * H).toFixed(1)}" r="${r.toFixed(1)}" fill="#5c3d0e"/>`
  })
  const lines = [
    ...Array.from({ length: COLS + 1 }, (_, i) => `M${i * CELL} 0V${H}`),
    ...Array.from({ length: ROWS + 1 }, (_, i) => `M0 ${i * CELL}H${W}`),
  ].join("")
  return `${cells.join("")}${craters.join("")}${rocks.join("")}<path d="${lines}" stroke="#ffb000" stroke-opacity="0.28" stroke-width="1"/>`
}

const scene = () => `
<svg data-terrain viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">
  <defs>
    <pattern id="f05-scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="#000" fill-opacity="0.22"/></pattern>
    <filter id="f05-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  ${terrain()}
  <rect x="${START.col * CELL + 6}" y="${START.row * CELL + 6}" width="${CELL - 12}" height="${CELL - 12}" fill="none" stroke="#e0a040" stroke-dasharray="4 4"/>
  <polyline data-trail fill="none" stroke="#ffb000" stroke-width="2" stroke-dasharray="6 5" stroke-linecap="round"/>
  <g data-samples stroke="#ffd27a" stroke-width="2.5" stroke-linecap="round"></g>
  <g data-rover filter="url(#f05-glow)">
    <rect x="-15" y="-12" width="5" height="7" fill="#ffb000"/><rect x="10" y="-12" width="5" height="7" fill="#ffb000"/>
    <rect x="-15" y="-3.5" width="5" height="7" fill="#ffb000"/><rect x="10" y="-3.5" width="5" height="7" fill="#ffb000"/>
    <rect x="-15" y="5" width="5" height="7" fill="#ffb000"/><rect x="10" y="5" width="5" height="7" fill="#ffb000"/>
    <rect x="-9" y="-12" width="18" height="24" rx="3" fill="#140c02" stroke="#ffb000" stroke-width="2"/>
    <path d="M0 -12V-18" stroke="#ffb000" stroke-width="2"/>
    <circle cx="0" cy="-20" r="3.2" fill="#ffb000"/>
    <path d="M-4 4L0 -4L4 4Z" fill="#ffb000"/>
  </g>
  <rect width="${W}" height="${H}" fill="url(#f05-scan)"/>
</svg>`

const panels = () =>
  agentTools
    .map(
      (tool) => `
  <ui-tabs-panel value="${tool.name}">
    <div data-desc role="region" tabindex="0" aria-label="${tool.name} description"><p>${tool.description.replace(/</g, "&lt;")}</p></div>
    <pre data-schema role="region" tabindex="0" aria-label="${tool.name} input schema">${JSON.stringify(tool.inputSchema, null, 2)}</pre>
  </ui-tabs-panel>`,
    )
    .join("")

const html = () => `
<div data-crt>
  <header data-head>
    <h2>Rover Kestrel command console</h2>
    <p>Sol 412, Jezero grid J-7. No model is connected: you type each tool call, and the page bridge runs it.</p>
  </header>
  <div data-panes>
    <section data-rover-pane aria-labelledby="f05-map-title">
      <h2 id="f05-map-title">Terrain grid</h2>
      <div data-map>
        <div data-cols aria-hidden="true">${[...LETTERS].map((l) => `<span>${l}</span>`).join("")}</div>
        <div data-rows aria-hidden="true">${Array.from({ length: ROWS }, (_, i) => `<span>${i + 1}</span>`).join("")}</div>
        ${scene()}
      </div>
      <div data-controls>
        <ui-field>
          <ui-field-label>Heading</ui-field-label>
          <ui-select default-value="${START.heading}">
            <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
            <ui-select-content>
              ${headings.map((h) => `<ui-select-item value="${h.value}">${h.label}</ui-select-item>`).join("")}
            </ui-select-content>
          </ui-select>
        </ui-field>
        <ui-field>
          <ui-field-label>Distance</ui-field-label>
          <ui-radio-group default-value="1">
            ${distances.map((d) => `<label data-slot="label"><ui-radio value="${d.value}"><ui-radio-indicator></ui-radio-indicator></ui-radio>${d.label}</label>`).join("")}
          </ui-radio-group>
        </ui-field>
        <div data-buttons>
          <ui-button data-drive><button>Drive</button></ui-button>
          <ui-button data-drill data-agent-confirm="Drills a core sample"><button>Drill core sample</button></ui-button>
        </div>
      </div>
      <p role="status" data-status></p>
    </section>
    <section data-console aria-labelledby="f05-console-title" data-agent-hidden>
      <h2 id="f05-console-title">Tool console</h2>
      <ui-tabs default-value="act">
        <ui-tabs-list aria-label="Tool schemas">
          ${agentTools.map((tool) => `<ui-tabs-tab value="${tool.name}"><button type="button">${signature(tool)}</button></ui-tabs-tab>`).join("")}
        </ui-tabs-list>
        ${panels()}
      </ui-tabs>
      <ui-field>
        <ui-field-label>Tool input (JSON)</ui-field-label>
        <ui-textarea><textarea rows="5" spellcheck="false"></textarea></ui-textarea>
      </ui-field>
      <ui-button data-run><button>Run <span data-run-name>act</span></button></ui-button>
      <p role="status" data-console-status>Ready. No call has run.</p>
      <pre data-output role="region" tabindex="0" aria-label="Tool output">&gt; awaiting a tool call</pre>
    </section>
  </div>
</div>`

const MONO = `ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace`

const css = `
[data-stage] [data-crt] {
  --ui-background: #140c02;
  --ui-foreground: #ffb000;
  --ui-muted: #2a1a05;
  --ui-muted-foreground: #e0a040;
  --ui-border: #5c3d0e;
  --ui-input: #b37a1f;
  --ui-primary: #ffb000;
  --ui-primary-foreground: #140c02;
  --ui-ring: #ffd27a;
  --ui-ring-border: #ffd27a;
  --ui-radius: 2px;
  --ui-font-sans: ${MONO};
  --ui-font-mono: ${MONO};
  display: grid; gap: 20px; max-width: 1120px; padding: 24px;
  border: 1px solid #5c3d0e; border-radius: 14px;
  background: #140c02; color: #ffb000; font-family: ${MONO};
  box-shadow: inset 0 0 90px rgb(0 0 0 / 0.6);
}
[data-stage] h2 { margin: 0; font-size: 1.125rem; font-weight: 600; }
[data-stage] [data-head] { display: grid; gap: 6px; }
[data-stage] p, [data-stage] pre { margin: 0; }
[data-stage] [data-head] p { color: #e0a040; max-width: 60ch; font-size: 0.875rem; }
[data-stage] [data-panes] { display: flex; flex-wrap: wrap; gap: 28px; align-items: start; }
[data-stage] [data-rover-pane] { display: grid; gap: 16px; width: 420px; }
[data-stage] [data-console] { display: grid; gap: 14px; flex: 1 1 460px; min-width: 0; }
[data-stage] [data-map] { display: grid; grid-template-columns: 22px ${W}px; grid-template-rows: 22px ${H}px; gap: 4px; }
[data-stage] [data-cols] { grid-column: 2; display: grid; grid-template-columns: repeat(${COLS}, 1fr); }
[data-stage] [data-rows] { grid-column: 1; grid-row: 2; display: grid; grid-template-rows: repeat(${ROWS}, 1fr); }
[data-stage] [data-cols] span, [data-stage] [data-rows] span { display: grid; place-items: center; color: #e0a040; font-size: 0.8125rem; }
[data-stage] [data-terrain] { grid-column: 2; grid-row: 2; display: block; width: ${W}px; height: ${H}px; border: 1px solid #5c3d0e; }
[data-stage] [data-rover] { transform-box: view-box; }
@media (prefers-reduced-motion: no-preference) {
  [data-stage] [data-rover][data-moving] { transition: transform 0.6s ease-in-out; }
}
[data-stage] [data-controls] { display: grid; gap: 16px; }
[data-stage] ui-radio-group { display: flex; flex-wrap: wrap; gap: 8px 18px; }
[data-stage] [data-buttons] { display: flex; flex-wrap: wrap; gap: 12px; }
[data-stage] [data-status] { max-width: 60ch; }
[data-stage] [data-desc] { max-height: calc(6lh + 8px); overflow: auto; max-width: 60ch; padding: 8px 0 0; font-size: 0.875rem; line-height: 1.5; color: #ffc94d; }
[data-stage] [data-schema] { max-height: calc(9lh + 8px); overflow: auto; padding: 8px 12px 0; box-shadow: inset 0 0 0 1px #5c3d0e; font: 0.8125rem/1.5 ${MONO}; }
[data-stage] [data-schema], [data-stage] [data-output] { white-space: pre-wrap; overflow-wrap: anywhere; color: #ffb000; font: 0.8125rem/1.5 ${MONO}; }
[data-stage] [data-output] { max-height: calc(16lh + 22px); overflow: auto; padding: 10px 12px; border: 1px solid #5c3d0e; background: #0d0801; }
[data-stage] textarea { font-family: ${MONO}; font-size: 0.8125rem; }
[data-stage] [data-run] button { justify-self: start; }
[data-stage] [data-console-status] { color: #ffc94d; max-width: 60ch; }
`

function mount(root: HTMLElement, context: Context) {
  root.innerHTML = html()
  const rover = { ...START, heading: START.heading as string, edge: false, samples: [] as string[], trail: [[START.col, START.row]] }
  let distance = 1
  let tool = "act"

  const status = root.querySelector("[data-status]")!
  const svg = root.querySelector<SVGSVGElement>("[data-terrain]")!
  const body = svg.querySelector<SVGGElement>("[data-rover]")!
  const trail = svg.querySelector("[data-trail]")!
  const marks = svg.querySelector("[data-samples]")!
  const input = root.querySelector<HTMLTextAreaElement>("ui-textarea textarea")!
  const runName = root.querySelector("[data-run-name]")!
  const consoleStatus = root.querySelector("[data-console-status]")!
  const output = root.querySelector("[data-output]")!

  const headingOf = () => headings.find((h) => h.value === rover.heading)!
  const draw = () => {
    body.style.transform = `translate(${center(rover.col)}px, ${center(rover.row)}px) rotate(${headingOf().angle}deg)`
    trail.setAttribute("points", rover.trail.map(([c, r]) => `${center(c)},${center(r)}`).join(" "))
    marks.innerHTML = rover.samples
      .map((name) => {
        const x = center(LETTERS.indexOf(name[0])) + 14
        const y = center(Number(name.slice(1)) - 1) + 14
        return `<path d="M${x - 4} ${y - 4}L${x + 4} ${y + 4}M${x + 4} ${y - 4}L${x - 4} ${y + 4}"/>`
      })
      .join("")
    svg.dataset.cell = cellName(rover.col, rover.row)
    const edge = rover.edge ? " Stopped at the grid edge." : ""
    const samples = rover.samples.length ? `Core samples: ${rover.samples.join(", ")}.` : "No core sample."
    status.textContent = `Rover at ${cellName(rover.col, rover.row)}, heading ${headingOf().label}.${edge} ${samples}`
  }
  const move = () => {
    body.setAttribute("data-moving", "")
    draw()
  }

  root.querySelector("ui-select")!.addEventListener("valuechange", (e) => {
    rover.heading = (e as CustomEvent<{ value: string }>).detail.value
    move()
  })
  root.querySelector("ui-radio-group")!.addEventListener("valuechange", (e) => {
    distance = Number((e as CustomEvent<{ value: string }>).detail.value)
  })
  root.querySelector("[data-drive]")!.addEventListener("action", () => {
    const { dc, dr } = headingOf()
    let moved = 0
    while (moved < distance) {
      const col = rover.col + dc
      const row = rover.row + dr
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) break
      rover.col = col
      rover.row = row
      moved += 1
    }
    rover.edge = moved < distance
    if (moved) rover.trail.push([rover.col, rover.row])
    move()
  })
  root.querySelector("[data-drill]")!.addEventListener("action", () => {
    const here = cellName(rover.col, rover.row)
    if (!rover.samples.includes(here)) rover.samples.push(here)
    draw()
  })

  root.querySelector("ui-tabs")!.addEventListener("valuechange", (e) => {
    tool = (e as CustomEvent<{ value: string }>).detail.value
    runName.textContent = tool
    input.value = pretty(EXAMPLES[tool])
  })

  const summary = (name: string, result: unknown) => {
    if (name === "act") {
      const r = result as Awaited<ReturnType<Context["agent"]["act"]>>
      return r.ok ? `act: ok, ${r.steps.length} steps ran.` : `act: step ${(r.error?.step ?? 0) + 1} failed. ${r.error?.message ?? ""}`
    }
    if (!Array.isArray(result)) return `${name}: ${String((result as { error?: unknown }).error)}`
    const list = result as unknown[]
    return `${name}: ${list.length} ${list.length === 1 ? "component" : "components"}.`
  }
  const call = (name: string, args: unknown) =>
    name === "snapshot" ? context.agent.snapshot() : name === "act" ? context.agent.act(args as never) : context.agent.query(args as never)

  root.querySelector("[data-run]")!.addEventListener("action", (e) => {
    const text = input.value.trim()
    let args: unknown = {}
    try {
      if (text) args = JSON.parse(text)
    } catch (error) {
      consoleStatus.textContent = `Input is not JSON. Nothing ran. ${(error as Error).message}`
      return
    }
    const name = tool
    consoleStatus.textContent = `${name}: running.`
    const done = Promise.resolve(call(name, args)).then(
      (result) => {
        output.textContent = `> ${name} ${JSON.stringify(args)}\n${JSON.stringify(result, null, 2)}`
        consoleStatus.textContent = summary(name, result)
      },
      (error: Error) => (consoleStatus.textContent = `${name}: ${error.message}`),
    )
    ;(e as CustomEvent<{ waitUntil: (p: Promise<unknown>) => void }>).detail.waitUntil(done)
  })

  input.value = pretty(EXAMPLES.act)
  draw()
}

const ui: UI = {
  id: "F05",
  request:
    "Build a Mars rover command console that shows the 3 agent tool schemas, lets a person type a snapshot, act or query call and run it on the page bridge with no model, and draws the rover on a terrain grid.",
  css,
  mount,
  task: {
    steps: STEPS,
    done: (root) => root.querySelector("[data-status]")!.textContent === "Rover at F4, heading East. Core samples: F4.",
  },
}

export default ui
