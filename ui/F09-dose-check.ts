import { definePrimitive } from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import "@ui-sdk/web/input"
import type { UI } from "../src/ui"

type InputApi = { setValue: (value: string) => unknown }
type Options = { min: number; max: number; unit?: string; input?: () => InputApi | undefined }
// min, max and unit are options that the parts render from, so the state has a copy: a part must not read an option.
type State = { errors: string[]; limit: number | null; min: number; max: number; unit: string }

const parse = (text: string) => (text.trim() === "" ? null : Number(text.trim()))

const doseCheck = definePrimitive({
  name: "dose-check",
  options: { min: "number", max: "number", unit: "string", input: "value" },
  state: (options: Options): State => ({
    errors: [],
    limit: null,
    min: options.min,
    max: options.max,
    unit: options.unit ?? "",
  }),
  sync: (options) => ({ min: options.min, max: options.max, unit: options.unit ?? "" }),
  api: (context) => {
    const check = (value: number | null) => {
      const { min, max, unit } = context.store.get()
      const errors: string[] = []
      let limit: number | null = null
      if (value !== null && Number.isNaN(value)) errors.push("Write the dose as a number.")
      else if (value !== null && value > max) {
        errors.push(`${value} ${unit} is above the maximum, ${max} ${unit}.`)
        limit = max
      } else if (value !== null && value < min) {
        errors.push(`${value} ${unit} is below the minimum, ${min} ${unit}.`)
        limit = min
      }
      context.store.set({ errors, limit })
      return errors
    }
    return {
      check,
      errors: () => context.store.get().errors,
      useLimit: () => {
        const { limit } = context.store.get()
        if (limit === null) throw new Error("The dose has no error, so there is no limit to use.")
        context.options().input?.()?.setValue(String(limit))
        check(limit)
        return limit
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-invalid": state.errors.length ? "" : undefined }),
      // The dose input is a ui-input of its own: this wrapper hears its changes and marks it, and does not bind it.
      bind: (el, part) => {
        const host = el.querySelector("ui-input")
        const input = host?.querySelector("input")
        if (!host || !input) return
        const hear = (event: Event) => void part.api.check(parse((event as CustomEvent<{ value: string }>).detail.value))
        const mark = () => {
          const { errors } = part.store.get()
          if (errors.length) input.setAttribute("aria-invalid", "true")
          else input.removeAttribute("aria-invalid")
          // The error part takes this id from its slot, and it binds after this change.
          if (errors.length) input.setAttribute("aria-describedby", `${part.id}-error`)
          else input.removeAttribute("aria-describedby")
        }
        host.addEventListener("valuechange", hear)
        const stop = part.store.subscribe(mark)
        part.api.check(parse(input.value))
        mark()
        return () => {
          host.removeEventListener("valuechange", hear)
          stop()
        }
      },
    }),
    error: slot({
      present: (state) => state.errors.length > 0,
      attrs: (_state, part) => ({ id: `${part.id}-error` }),
      bind: (el, part) => {
        const write = () => (el.textContent = part.store.get().errors.join(" "))
        write()
        return part.store.subscribe(write)
      },
    }),
    fix: slot({
      present: (state) => state.limit !== null,
      attrs: () => ({ type: "button" }),
      press: ({ api }) => void api.useLimit(),
      bind: (el, part) => {
        const write = () => {
          const { limit, unit } = part.store.get()
          el.textContent = limit === null ? "" : `Use ${limit} ${unit}`
        }
        write()
        return part.store.subscribe(write)
      },
    }),
  }),
  agent: { actions: ["useLimit"], shown: (state) => state.errors.length > 0 },
})

createParts(doseCheck, {
  root: {
    tag: "f09-dose-check",
    display: "block",
    api: ["check", "errors", "useLimit"],
    // Read lazily: the ui-input inside may upgrade after this element.
    options: (el) => ({ input: () => el.querySelector<HTMLElement & { api?: InputApi }>("ui-input")?.api }),
  },
  error: { tag: "f09-dose-error", display: "block" },
  fix: { tag: "f09-dose-fix", target: wrappedButton },
})

const MIN = 25
const MAX = 90
const TOP = 120
const PER_ML = 50
// The gauge: a half circle from 0 (left) to TOP (right) mg/kg/day, centre (130, 130), radius 100.
const CX = 130
const CY = 130
const R = 100
const W = 260
const H = 150

const at = (value: number, r: number) => {
  const angle = Math.PI * (1 - Math.min(Math.max(value, 0), TOP) / TOP)
  return { x: CX + r * Math.cos(angle), y: CY - r * Math.sin(angle) }
}
const arc = (from: number, to: number, r: number) => {
  const a = at(from, r)
  const b = at(to, r)
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}
const zone = (value: number) => (value > MAX ? "over" : value < MIN ? "under" : "in")
const amount = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 })

const ticks = [0, MIN, MAX, TOP]
  .map((value) => {
    const end = value === 0 || value === TOP
    const p = end ? { x: at(value, R).x, y: CY + 12 } : at(value, R + 20)
    return `<span class="f09-tick" style="left: ${((p.x / W) * 100).toFixed(1)}%; top: ${((p.y / H) * 100).toFixed(1)}%">${value}</span>`
  })
  .join("")

const html = `
<header class="f09-head">
  <h2>Amoxicillin dose</h2>
  <p>Oral suspension 250 mg in 5 mL, 2 doses a day. Safe range ${MIN} to ${MAX} mg/kg/day.</p>
</header>
<div class="f09-body">
  <div class="f09-form">
    <div class="f09-entry">
      <label for="f09-weight">Patient weight (kg)</label>
      <ui-input><input id="f09-weight" inputmode="decimal" autocomplete="off" value="18" /></ui-input>
    </div>
    <f09-dose-check aria-label="Safety check" min="${MIN}" max="${MAX}" unit="mg/kg/day">
      <div class="f09-entry">
        <label for="f09-dose">Daily dose (mg/kg)</label>
        <ui-input><input id="f09-dose" inputmode="decimal" autocomplete="off" value="45" /></ui-input>
      </div>
      <f09-dose-error></f09-dose-error>
      <f09-dose-fix><button type="button"></button></f09-dose-fix>
    </f09-dose-check>
    <ui-button data-calc><button>Calculate</button></ui-button>
  </div>
  <figure class="f09-gauge" data-zone="in">
    <div class="f09-dial">
      <svg viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">
        <path class="f09-band" data-band="under" d="${arc(0, MIN, R)}" />
        <path class="f09-band" data-band="in" d="${arc(MIN, MAX, R)}" />
        <path class="f09-band" data-band="over" d="${arc(MAX, TOP, R)}" />
        <path class="f09-track" d="${arc(0, TOP, R - 22)}" />
        <path class="f09-fill" d="" />
        <g class="f09-needle"><line x1="${CX}" y1="${CY}" x2="${CX - R + 26}" y2="${CY}" /><circle cx="${CX}" cy="${CY}" r="7" /></g>
      </svg>
      ${ticks}
    </div>
    <figcaption class="f09-readout">
      <span class="f09-value" data-value>45</span>
      <span class="f09-unit">mg/kg/day</span>
      <span class="f09-zone" data-zone-text>In the safe range</span>
    </figcaption>
  </figure>
</div>
<p role="status" data-status>Press Calculate for the amount in each dose.</p>`

const css = `
[data-stage] { display: grid; gap: 24px; max-width: 880px; }
[data-stage] h2, [data-stage] p, [data-stage] figure { margin: 0; }
[data-stage] .f09-head { display: grid; gap: 6px; padding-bottom: 16px; border-bottom: 1px solid var(--ui-border); }
[data-stage] .f09-head h2 { font-size: 1.25rem; font-weight: 600; }
[data-stage] .f09-head p { max-width: 60ch; color: var(--ui-muted-foreground); }
[data-stage] .f09-body { display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: 40px; align-items: start; }
[data-stage] .f09-form { display: grid; gap: 20px; justify-items: start; }
[data-stage] .f09-entry { display: grid; gap: 6px; width: 260px; }
[data-stage] .f09-entry label { font-weight: 500; }
[data-stage] .f09-entry ui-input input { font-family: var(--ui-font-mono); font-variant-numeric: tabular-nums; }
[data-stage] f09-dose-check { display: grid; gap: 10px; justify-items: start; width: 100%; }
[data-stage] f09-dose-error { max-width: 36ch; color: var(--ui-destructive); }
[data-stage] f09-dose-error[hidden], [data-stage] f09-dose-fix:has(> button[hidden]) { display: none; }
[data-stage] f09-dose-fix button {
  padding: 6px 12px; border: 1px solid var(--ui-destructive); border-radius: var(--ui-radius);
  background: transparent; color: var(--ui-foreground); font: inherit; cursor: pointer;
}
[data-stage] f09-dose-fix button:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] f09-dose-check[data-invalid] ui-input input { border-color: var(--ui-destructive); }
[data-stage] .f09-gauge { display: grid; gap: 8px; justify-items: center; padding: 20px 24px 24px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] .f09-dial { position: relative; width: 100%; max-width: 360px; }
[data-stage] .f09-dial svg { display: block; width: 100%; height: auto; }
[data-stage] .f09-band { fill: none; stroke-width: 16; }
[data-stage] .f09-band[data-band="under"] { stroke: var(--ui-input); }
[data-stage] .f09-band[data-band="in"] { stroke: var(--ui-primary); }
[data-stage] .f09-band[data-band="over"] { stroke: var(--ui-destructive); }
[data-stage] .f09-track { fill: none; stroke: var(--ui-border); stroke-width: 6; }
[data-stage] .f09-fill { fill: none; stroke: var(--ui-foreground); stroke-width: 6; }
[data-stage] .f09-needle { transform-box: view-box; transform-origin: ${CX}px ${CY}px; transform: rotate(var(--turn, 0deg)); transition: transform 300ms ease-out; }
[data-stage] .f09-needle line { stroke: var(--ui-foreground); stroke-width: 3; stroke-linecap: round; }
[data-stage] .f09-needle circle { fill: var(--ui-foreground); }
[data-stage] .f09-tick {
  position: absolute; transform: translate(-50%, -50%); padding: 0 4px;
  background: var(--ui-background); color: var(--ui-muted-foreground);
  font-family: var(--ui-font-mono); font-size: 0.75rem;
}
[data-stage] .f09-readout { display: grid; justify-items: center; gap: 2px; }
[data-stage] .f09-value { font-family: var(--ui-font-mono); font-size: 2rem; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.1; }
[data-stage] .f09-unit { color: var(--ui-muted-foreground); }
[data-stage] .f09-zone { margin-top: 6px; font-weight: 500; color: var(--ui-primary); }
[data-stage] .f09-gauge[data-zone="over"] .f09-zone { color: var(--ui-destructive); }
[data-stage] .f09-gauge[data-zone="under"] .f09-zone, [data-stage] .f09-gauge[data-zone="none"] .f09-zone { color: var(--ui-muted-foreground); }
[data-stage] [data-status] { max-width: 60ch; font-family: var(--ui-font-mono); }
@media (prefers-reduced-motion: reduce) { [data-stage] .f09-needle { transition: none; } }
@media (max-width: 720px) { [data-stage] .f09-body { grid-template-columns: minmax(0, 1fr); } }
`

const ZONE_TEXT = { in: "In the safe range", over: "Above the maximum", under: "Below the minimum", none: "No dose" }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const weightInput = root.querySelector<HTMLInputElement>("#f09-weight")!
  const doseInput = root.querySelector<HTMLInputElement>("#f09-dose")!
  const check = root.querySelector<HTMLElement & { api: { errors: () => string[] } }>("f09-dose-check")!
  const gauge = root.querySelector<HTMLElement>(".f09-gauge")!
  const needle = root.querySelector<SVGGElement>(".f09-needle")!
  const fill = root.querySelector<SVGPathElement>(".f09-fill")!
  const value = root.querySelector("[data-value]")!
  const zoneText = root.querySelector("[data-zone-text]")!

  const draw = (text: string) => {
    const dose = parse(text)
    const known = dose !== null && !Number.isNaN(dose)
    const z = known ? zone(dose) : "none"
    gauge.dataset.zone = z
    value.textContent = known ? amount(dose) : "--"
    zoneText.textContent = ZONE_TEXT[z]
    needle.style.setProperty("--turn", `${known ? (Math.min(Math.max(dose, 0), TOP) / TOP) * 180 : 0}deg`)
    fill.setAttribute("d", known && dose > 0 ? arc(0, dose, R - 22) : "")
  }
  const ready = "Press Calculate for the amount in each dose."
  draw(doseInput.value)
  doseInput.closest("ui-input")!.addEventListener("valuechange", (event) => {
    draw((event as CustomEvent<{ value: string }>).detail.value)
    status.textContent = ready
  })
  weightInput.closest("ui-input")!.addEventListener("valuechange", () => (status.textContent = ready))

  root.querySelector("[data-calc]")!.addEventListener("action", () => {
    const weight = parse(weightInput.value)
    const dose = parse(doseInput.value)
    const errors = check.api.errors()
    if (weight === null || Number.isNaN(weight) || weight <= 0) status.textContent = "Write the patient weight in kg."
    else if (dose === null) status.textContent = "Write the daily dose in mg/kg."
    else if (errors.length) status.textContent = `Not calculated. ${errors.join(" ")}`
    else {
      const day = weight * dose
      status.textContent = `${amount(day)} mg a day: ${amount(day / 2)} mg (${amount(day / 2 / PER_ML)} mL) every 12 hours.`
    }
  })
}

const ui: UI = {
  id: "F09",
  request:
    "Build a medication dose calculator with an SVG dose gauge, where the dose field's safety check is shown to an agent only while the dose is out of range.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Daily dose", action: "setValue", args: ["120"] },
      { ref: "Safety check", action: "useLimit" },
      { ref: "Calculate", action: "press" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "1,620 mg a day: 810 mg (16.2 mL) every 12 hours." &&
      !root.querySelector("f09-dose-check")!.hasAttribute("data-invalid"),
  },
  breaks: [
    {
      broke: "The safety check is shown to an agent with no error.",
      find: "shown: (state) => state.errors.length > 0",
      replace: "shown: () => true",
      caught: "agent: the safety check is in the snapshot only while the dose has an error",
    },
    {
      broke: "A dose above the maximum is not an error.",
      find: "value !== null && value > max",
      replace: "false",
      caught: "keyboard: above the maximum, Enter on the fix button sets the maximum and clears the error",
    },
    {
      broke: "The fix button does nothing.",
      find: "press: ({ api }) => void api.useLimit(),",
      replace: "press: () => {},",
      caught: "keyboard: below the minimum, Space on the fix button sets the minimum",
    },
    {
      broke: "The error text stays on the page with no error.",
      find: "present: (state) => state.errors.length > 0,",
      replace: "",
      caught: "keyboard: a dose in range has no error part and no fix button to Tab to",
    },
    {
      broke: "The dose input is not marked invalid.",
      find: 'input.setAttribute("aria-invalid", "true")',
      replace: "void 0",
      caught: "keyboard: on the page, the dose input is invalid and described by the error while it is out of range",
    },
  ],
}

export { doseCheck }
export default ui
