import { type ChangeDetails, createChange, definePrimitive } from "@ui-sdk/core"
import { decimalsOf } from "@ui-sdk/core/number"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import { createRotary, type RotaryReason } from "../src/behaviors/rotary"
import type { UI } from "../src/ui"

type Options = {
  min: number
  max: number
  step: number
  largeStep?: number
  wrap?: boolean
  unit?: string
  value?: number
  defaultValue?: number
  onValueChange?: (value: number, details: ChangeDetails<RotaryReason>) => void
}
// The range and the unit are options that the knob renders from, so the state has a copy: a part must not read an option.
type State = { value: number; min: number; max: number; step: number; largeStep?: number; wrap: boolean; unit: string }

const fixed = (value: number, step: number) => value.toFixed(decimalsOf(step))

const synthKnob = definePrimitive({
  name: "synth-knob",
  options: {
    min: "number",
    max: "number",
    step: "number",
    largeStep: "number",
    wrap: "boolean",
    unit: "string",
    value: "number",
    defaultValue: "number",
    onValueChange: "callback",
  },
  controlled: ["value"],
  state: (options: Options): State => ({
    value: options.value ?? options.defaultValue ?? options.min,
    min: options.min,
    max: options.max,
    step: options.step,
    largeStep: options.largeStep,
    wrap: options.wrap ?? false,
    unit: options.unit ?? "",
  }),
  sync: (options) => ({
    min: options.min,
    max: options.max,
    step: options.step,
    largeStep: options.largeStep,
    wrap: options.wrap ?? false,
    unit: options.unit ?? "",
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: (context) => {
    const change = createChange(context)
    const rotary = createRotary(context, {
      value: (state) => state.value,
      set: (value, details) => change("value", value, details),
      range: () => context.store.get(),
      wrap: () => context.store.get().wrap,
      valueText: (value) => `${fixed(value, context.store.get().step)} ${context.store.get().unit}`.trim(),
    })
    return { rotary, setValue: (value: number) => rotary.set(Number(value)) }
  },
  slots: (slot) => ({
    root: slot({
      role: "slider",
      focus: "tab-stop",
      keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"],
      attrs: (state, { api }) => ({ ...api.rotary.attrs(state), style: api.rotary.style(state) }),
      on: {
        keydown: (event, { api }) => void api.rotary.keydown(event),
        pointerdown: (event, { el, api }) => api.rotary.pointerdown(event, el!),
      },
    }),
  }),
  agent: { actions: ["setValue"] },
})

createParts(synthKnob, { root: { tag: "c03-knob", display: "block" } })

type Knob = { name: string; min: number; max: number; step: number; largeStep: number; value: number; short: string; unit: string; wrap?: boolean; bipolar?: boolean }
const SECTIONS: { name: string; knobs: Knob[] }[] = [
  {
    name: "Filter",
    knobs: [
      { name: "Cutoff", min: 0, max: 10, step: 0.1, largeStep: 1, value: 6.5, short: "", unit: "" },
      { name: "Resonance", min: 0, max: 10, step: 0.1, largeStep: 1, value: 3.2, short: "", unit: "" },
    ],
  },
  {
    name: "Envelope",
    knobs: [
      { name: "Attack", min: 0, max: 2000, step: 10, largeStep: 100, value: 120, short: " ms", unit: "milliseconds" },
      { name: "Release", min: 0, max: 4000, step: 10, largeStep: 250, value: 900, short: " ms", unit: "milliseconds" },
    ],
  },
  {
    name: "Oscillator 2",
    knobs: [
      { name: "Detune", min: -50, max: 50, step: 1, largeStep: 10, value: -7, short: " ct", unit: "cents", bipolar: true },
      { name: "Phase", min: -180, max: 180, step: 1, largeStep: 15, value: 90, short: "°", unit: "degrees", wrap: true },
    ],
  },
]
const KNOBS = SECTIONS.flatMap((section) => section.knobs)
const said = (knob: Knob, value: number) => `${fixed(value, knob.step)}${knob.short}`

// A point at an angle in degrees clockwise from 12 o'clock, at a radius from the center of the 100 by 100 knob.
const at = (degrees: number, radius: number) => {
  const rad = (degrees * Math.PI) / 180
  return `${(50 + radius * Math.sin(rad)).toFixed(2)} ${(50 - radius * Math.cos(rad)).toFixed(2)}`
}
const line = (degrees: number, from: number, to: number, attrs = "") => {
  const [x1, y1] = at(degrees, from).split(" ")
  const [x2, y2] = at(degrees, to).split(" ")
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${attrs} />`
}
// The printed scale: 11 ticks over 270 degrees with a long tick at each end and the middle, or 24 ticks round a knob that wraps.
const scale = (wrap: boolean) =>
  wrap
    ? Array.from({ length: 24 }, (_, i) => line(i * 15, 44, i % 6 ? 47 : 49, i % 6 ? "" : ' data-major=""')).join("")
    : Array.from({ length: 11 }, (_, i) => line(-135 + i * 27, 44, i % 5 ? 47 : 49, i % 5 ? "" : ' data-major=""')).join("")
const RIDGES = Array.from({ length: 40 }, (_, i) => line(i * 9, 29.5, 33.5)).join("")

const knobSvg = (knob: Knob) => `
<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <g data-scale>${scale(!!knob.wrap)}</g>
  <circle data-led="track" cx="50" cy="50" r="40" pathLength="100" />
  <circle data-led="fill" cx="50" cy="50" r="40" pathLength="100" />
  <circle data-shadow cx="51.5" cy="53.5" r="34" />
  <circle data-skirt cx="50" cy="50" r="34" />
  <g data-turn>${RIDGES}</g>
  <circle data-cap cx="50" cy="50" r="25" />
  <g data-turn>${line(0, 11, 22.5, ' data-pointer=""')}</g>
</svg>`

const cell = (knob: Knob) => `
<div data-cell>
  <span data-name aria-hidden="true">${knob.name}</span>
  <c03-knob aria-label="${knob.name}" min="${knob.min}" max="${knob.max}" step="${knob.step}" large-step="${knob.largeStep}" default-value="${knob.value}" unit="${knob.unit}"${knob.wrap ? " wrap" : ""}${knob.bipolar ? " data-bipolar" : ""}>${knobSvg(knob)}</c03-knob>
  <span data-readout="${knob.name}" aria-hidden="true">${said(knob, knob.value)}</span>
</div>`

const html = `
<svg data-defs width="0" height="0" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="c03-cap" cx="50%" cy="50%" r="50%" fx="36%" fy="30%">
      <stop offset="0" stop-color="#f8fafc" />
      <stop offset="0.5" stop-color="#c7ccd3" />
      <stop offset="1" stop-color="#7b838c" />
    </radialGradient>
    <radialGradient id="c03-skirt" cx="50%" cy="50%" r="50%" fx="42%" fy="36%">
      <stop offset="0" stop-color="#4b5159" />
      <stop offset="0.75" stop-color="#262a2f" />
      <stop offset="1" stop-color="#15171a" />
    </radialGradient>
    <filter id="c03-shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" /></filter>
    <filter id="c03-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.1" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>
</svg>
<h2>Synth voice</h2>
<div data-panel>
  <span data-screw="1" aria-hidden="true"></span><span data-screw="2" aria-hidden="true"></span>
  <span data-screw="3" aria-hidden="true"></span><span data-screw="4" aria-hidden="true"></span>
  ${SECTIONS.map(
    (section) => `
  <div data-section>
    <p data-legend>${section.name}</p>
    <div data-knobs>${section.knobs.map(cell).join("")}</div>
  </div>`,
  ).join("")}
</div>
<div data-actions>
  <ui-button data-save><button>Save patch</button></ui-button>
  <p role="status" data-status>Turn a knob, then save the patch.</p>
</div>
<p data-hint>Drag a knob around its center to turn it, or focus it and press the arrow keys. Page Up and Page Down take a big step, Home and End go to the ends. Phase turns round with no stop.</p>`

const PANEL = "#24282d"

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] [data-defs] { position: absolute; width: 0; height: 0; }
[data-stage] [data-panel] {
  position: relative; display: flex; flex-wrap: wrap; gap: 24px 40px;
  padding: 28px 40px 24px; border: 1px solid #3f454d; border-radius: 10px;
  background: ${PANEL}; color: #e5e7eb;
}
[data-stage] [data-screw] {
  position: absolute; width: 10px; height: 10px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #d1d5db, #6b7280 60%, #2f343a);
}
[data-stage] [data-screw="1"] { top: 9px; left: 9px; }
[data-stage] [data-screw="2"] { top: 9px; right: 9px; }
[data-stage] [data-screw="3"] { bottom: 9px; left: 9px; }
[data-stage] [data-screw="4"] { bottom: 9px; right: 9px; }
[data-stage] [data-section] { display: grid; gap: 12px; }
[data-stage] [data-legend] {
  padding-bottom: 4px; border-bottom: 1px solid #59606a;
  color: #cbd5e1; font-size: 0.8125rem; text-align: center;
}
[data-stage] [data-knobs] { display: flex; gap: 20px; }
[data-stage] [data-cell] { display: grid; justify-items: center; gap: 6px; }
[data-stage] [data-name] { color: #e5e7eb; font-size: 0.875rem; }
[data-stage] [data-readout] {
  min-width: 76px; padding: 4px 10px; border: 1px solid #111316; border-radius: 4px;
  background: #0b0d0f; color: #fbbf24; font: 0.8125rem/1.4 ui-monospace, Consolas, monospace; text-align: center;
}
[data-stage] c03-knob {
  display: block; width: 96px; height: 96px; border-radius: 50%;
  cursor: grab; touch-action: none; user-select: none;
}
[data-stage] c03-knob > svg { display: block; width: 96px; height: 96px; overflow: visible; }
[data-stage] c03-knob:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] c03-knob [data-scale] line { stroke: #8b939d; stroke-width: 1.2; stroke-linecap: round; }
[data-stage] c03-knob [data-scale] [data-major] { stroke: #d1d5db; stroke-width: 1.8; }
[data-stage] c03-knob [data-led] {
  fill: none; stroke-width: 3.2; stroke-linecap: round;
  transform-box: view-box; transform-origin: 50% 50%; transform: rotate(135deg);
}
[data-stage] c03-knob [data-led="track"] { stroke: #3a3122; stroke-dasharray: 75 100; }
[data-stage] c03-knob [data-led="fill"] { stroke: #fbbf24; stroke-dasharray: calc(var(--rotary-fraction) * 75) 100; filter: url(#c03-glow); }
[data-stage] c03-knob[data-bipolar] [data-led="fill"] {
  stroke-dasharray: calc(max(var(--rotary-fraction) - 0.5, 0.5 - var(--rotary-fraction)) * 75) 100;
  stroke-dashoffset: calc(min(var(--rotary-fraction), 0.5) * -75);
}
[data-stage] c03-knob[data-wrap] [data-led] { transform: rotate(90deg); }
[data-stage] c03-knob[data-wrap] [data-led="track"] { stroke-dasharray: none; }
[data-stage] c03-knob[data-wrap] [data-led="fill"] { stroke-dasharray: 3 97; stroke-dashoffset: calc(1.5 - var(--rotary-fraction) * 100); }
[data-stage] c03-knob [data-shadow] { fill: rgba(0, 0, 0, 0.6); filter: url(#c03-shadow); }
[data-stage] c03-knob [data-skirt] { fill: url(#c03-skirt); stroke: #0e1012; stroke-width: 1; }
[data-stage] c03-knob [data-turn] {
  transform-box: view-box; transform-origin: 50% 50%; transform: rotate(var(--rotary-angle));
}
[data-stage] c03-knob [data-turn] line { stroke: #50565e; stroke-width: 1.4; }
[data-stage] c03-knob [data-cap] { fill: url(#c03-cap); stroke: #5d646d; stroke-width: 0.8; }
[data-stage] c03-knob [data-turn] [data-pointer] { stroke: #1f2328; stroke-width: 3; stroke-linecap: round; }
[data-stage] c03-knob:active { cursor: grabbing; }
[data-stage] [data-actions] { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
[data-stage] [data-status] { max-width: 60ch; color: var(--ui-foreground); }
[data-stage] [data-hint] { max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const values = new Map(KNOBS.map((knob) => [knob.name, knob.value]))
  for (const knob of KNOBS) {
    const readout = root.querySelector(`[data-readout="${knob.name}"]`)!
    root.querySelector(`c03-knob[aria-label="${knob.name}"]`)!.addEventListener("valuechange", (event) => {
      const { value } = (event as CustomEvent<{ value: number }>).detail
      values.set(knob.name, value)
      readout.textContent = said(knob, value)
      status.textContent = `${knob.name} ${said(knob, value)}.`
    })
  }
  root.querySelector("[data-save]")!.addEventListener("action", () => {
    status.textContent = `Saved patch: ${KNOBS.map((knob) => `${knob.name} ${said(knob, values.get(knob.name)!)}`).join(", ")}.`
  })
}

const ui: UI = {
  id: "C03",
  request:
    "Build a synth panel of rotary knobs: a person turns a knob by dragging around its center or with the arrow keys, most knobs stop at their ends, and the phase knob turns round with no stop.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Cutoff", action: "setValue", args: [7.2] },
      { ref: "Resonance", action: "setValue", args: [4] },
      { ref: "Phase", action: "setValue", args: [190] },
      { ref: "Save patch", action: "press" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent ===
      "Saved patch: Cutoff 7.2, Resonance 4.0, Attack 120 ms, Release 900 ms, Detune -7 ct, Phase -170°.",
  },
  breaks: [
    {
      broke: "The arrow keys no longer turn a knob.",
      find: "keydown: (event, { api }) => void api.rotary.keydown(event),",
      replace: "keydown: () => {},",
      caught: "keyboard: the arrow keys turn a focused knob, Page Up and Page Down take its large step, and Home and End go to its ends",
    },
    {
      broke: "A drag no longer turns a knob.",
      find: "pointerdown: (event, { el, api }) => api.rotary.pointerdown(event, el!),",
      replace: "",
      caught: "pointer: a drag around the center turns a knob clockwise and back, and stops at its end",
    },
    {
      broke: "Phase stops at its ends instead of turning round.",
      find: "wrap: () => context.store.get().wrap,",
      replace: "",
      caught: "keyboard: Phase turns round past its ends, and a knob that stops does not",
    },
    {
      broke: "Screen readers no longer hear the unit of a knob's value.",
      find: "valueText: (value) =>",
      replace: "unused: (value: number) =>",
      caught: "keyboard: a knob is a slider with its bounds, its value and its value text with the unit",
    },
    {
      broke: "The readout under a knob no longer follows its value.",
      find: "readout.textContent = said(knob, value)",
      replace: "",
      caught: "keyboard: on the page, Tab reaches each knob once, and a key turns it and updates its readout and the status line",
    },
  ],
}

export { synthKnob }
export default ui
