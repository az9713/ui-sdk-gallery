import { type ChangeDetails, createChange, createRovingFocus, definePrimitive } from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import { area, curveMonotoneX, line, scaleLinear } from "d3"
import type { UI } from "../src/ui"

type Reason = "item-press" | "imperative"
type Options = {
  steps?: string[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, details: ChangeDetails<Reason>) => void
}
// steps is an option that a step renders from, so the state has a copy: a part must not read an option.
// reached is the index of the furthest step a person can open.
type State = { focused: string | null; value: string; steps: string[]; reached: number }

const wizardStepper = definePrimitive({
  name: "wizard-stepper",
  options: { steps: "list", value: "string", defaultValue: "string", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => {
    const steps = options.steps ?? []
    const value = options.value ?? options.defaultValue ?? steps[0] ?? ""
    return { focused: null, value, steps, reached: Math.max(0, steps.indexOf(value)) }
  },
  sync: (options) => ({
    steps: options.steps ?? [],
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus<State, { value: string }>(context, {
      slot: "step",
      key: "focused",
      orientation: () => "horizontal",
      remember: false,
      preferred: (item) => item.key === context.store.get().value,
      claims: (state, item) => item.key === state.value,
      disabled: (item) => {
        const { steps, reached } = context.store.get()
        return steps.indexOf(item.key) > reached
      },
    })
    const goTo = (key: string, event?: Event) => {
      const { steps, reached } = context.store.get()
      const index = steps.indexOf(key)
      if (index < 0 || index > reached) return false
      return change("value", key, { reason: event ? "item-press" : "imperative", event })
    }
    const move = (by: number) => {
      const { steps, value, reached } = context.store.get()
      const index = steps.indexOf(value) + by
      if (index < 0 || index >= steps.length) return false
      const moved = change("value", steps[index], { reason: "imperative" })
      if (moved) context.store.set({ reached: Math.max(reached, index) })
      return moved
    }
    return {
      roving,
      steps: () => context.store.get().steps,
      goTo,
      next: () => move(1),
      back: () => move(-1),
    }
  },
  slots: (slot) => ({
    root: slot({ role: "group", keys: { none: "Each step handles the arrow keys." } }),
    step: slot<{ value: string }>({
      role: "button",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, part) => {
        const index = state.steps.indexOf(part.key)
        const current = state.value === part.key
        return {
          type: "button",
          tabindex: part.api.roving.tabIndex(state, part),
          "aria-current": current ? "step" : undefined,
          "aria-disabled": index > state.reached ? "true" : undefined,
          "data-current": current ? "" : undefined,
          "data-done": index < state.reached ? "" : undefined,
        }
      },
      press: ({ api, key }, event) => void api.goTo(key, event),
      on: {
        keydown: (event, { el, api }) => {
          if (el) api.roving.keydown(event, el)
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
    panel: slot<{ value: string }>({
      props: { value: "string" },
      present: (state, { key }) => state.value === key,
    }),
  }),
  agent: {
    actions: ["goTo"],
    closed: true,
    items: (api) => api.steps().map((name) => ({ value: name, label: name })),
  },
})

createParts(wizardStepper, {
  root: { tag: "b22-stepper", display: "block", api: ["goTo", "next", "back"] },
  step: { tag: "b22-step", display: "contents", target: wrappedButton },
  panel: { tag: "b22-panel", display: "block" },
})

const STEPS = ["Starter", "Dough", "Proof", "Bake"]
// The hour at which each step ends on the rise chart.
const PHASE_END = [4, 8, 12, 14]
const HOURS = 14
// The plot is the whole SVG. The axis labels are HTML beside it: axe cannot decide the contrast of text inside an SVG that holds shapes.
const W = 460
const H = 190
const PAD = 8
const x = scaleLinear([0, HOURS], [PAD * 3, W - PAD * 3])
const y = scaleLinear([0, 300], [H - PAD, PAD])
const Y_TICKS = [0, 100, 200, 300]
const X_TICKS = [0, 2, 4, 6, 8, 10, 12, 14]

// Seeded random numbers, so the chart is the same on each run.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
// Dough volume as a percent of the starting volume, every half hour. Oven spring adds volume after hour 12.
const riseData = () => {
  const random = seeded(22)
  return Array.from({ length: HOURS * 2 + 1 }, (_, i) => {
    const hour = i / 2
    const spring = hour > 12 ? 14 * (hour - 12) : 0
    return { hour, volume: 100 + 140 * (1 - Math.exp(-hour / 5)) + spring + (random() - 0.5) * 5 }
  })
}

const html = `
<div data-card>
<h2>Sourdough bake schedule, 4 steps</h2>
<b22-stepper aria-label="Bake schedule progress" steps="${STEPS}" default-value="Starter">
  <div data-steps>
    ${STEPS.map((name) => `<b22-step value="${name}"><button>${name}</button></b22-step>`).join("")}
  </div>
  <b22-panel value="Starter">
    <h3 tabindex="-1">Feed the starter</h3>
    <ui-field>
      <ui-field-label>Feed time</ui-field-label>
      <ui-input><input /></ui-input>
    </ui-field>
  </b22-panel>
  <b22-panel value="Dough">
    <h3 tabindex="-1">Mix the dough</h3>
    <ui-field>
      <ui-field-label>Mix time</ui-field-label>
      <ui-input><input /></ui-input>
    </ui-field>
  </b22-panel>
  <b22-panel value="Proof">
    <h3 tabindex="-1">Shape and proof</h3>
    <ui-field>
      <ui-field-label>Shape time</ui-field-label>
      <ui-input><input /></ui-input>
    </ui-field>
  </b22-panel>
  <b22-panel value="Bake">
    <h3 tabindex="-1">Into the oven</h3>
    <dl data-summary>
      <dt>Feed</dt><dd data-feed></dd>
      <dt>Mix</dt><dd data-mix></dd>
      <dt>Shape</dt><dd data-shape></dd>
    </dl>
  </b22-panel>
</b22-stepper>
<figure data-figure>
  <div data-plot>
    <div data-yaxis aria-hidden="true">${Y_TICKS.map((v) => `<span style="top: ${(y(v) / H) * 100}%">${v}%</span>`).join("")}</div>
    <svg data-chart role="img" viewBox="0 0 ${W} ${H}"></svg>
    <div data-xaxis aria-hidden="true">${X_TICKS.map((v) => `<span style="left: ${(x(v) / W) * 100}%">${v} h</span>`).join("")}</div>
  </div>
  <figcaption data-caption></figcaption>
</figure>
<div data-actions>
  <ui-button data-back><button>Back</button></ui-button>
  <ui-button data-next><button>Continue</button></ui-button>
  <ui-button data-place><button>Save schedule</button></ui-button>
</div>
<p role="status" data-status>Step 1 of 4: Starter.</p>
</div>`

const css = `
[data-stage] {
  display: grid; max-width: 560px;
  --ui-background: #fbf4e6; --ui-foreground: #3b2a1a; --ui-muted: #efe3c8; --ui-muted-foreground: #6b5440;
  --ui-border: #d9c7a5; --ui-input: #8f7753; --ui-primary: #8f3f14; --ui-primary-foreground: #fff8ee; --ui-ring: #8f3f14;
}
[data-stage] [data-card] {
  display: grid; gap: 20px; padding: 28px; background: var(--ui-background); color: var(--ui-foreground);
  border: 1px solid var(--ui-border); border-radius: 4px; font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
}
[data-stage] h2, [data-stage] h3, [data-stage] p, [data-stage] dl, [data-stage] dd, [data-stage] figure { margin: 0; }
[data-stage] h2 { font-size: 1.375rem; font-weight: 600; line-height: 1.2; }
[data-stage] h3 { font-size: 1.125rem; font-weight: 600; font-style: italic; }
[data-stage] h3:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 4px; border-radius: 2px; }
[data-stage] b22-stepper { display: grid; gap: 20px; }
[data-stage] [data-steps] { display: flex; flex-wrap: wrap; counter-reset: step; border-bottom: 1px solid var(--ui-border); }
[data-stage] b22-step button {
  all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px;
  padding: 10px 12px 10px 0; margin-right: 12px; border-bottom: 2px solid transparent; margin-bottom: -1px;
  counter-increment: step; cursor: pointer; font-size: 0.9375rem; color: var(--ui-foreground);
}
[data-stage] b22-step button::before {
  content: counter(step) / ""; display: grid; place-items: center; width: 24px; height: 24px; flex: none;
  border: 1px solid var(--ui-input); border-radius: 999px; font-size: 0.75rem; font-variant-numeric: tabular-nums;
}
[data-stage] b22-step button[aria-disabled="true"] { color: var(--ui-muted-foreground); cursor: default; }
[data-stage] b22-step button[data-done]::before { content: "\\2713" / ""; background: var(--ui-muted); }
[data-stage] b22-step button[data-current] { border-bottom-color: var(--ui-primary); font-weight: 600; }
[data-stage] b22-step button[data-current]::before {
  border-color: var(--ui-primary); background: var(--ui-primary); color: var(--ui-primary-foreground);
}
[data-stage] b22-step button:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; border-radius: 2px; }
[data-stage] b22-panel:not([hidden]) { display: grid; gap: 16px; justify-items: start; }
[data-stage] [data-summary] { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; }
[data-stage] [data-summary] dt { color: var(--ui-muted-foreground); }
[data-stage] [data-figure] { display: grid; gap: 6px; }
[data-stage] [data-figure] figcaption { color: var(--ui-muted-foreground); font-size: 0.8125rem; font-style: italic; }
[data-stage] [data-plot] { display: grid; grid-template-columns: 40px 1fr; gap: 6px 6px; padding-right: 12px; }
[data-stage] [data-chart] { display: block; width: 100%; height: auto; }
[data-stage] [data-yaxis], [data-stage] [data-xaxis] { position: relative; font-size: 0.6875rem; color: var(--ui-muted-foreground); }
[data-stage] [data-yaxis] span { position: absolute; right: 0; transform: translateY(-50%); }
[data-stage] [data-xaxis] { grid-column: 2; height: 1.5em; line-height: 1.5em; }
[data-stage] [data-xaxis] span { position: absolute; transform: translateX(-50%); }
[data-stage] [data-actions] { display: flex; gap: 12px; }
[data-stage] [data-actions] [hidden] { display: none; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); font-size: 0.9375rem; }
`

type Stepper = HTMLElement & { api: { next(): boolean; back(): boolean } }
type Point = { hour: number; volume: number }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const stepper = root.querySelector<Stepper>("b22-stepper")!
  const status = root.querySelector("[data-status]")!
  const chart = root.querySelector("[data-chart]")!
  const caption = root.querySelector("[data-caption]")!
  const [back, next, place] = ["back", "next", "place"].map((name) => root.querySelector<HTMLElement>(`[data-${name}]`)!)
  const field = (step: string) => root.querySelector<HTMLInputElement>(`b22-panel[value="${step}"] input`)!
  const REQUIRED: Record<string, string> = {
    Starter: "Enter the time you feed the starter.",
    Dough: "Enter the time you mix the dough.",
    Proof: "Enter the time you shape the loaf.",
  }
  const data = riseData()
  const curve = line<Point>().x((d) => x(d.hour)).y((d) => y(d.volume)).curve(curveMonotoneX)
  const fill = area<Point>().x((d) => x(d.hour)).y0(y(0)).y1((d) => y(d.volume)).curve(curveMonotoneX)
  let current = "Starter"

  // The chart shows the whole curve faintly, and the part up to the end of the current step in full.
  const draw = (end: number) => {
    const part = data.filter((d) => d.hour <= end)
    const last = part[part.length - 1]
    const volume = Math.round(last.volume)
    const grid = Y_TICKS.map((v) => `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#d9c7a5" stroke-width="1" />`)
    const marks = PHASE_END.map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="0" y2="${H}" stroke="#d9c7a5" stroke-dasharray="3 4" />`)
    chart.setAttribute("aria-label", `Dough rise chart: ${volume} percent of the starting volume at hour ${end}.`)
    caption.textContent = `Dough rise at hour ${end}: ${volume}% of the starting volume.`
    chart.innerHTML = [
      ...grid,
      ...marks,
      `<path d="${curve(data)}" fill="none" stroke="#b9a37c" stroke-width="2" stroke-dasharray="2 5" />`,
      `<path d="${fill(part)}" fill="#e8c98f" fill-opacity="0.55" />`,
      `<path d="${curve(part)}" fill="none" stroke="#8f3f14" stroke-width="3" stroke-linecap="round" />`,
      `<circle cx="${x(last.hour)}" cy="${y(last.volume)}" r="5" fill="#8f3f14" />`,
    ].join("")
  }

  const show = (step: string) => {
    current = step
    const index = STEPS.indexOf(step)
    back.hidden = index === 0
    next.hidden = index === STEPS.length - 1
    place.hidden = index !== STEPS.length - 1
    status.textContent = `Step ${index + 1} of ${STEPS.length}: ${step}.`
    draw(PHASE_END[index])
    if (step === "Bake") {
      root.querySelector("[data-feed]")!.textContent = field("Starter").value
      root.querySelector("[data-mix]")!.textContent = field("Dough").value
      root.querySelector("[data-shape]")!.textContent = field("Proof").value
    }
  }
  const focusHeading = () => {
    const heading = root.querySelector<HTMLElement>(`b22-panel[value="${current}"] h3`)!
    heading.focus()
  }
  show(current)

  stepper.addEventListener("valuechange", (event) => show((event as CustomEvent<{ value: string }>).detail.value))
  back.addEventListener("action", () => {
    if (stepper.api.back()) focusHeading()
  })
  next.addEventListener("action", () => {
    const input = field(current)
    if (!input.value.trim()) {
      status.textContent = REQUIRED[current]
      input.focus()
      return
    }
    if (stepper.api.next()) focusHeading()
  })
  place.addEventListener("action", () => {
    const [feed, mix, shape] = ["Starter", "Dough", "Proof"].map((step) => field(step).value.trim())
    status.textContent = feed && mix && shape ? `Schedule saved: feed ${feed}, mix ${mix}, shape ${shape}.` : "Go back and fill in the three times."
  })
}

const ui: UI = {
  id: "B22",
  request:
    "Build a 4-step sourdough bake schedule wizard with a stepper: Starter, Dough, Proof and Bake. A person cannot open a step before the earlier ones are done, and a line chart of the dough rise grows with each step.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Feed time", action: "setValue", args: ["6:30"] },
      { ref: "Continue", action: "press" },
      { ref: "Mix time", action: "setValue", args: ["10:30"] },
      { ref: "Continue", action: "press" },
      { ref: "Shape time", action: "setValue", args: ["14:30"] },
      { ref: "Continue", action: "press" },
      { ref: "Save schedule", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Schedule saved: feed 6:30, mix 10:30, shape 14:30.",
  },
  breaks: [
    {
      broke: "A step ahead of the furthest one can be opened.",
      find: "if (index < 0 || index > reached) return false",
      replace: "if (index < 0) return false",
      caught: "keyboard: a step that is not reached yet does not open",
    },
    {
      broke: "The current step has no aria-current.",
      find: '"aria-current": current ? "step" : undefined,',
      replace: '"aria-current": undefined,',
      caught: "keyboard: only the current step has aria-current=step",
    },
    {
      broke: "The arrow keys no longer move focus between steps.",
      find: "if (el) api.roving.keydown(event, el)",
      replace: "void el",
      caught: "keyboard: arrow keys, Home and End move focus between steps",
    },
    {
      broke: "Tab returns to the step that had focus last, not to the current step.",
      find: "remember: false,",
      replace: "",
      caught: "keyboard: Tab returns to the current step, not to the step that had focus last",
    },
    {
      broke: "Continue no longer checks the field.",
      find: "if (!input.value.trim()) {",
      replace: "if (false) {",
      caught: "keyboard: Continue with an empty field stays on the step and says why",
    },
    {
      broke: "Focus no longer moves to the heading of the new step.",
      find: "heading.focus()",
      replace: "void heading",
      caught: "keyboard: Continue and Back move focus to the heading of the new step",
    },
  ],
}

export { wizardStepper }
export default ui
