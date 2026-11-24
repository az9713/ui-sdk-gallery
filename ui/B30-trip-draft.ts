import { area, contours, curveMonotoneX, format, geoPath, line, scaleLinear, select } from "d3"
import {
  type ChangeDetails,
  type CommitDetails,
  createChange,
  createCommit,
  createSessionStorage,
  definePrimitive,
} from "@ui-sdk/core"
import { createParts, wrappedChild } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import type { UI } from "../src/ui"

// "step-key", "enter-key" and "blur" are not in the shared vocabulary: each one ends a step of the draft.
type Reason = "input" | "step-key" | "enter-key" | "blur" | "imperative"
type Draft = Record<string, string>
type Options = {
  value?: Draft
  defaultValue?: Draft
  onValueChange?: (value: Draft, details: ChangeDetails<Reason>) => void
  onValueCommit?: (value: Draft, details: CommitDetails<Reason>) => void
}
// value follows each keystroke. saved is the draft as it was at the last commit.
type State = { value: Draft; saved: Draft }
type Spec = { label: string; min?: number; max?: number; step?: number }

const FIELDS: Record<string, Spec> = {
  name: { label: "Trail name" },
  distance: { label: "Distance (km)", min: 1, max: 60, step: 1 },
  climb: { label: "Climb (m)", min: 0, max: 3000, step: 50 },
  start: { label: "Trailhead (m)", min: 0, max: 3000, step: 10 },
}
const FRESH: Draft = { name: "Eagle Ridge loop", distance: "14", climb: "850", start: "420" }
const STORAGE_KEY = "b30-trip-draft"

// What a field holds after a step ends: a number is rounded and kept inside its range, and an empty or invalid entry goes back to the fallback.
function clean(key: string, raw: string, fallback: string) {
  const { min = 0, max = 0 } = FIELDS[key]
  if (key === "name") return raw.trim() || fallback
  const n = Number(raw)
  if (raw.trim() === "" || !Number.isFinite(n)) return fallback
  return String(Math.min(max, Math.max(min, Math.round(n))))
}

const tripDraft = definePrimitive({
  name: "trip-draft",
  options: { value: "value", defaultValue: "value", onValueChange: "callback", onValueCommit: "callback" },
  controlled: ["value"],
  commits: ["value"],
  state: (options: Options): State => {
    const value = options.value ?? options.defaultValue ?? FRESH
    return { value, saved: value }
  },
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const commit = createCommit(context)

    const edit = (key: string, raw: string, event?: Event) =>
      change("value", { ...store.get().value, [key]: raw }, { reason: event ? "input" : "imperative", event })

    // A step ends here: the field is cleaned, and the draft is reported as committed once.
    const finish = (key: string, reason: Reason, event?: Event) => {
      const { value, saved } = store.get()
      const next = clean(key, value[key] ?? "", saved[key])
      if (next !== value[key]) change("value", { ...value, [key]: next }, { reason, event })
      const settled = store.get().value
      if (settled[key] === saved[key]) return false
      store.set({ saved: { ...saved, [key]: settled[key] } })
      commit("value", settled, { reason, event })
      return true
    }

    // Each arrow-key step saves at once.
    const step = (key: string, count: number, event: Event) => {
      const { value, saved } = store.get()
      const now = Number(value[key])
      const from = Number.isFinite(now) && value[key] !== "" ? now : Number(saved[key])
      const { step: size = 1 } = FIELDS[key]
      change("value", { ...value, [key]: String(from + count * size) }, { reason: "step-key", event })
      finish(key, "step-key", event)
    }

    const known = (field: string) => {
      if (!(field in FIELDS)) throw new Error(`No field "${field}". Fields: ${Object.keys(FIELDS).join(", ")}.`)
      return field
    }

    return {
      edit,
      finish,
      step,
      setField: (field: string, raw: string | number) => {
        const key = known(field)
        const text = String(raw)
        if (key !== "name" && !Number.isFinite(Number(text))) throw new Error(`${FIELDS[key].label} takes a number, not "${text}".`)
        edit(key, text)
        finish(key, "imperative")
        return store.get().value[key]
      },
      reset: () => {
        change("value", { ...FRESH }, { reason: "imperative" })
        store.set({ saved: store.get().value })
        commit("value", store.get().value, { reason: "imperative" })
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({
        "data-dirty": Object.keys(FIELDS).some((key) => state.value[key] !== state.saved[key]) ? "" : undefined,
      }),
    }),
    // The slot is named like a native input, so a test can write <field /> for it.
    field: slot<{ value: string }>({
      focus: "native",
      props: { value: "string" },
      attrs: (state, { key }) => {
        const { min, max, step } = FIELDS[key] ?? {}
        return {
          // A string type makes mount render an <input>. A web part already holds one.
          type: key === "name" ? "text" : "number",
          min: min === undefined ? undefined : String(min),
          max: max === undefined ? undefined : String(max),
          step: step === undefined ? undefined : String(step),
          "data-dirty": state.value[key] !== state.saved[key] ? "" : undefined,
        }
      },
      on: {
        input: (event, { api, key }) => api.edit(key, (event.target as HTMLInputElement).value, event),
        change: (event, { api, key }) => void api.finish(key, "blur", event),
        keydown: (event, { api, key }) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return
          if (event.key === "Enter") api.finish(key, "enter-key", event)
          else if (key !== "name" && ["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) {
            event.preventDefault()
            const size = event.key.startsWith("Page") ? 5 : 1
            api.step(key, event.key.endsWith("Up") ? size : -size, event)
          }
        },
      },
      // The field follows the state when a clean-up, a reset or an agent changes the value.
      bind: (el, { key, store }) => {
        const input = el as HTMLInputElement
        const show = () => {
          const next = store.get().value[key] ?? ""
          if (input.value !== next) input.value = next
        }
        show()
        return store.subscribe(show)
      },
    }),
  }),
  agent: { actions: ["setField", "reset"] },
})

const readDraft = (el: HTMLElement): Draft | undefined => {
  try {
    return JSON.parse(el.dataset.draft ?? "null") ?? undefined
  } catch {
    return undefined
  }
}

createParts(tripDraft, {
  root: {
    tag: "b30-trip",
    display: "block",
    api: ["setField", "reset"],
    options: (el) => ({ defaultValue: readDraft(el) }),
  },
  field: { tag: "b30-trip-field", target: wrappedChild("input"), display: "block" },
})

// A saved draft is only trusted field by field: each value goes through the same clean-up as a commit.
function parse(raw: string | null): Draft | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as Record<string, unknown>
    const draft = { ...FRESH }
    for (const key of Object.keys(FIELDS)) if (typeof data[key] === "string") draft[key] = clean(key, data[key] as string, FRESH[key])
    return draft
  } catch {
    return null
  }
}

const describe = (draft: Draft) => `${draft.name}, ${draft.distance} km, ${draft.climb} m climb`

// The elevation profile: a fixed set of hills, scaled by the 3 numbers of the form.
const HILLS = [
  { at: 0.12, height: 0.5, width: 0.1 },
  { at: 0.36, height: 0.3, width: 0.07 },
  { at: 0.64, height: 1, width: 0.12 },
  { at: 0.88, height: 0.42, width: 0.07 },
]
const POINTS = 72
const W = 640
const H = 240

function profile(draft: Draft) {
  const km = Number(draft.distance)
  const climb = Number(draft.climb)
  const start = Number(draft.start)
  const raw = Array.from({ length: POINTS }, (_, i) => {
    const t = i / (POINTS - 1)
    return 0.08 * t + HILLS.reduce((sum, h) => sum + h.height * Math.exp(-(((t - h.at) / h.width) ** 2)), 0)
  })
  const low = Math.min(...raw)
  const span = Math.max(...raw) - low
  return raw.map((r, i) => ({ km: (km * i) / (POINTS - 1), m: start + (climb * (r - low)) / span }))
}

// Seeded, so the contour lines are the same on each run.
function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function contourPaths() {
  const cols = 64
  const rows = 24
  const rand = seeded(30)
  const hills = Array.from({ length: 7 }, () => ({ x: rand() * cols, y: rand() * rows, r: 5 + rand() * 9, h: 0.4 + rand() * 0.6 }))
  const grid = Array.from({ length: cols * rows }, (_, i) => {
    const x = i % cols
    const y = Math.floor(i / cols)
    return hills.reduce((sum, h) => sum + h.h * Math.exp(-((x - h.x) ** 2 + (y - h.y) ** 2) / (2 * h.r ** 2)), 0)
  })
  const thresholds = Array.from({ length: 11 }, (_, i) => 0.08 + i * 0.12)
  const path = geoPath()
  return contours().size([cols, rows]).thresholds(thresholds)(grid).map((shape) => path(shape) ?? "")
}

const thousands = format(",")

function drawProfile(root: HTMLElement, draft: Draft) {
  const points = profile(draft)
  const km = Number(draft.distance)
  const top = Math.max(1000, Math.ceil((Number(draft.start) + Number(draft.climb)) / 500) * 500)
  // The horizontal scale grows in steps of 10 km, so a longer trail takes more of the width.
  const x = scaleLinear().domain([0, Math.max(20, Math.ceil(km / 10) * 10)]).range([0, W])
  const y = scaleLinear().domain([0, top]).range([H, 0])
  const fill = area<{ km: number; m: number }>().x((d) => x(d.km)).y0(H).y1((d) => y(d.m)).curve(curveMonotoneX)
  const edge = line<{ km: number; m: number }>().x((d) => x(d.km)).y((d) => y(d.m)).curve(curveMonotoneX)
  const high = points.reduce((a, b) => (b.m > a.m ? b : a))

  const svg = select(root.querySelector("svg")!)
  svg.select("[data-area]").attr("d", fill(points))
  svg.select("[data-edge]").attr("d", edge(points))
  svg.select("[data-start]").attr("cx", x(0)).attr("cy", y(points[0].m))
  svg.select("[data-peak]").attr("cx", x(high.km)).attr("cy", y(high.m))
  svg.select("[data-end]").attr("cx", x(km)).attr("cy", y(points.at(-1)!.m))

  const label = (cls: string, text: string, side: string, pos: number) =>
    `<span ${cls} style="${side}: ${pos}%">${text}</span>`
  root.querySelector("[data-yaxis]")!.innerHTML = y
    .ticks(4)
    .map((m) => label("data-ylabel", `${thousands(m)} m`, "top", (y(m) / H) * 100))
    .join("")
  root.querySelector("[data-xaxis]")!.innerHTML = x
    .ticks(4)
    .map((d) => label("data-xlabel", `${d} km`, "left", (x(d) / W) * 100))
    .join("")
  root.querySelector("[data-title]")!.textContent = draft.name
  root.querySelector("[data-summary]")!.textContent =
    `${draft.distance} km, trailhead ${thousands(Number(draft.start))} m, high point ${thousands(Math.round(high.m))} m.`
}

const html = (draft: Draft) => `
<h2>Hike planner</h2>
<b30-trip aria-label="Trip draft" data-draft="${JSON.stringify(draft).replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">
  ${Object.entries(FIELDS)
    .map(
      ([key, { label }]) => `<label data-field="${key}"><span>${label}</span>
    <b30-trip-field value="${key}"><input aria-label="${label}" /></b30-trip-field></label>`,
    )
    .join("")}
</b30-trip>
<div data-actions>
  <ui-button data-plan><button>Plan trip</button></ui-button>
  <ui-button data-discard><button>Discard draft</button></ui-button>
</div>
<p role="status" data-status>No draft is saved.</p>
<figure data-map>
  <figcaption><strong data-title></strong><span data-summary></span></figcaption>
  <div data-plot>
    <div data-canvas>
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">
        <g data-contours transform="scale(${W / 64} ${H / 24})"></g>
        <path data-area></path>
        <path data-edge></path>
        <circle data-start r="5"></circle>
        <circle data-peak r="5"></circle>
        <circle data-end r="5"></circle>
      </svg>
      <div data-yaxis></div>
      <div data-xaxis></div>
    </div>
  </div>
</figure>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 44rem; }
[data-stage] h2, [data-stage] p, [data-stage] figure { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] b30-trip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
[data-stage] [data-field] { display: grid; gap: 4px; font-size: 0.8125rem; }
[data-stage] [data-field] span { color: var(--ui-muted-foreground); }
[data-stage] b30-trip-field input {
  box-sizing: border-box; width: 100%; height: calc(var(--ui-spacing) * 9); padding: 0 10px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); font: inherit;
}
[data-stage] b30-trip-field input:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b30-trip-field input[data-dirty] { border-style: dashed; border-color: var(--ui-foreground); }
[data-stage] [data-actions] { display: flex; gap: 12px; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
[data-stage] [data-map] {
  display: grid; gap: 12px; padding: 14px 14px 12px; background: #efe6cf; color: #3a2f1c;
  border: 1px solid #8a6d3b; border-radius: var(--ui-radius);
}
[data-stage] [data-map] figcaption { display: grid; gap: 2px; }
[data-stage] [data-map] [data-summary] { font-size: 0.8125rem; color: #5c4f3a; }
[data-stage] [data-plot] { padding: 0 18px 22px 52px; }
[data-stage] [data-canvas] { position: relative; }
[data-stage] [data-canvas] svg { display: block; width: 100%; height: auto; }
[data-stage] [data-contours] path { fill: none; stroke: #c4a977; stroke-width: 1; vector-effect: non-scaling-stroke; }
[data-stage] [data-contours] path[data-index] { stroke: #8a6d3b; stroke-width: 1.5; }
[data-stage] [data-area] { fill: #6f9a68; fill-opacity: 0.9; }
[data-stage] [data-edge] { fill: none; stroke: #2c5232; stroke-width: 2.5; stroke-linejoin: round; }
[data-stage] [data-start] { fill: #efe6cf; stroke: #2c5232; stroke-width: 2.5; }
[data-stage] [data-end] { fill: #2c5232; stroke: #efe6cf; stroke-width: 2; }
[data-stage] [data-peak] { fill: #b4452f; stroke: #efe6cf; stroke-width: 2; }
[data-stage] [data-ylabel], [data-stage] [data-xlabel] {
  position: absolute; font-size: 0.75rem; color: #5c4f3a; font-variant-numeric: tabular-nums; white-space: nowrap;
}
[data-stage] [data-ylabel] { right: 100%; padding-right: 8px; transform: translateY(-50%); }
[data-stage] [data-xlabel] { top: 100%; padding-top: 6px; transform: translateX(-50%); }
[data-stage] [data-xlabel]:first-child { transform: none; }
`

function mount(root: HTMLElement) {
  const storage = createSessionStorage(STORAGE_KEY)
  const restored = parse(storage.get())
  let draft = restored ?? { ...FRESH }
  root.innerHTML = html(draft)

  const status = root.querySelector("[data-status]")!
  const trip = root.querySelector("b30-trip") as HTMLElement & { api: { reset: () => void } }
  const say = (text: string) => (status.textContent = text)
  const paths = contourPaths()
  select(root.querySelector("[data-contours]")!)
    .selectAll("path")
    .data(paths)
    .join("path")
    .attr("d", (d) => d)
    .attr("data-index", (_, i) => (i % 3 === 0 ? "" : null))
  drawProfile(root, draft)
  if (restored) say(`Draft restored: ${describe(draft)}.`)
  else if (!storage.available()) say("Session storage is blocked: the draft is not kept.")

  trip.addEventListener("valuechange", (event) => {
    const detail = (event as CustomEvent<{ value: Draft; reason: Reason }>).detail
    draft = detail.value
    drawProfile(root, detail.value)
    if (detail.reason === "input") say("Editing: the draft is saved when you leave the field or press Enter.")
  })
  trip.addEventListener("valuecommit", (event) => {
    draft = (event as CustomEvent<{ value: Draft }>).detail.value
    const kept = storage.set(JSON.stringify(draft))
    say(kept ? `Draft saved: ${describe(draft)}.` : "The draft is not kept: session storage is blocked.")
  })
  root.querySelector("[data-plan]")!.addEventListener("action", () => {
    const cleared = storage.remove()
    say(cleared ? `Planned: ${describe(draft)}.` : `Planned: ${describe(draft)}. The draft stays in session storage.`)
  })
  root.querySelector("[data-discard]")!.addEventListener("action", () => {
    trip.api.reset()
    storage.remove()
    say("Draft discarded.")
  })
}

const ui: UI = {
  id: "B30",
  request:
    "Build a hike planner form with a trail name, a distance, a climb and a trailhead height. Keep the draft in session storage so that it survives a reload, save it when a person finishes a step (leaves a field, presses Enter or an arrow key), and redraw an elevation profile from the numbers.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Trip draft", action: "setField", args: ["name", "Ridge traverse"] },
      { ref: "Trip draft", action: "setField", args: ["distance", 22] },
      { ref: "Trip draft", action: "setField", args: ["climb", 1400] },
      { ref: "Plan trip", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Planned: Ridge traverse, 22 km, 1400 m climb.",
  },
  breaks: [
    {
      broke: "Enter no longer ends the step of a field.",
      find: 'if (event.key === "Enter") api.finish(key, "enter-key", event)',
      replace: 'if (event.key === "Enter") void 0',
      caught: "keyboard: typing changes the draft and commits nothing until Enter or a change event ends the step",
    },
    {
      broke: "Each keystroke commits the draft.",
      find: "input: (event, { api, key }) => api.edit(key, (event.target as HTMLInputElement).value, event),",
      replace: "input: (event, { api, key }) => (api.edit(key, (event.target as HTMLInputElement).value, event), api.finish(key, \"blur\", event)),",
      caught: "keyboard: typing changes the draft and commits nothing until Enter or a change event ends the step",
    },
    {
      broke: "An arrow-key step changes the value and does not commit.",
      find: 'finish(key, "step-key", event)',
      replace: "void 0",
      caught: "keyboard: ArrowUp and ArrowDown step a number and commit each step, and PageUp steps by 5",
    },
    {
      broke: "A number is no longer kept inside its range.",
      find: "String(Math.min(max, Math.max(min, Math.round(n))))",
      replace: "String(Math.round(n))",
      caught: "keyboard: a number is rounded and kept in its range, and an empty entry returns to the saved value",
    },
    {
      broke: "An agent can set a field that does not exist.",
      find: 'if (!(field in FIELDS)) throw new Error(`No field "${field}". Fields: ${Object.keys(FIELDS).join(", ")}.`)',
      replace: "",
      caught: "agent: setField commits through the api, refuses an unknown field and text that is not a number",
    },
    {
      broke: "The page ignores the saved draft on mount.",
      find: "const restored = parse(storage.get())",
      replace: "const restored = null",
      caught: "keyboard: after a reload the page shows the saved draft, and Plan trip clears it",
    },
    {
      broke: "A commit is not written to session storage.",
      find: "const kept = storage.set(JSON.stringify(draft))",
      replace: "const kept = true",
      caught: "keyboard: a committed step is written to session storage, and a typed value is not",
    },
    {
      broke: "Plan trip leaves the draft in session storage.",
      find: "const cleared = storage.remove()",
      replace: "const cleared = true",
      caught: "keyboard: after a reload the page shows the saved draft, and Plan trip clears it",
    },
    {
      broke: "The profile does not follow the form.",
      find: "drawProfile(root, detail.value)",
      replace: "void 0",
      caught: "agent: the elevation profile is redrawn from the values that an agent sets",
    },
  ],
}

export { tripDraft }
export default ui
