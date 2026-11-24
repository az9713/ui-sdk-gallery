import { type ChangeDetails, createChange, createRovingFocus, definePrimitive } from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import type { UI } from "../src/ui"

type Reason = "item-press" | "imperative"
type Options = {
  steps?: string[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, details: ChangeDetails<Reason>) => void
}
// steps is an option that a step renders from, so the state has a copy: a part must not read an option.
type State = { focused: string | null; value: string; steps: string[] }

const labStepper = definePrimitive({
  name: "lab-stepper",
  options: { steps: "list", value: "string", defaultValue: "string", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => {
    const steps = options.steps ?? []
    return { focused: null, value: options.value ?? options.defaultValue ?? steps[0] ?? "", steps }
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
    })
    const goTo = (key: string, event?: Event) => {
      if (!context.store.get().steps.includes(key)) return false
      return change("value", key, { reason: event ? "item-press" : "imperative", event })
    }
    return { roving, steps: () => context.store.get().steps, goTo }
  },
  slots: (slot) => ({
    root: slot({ role: "group", keys: { none: "Each step handles the arrow keys." } }),
    step: slot<{ value: string }>({
      role: "button",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, part) => {
        const current = state.value === part.key
        return {
          type: "button",
          tabindex: part.api.roving.tabIndex(state, part),
          "aria-current": current ? "step" : undefined,
          "data-current": current ? "" : undefined,
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
    reveals: true,
  },
})

createParts(labStepper, {
  root: { tag: "f08-stepper", display: "block", api: ["goTo"] },
  step: { tag: "f08-step", display: "contents", target: wrappedButton },
  panel: { tag: "f08-panel", display: "block" },
})

const STEPS = ["Weigh", "Dissolve", "Titrate", "Record"]
const KHP_MOLAR_MASS = 204.22
// The beaker for each step: liquid colour, fill level as a share of the beaker, and the caption.
const BEAKER: Record<string, { color: string; level: number; caption: string }> = {
  Weigh: { color: "#ebe6d8", level: 0.1, caption: "Beaker: dry KHP powder, no water yet." },
  Dissolve: { color: "#d3e8f4", level: 0.5, caption: "Beaker: clear solution with 2 drops of phenolphthalein." },
  Titrate: { color: "#ee9cc0", level: 0.62, caption: "Beaker: a faint pink that stays for 30 s, the endpoint." },
  Record: { color: "#f6c3d8", level: 0.62, caption: "Beaker: endpoint reached, pale pink." },
}
// The beaker drawing. The graph paper is lines in the SVG, so no text sits on a patterned background.
const W = 220
const H = 260
const GRID = 20
const LIQUID = { x: 54, y: 104, width: 112, height: 124 }

const field = (label: string, description: string, value = "") => `
    <ui-field>
      <ui-field-label>${label}</ui-field-label>
      <ui-input><input inputmode="decimal" autocomplete="off" value="${value}" /></ui-input>
      <ui-field-description>${description}</ui-field-description>
    </ui-field>`

const beaker = `
<svg data-beaker aria-hidden="true" viewBox="0 0 ${W} ${H}">
  ${Array.from({ length: W / GRID + 1 }, (_, i) => `<line x1="${i * GRID}" x2="${i * GRID}" y1="0" y2="${H}" stroke="#d5deea" />`).join("")}
  ${Array.from({ length: H / GRID + 1 }, (_, i) => `<line x1="0" x2="${W}" y1="${i * GRID}" y2="${i * GRID}" stroke="#d5deea" />`).join("")}
  <rect x="104" y="0" width="12" height="62" rx="2" fill="#f4f7fb" stroke="#1f2a44" stroke-width="2" />
  <rect x="98" y="56" width="24" height="8" rx="2" fill="#1f2a44" />
  <path d="M108 64 L110 78 L112 64 Z" fill="#1f2a44" />
  <circle data-drop cx="110" cy="84" r="3.5" fill="#d3e8f4" stroke="#1f2a44" stroke-width="1" />
  <rect data-liquid x="${LIQUID.x}" y="${LIQUID.y}" width="${LIQUID.width}" height="${LIQUID.height}" rx="3" />
  <path d="M44 96 L52 100 L52 222 Q52 230 60 230 L160 230 Q168 230 168 222 L168 100 L176 96" fill="none" stroke="#1f2a44" stroke-width="2.5" stroke-linejoin="round" />
  ${[0.25, 0.5, 0.75].map((share) => `<line x1="146" x2="160" y1="${LIQUID.y + LIQUID.height * (1 - share)}" y2="${LIQUID.y + LIQUID.height * (1 - share)}" stroke="#1f2a44" stroke-width="1.5" />`).join("")}
</svg>`

const html = `
<article data-sheet>
  <div data-margin aria-hidden="true"></div>
  <div data-body>
    <header data-head>
      <h2>Standardize NaOH with KHP</h2>
      <p data-meta>Lab notebook, page 42. Experiment 7, 24 November 2026.</p>
    </header>
    <f08-stepper aria-label="Titration procedure" steps="${STEPS}" default-value="Weigh">
      <div data-steps>
        ${STEPS.map((name) => `<f08-step value="${name}"><button>${name}</button></f08-step>`).join("")}
      </div>
      <f08-panel value="Weigh">
        <h3>Weigh the KHP</h3>
        <p>Potassium hydrogen phthalate, ${KHP_MOLAR_MASS} g/mol. Weigh about 0.5 g by difference into a clean beaker.</p>
        ${field("Sample mass", "Grams, to 4 decimal places.")}
      </f08-panel>
      <f08-panel value="Dissolve">
        <h3>Dissolve and add indicator</h3>
        <p>Dissolve the solid in deionized water, then add 2 drops of phenolphthalein.</p>
        ${field("Water volume", "Millilitres. It does not change the result.", "50")}
      </f08-panel>
      <f08-panel value="Titrate">
        <h3>Titrate with NaOH</h3>
        <p>Add NaOH from the burette, swirling, until a faint pink colour stays for 30 s.</p>
        ${field("Burette reading", "Millilitres of NaOH delivered.")}
      </f08-panel>
      <f08-panel value="Record">
        <h3>Record the result</h3>
        <dl data-summary>
          <dt>KHP</dt><dd data-mass>Not weighed</dd>
          <dt>NaOH</dt><dd data-volume>Not titrated</dd>
          <dt>Molarity</dt><dd data-molarity>Not known</dd>
        </dl>
        <ui-button data-sign><button>Sign the entry</button></ui-button>
      </f08-panel>
    </f08-stepper>
    <p role="status" data-status>Step 1 of 4: Weigh.</p>
  </div>
  <figure data-figure>
    ${beaker}
    <figcaption data-caption>${BEAKER.Weigh.caption}</figcaption>
  </figure>
</article>`

const css = `
[data-stage] {
  display: grid; max-width: 780px;
  --ui-background: #fdfbf4; --ui-foreground: #1f2a44; --ui-muted: #e9edf3; --ui-muted-foreground: #4a5568;
  --ui-border: #c3cedc; --ui-input: #6b7a90; --ui-primary: #1e3a8a; --ui-primary-foreground: #ffffff; --ui-ring: #1e3a8a;
}
[data-stage] [data-sheet] {
  display: grid; grid-template-columns: 2px minmax(0, 1fr) 180px; gap: 20px; padding: 28px 28px 28px 20px;
  background: var(--ui-background); color: var(--ui-foreground);
  border: 1px solid var(--ui-border); border-radius: 4px; font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
}
[data-stage] [data-margin] { background: #c2413a; }
[data-stage] [data-body] { display: grid; gap: 20px; align-content: start; }
[data-stage] h2, [data-stage] h3, [data-stage] p, [data-stage] dl, [data-stage] dd, [data-stage] figure { margin: 0; }
[data-stage] [data-head] { display: grid; gap: 4px; }
[data-stage] h2 { font-size: 1.375rem; font-weight: 600; line-height: 1.2; }
[data-stage] [data-meta] { color: var(--ui-muted-foreground); font-size: 0.875rem; font-style: italic; }
[data-stage] h3 { font-size: 1.125rem; font-weight: 600; }
[data-stage] f08-panel p { max-width: 60ch; line-height: 1.5; }
[data-stage] f08-stepper { display: grid; gap: 20px; }
[data-stage] [data-steps] { display: flex; flex-wrap: wrap; counter-reset: step; border-bottom: 1px solid var(--ui-border); }
[data-stage] f08-step button {
  all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px;
  padding: 10px 4px 10px 0; margin-right: 14px; border-bottom: 2px solid transparent; margin-bottom: -1px;
  counter-increment: step; cursor: pointer; font-size: 0.9375rem; color: var(--ui-foreground);
}
[data-stage] f08-step button::before {
  content: counter(step) / ""; display: grid; place-items: center; width: 24px; height: 24px; flex: none;
  border: 1px solid var(--ui-input); border-radius: 999px; font-size: 0.75rem; font-variant-numeric: tabular-nums;
}
[data-stage] f08-step button[data-current] { border-bottom-color: var(--ui-primary); font-weight: 600; }
[data-stage] f08-step button[data-current]::before {
  border-color: var(--ui-primary); background: var(--ui-primary); color: var(--ui-primary-foreground);
}
[data-stage] f08-step button:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; border-radius: 2px; }
[data-stage] f08-panel:not([hidden]) { display: grid; gap: 14px; justify-items: start; }
[data-stage] f08-panel ui-field { width: min(100%, 260px); }
[data-stage] f08-panel input { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
[data-stage] [data-summary] { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; }
[data-stage] [data-summary] dt { color: var(--ui-muted-foreground); }
[data-stage] [data-summary] dd { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); font-size: 0.9375rem; }
[data-stage] [data-figure] { display: grid; gap: 8px; align-content: start; }
[data-stage] [data-beaker] { display: block; width: 180px; height: 213px; border: 1px solid var(--ui-border); }
[data-stage] [data-liquid] { transform-box: fill-box; transform-origin: 50% 100%; }
[data-stage] [data-figure] figcaption { color: var(--ui-muted-foreground); font-size: 0.8125rem; font-style: italic; line-height: 1.4; }
`

type Stepper = HTMLElement & { api: { goTo(step: string): boolean } }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const stepper = root.querySelector<Stepper>("f08-stepper")!
  const status = root.querySelector("[data-status]")!
  const caption = root.querySelector("[data-caption]")!
  const liquid = root.querySelector<SVGElement>("[data-liquid]")!
  const drop = root.querySelector<SVGElement>("[data-drop]")!
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  const number = (step: string) => {
    const value = Number.parseFloat(root.querySelector<HTMLInputElement>(`f08-panel[value="${step}"] input`)!.value)
    return Number.isFinite(value) && value > 0 ? value : null
  }
  const molarity = () => {
    const mass = number("Weigh")
    const volume = number("Titrate")
    return mass && volume ? { mass, volume, molar: mass / KHP_MOLAR_MASS / (volume / 1000) } : null
  }

  // The end state is written at once. WAAPI only animates from the old look to it.
  let shown = BEAKER.Weigh
  const paint = (step: string) => {
    const from = shown
    const to = BEAKER[step]
    shown = to
    liquid.style.fill = to.color
    liquid.style.transform = `scaleY(${to.level})`
    drop.style.opacity = step === "Titrate" ? "1" : "0"
    caption.textContent = to.caption
    if (reduced || from === to || typeof liquid.animate !== "function") return
    liquid.animate(
      [
        { fill: from.color, transform: `scaleY(${from.level})` },
        { fill: to.color, transform: `scaleY(${to.level})` },
      ],
      { duration: 700, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    )
    if (step === "Titrate")
      drop.animate(
        [
          { transform: "translateY(0)", opacity: 1 },
          { transform: "translateY(40px)", opacity: 0 },
        ],
        { duration: 500, iterations: 3, easing: "ease-in" },
      )
  }

  const show = (step: string) => {
    status.textContent = `Step ${STEPS.indexOf(step) + 1} of ${STEPS.length}: ${step}.`
    paint(step)
    if (step !== "Record") return
    const result = molarity()
    const mass = number("Weigh")
    const volume = number("Titrate")
    root.querySelector("[data-mass]")!.textContent = mass ? `${mass.toFixed(4)} g` : "Not weighed"
    root.querySelector("[data-volume]")!.textContent = volume ? `${volume.toFixed(2)} mL` : "Not titrated"
    root.querySelector("[data-molarity]")!.textContent = result ? `${result.molar.toFixed(4)} M` : "Not known"
  }
  liquid.style.fill = shown.color
  liquid.style.transform = `scaleY(${shown.level})`
  drop.style.opacity = "0"

  stepper.addEventListener("valuechange", (event) => show((event as CustomEvent<{ value: string }>).detail.value))
  root.querySelector("[data-sign]")!.addEventListener("action", () => {
    const result = molarity()
    status.textContent = result
      ? `Signed: ${result.mass.toFixed(4)} g KHP, ${result.volume.toFixed(2)} mL NaOH, ${result.molar.toFixed(4)} M.`
      : "Enter the sample mass and the burette reading first."
  })
}

const ui: UI = {
  id: "F08",
  request:
    "Build a lab notebook page for a 4-step NaOH titration with a stepper, where each step hides its own field and a beaker drawing changes colour with the step.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Sample mass", action: "setValue", args: ["0.5105"] },
      { ref: "Titration procedure", action: "goTo", args: ["Titrate"] },
      { ref: "Burette reading", action: "setValue", args: ["25.00"] },
      { ref: "Titration procedure", action: "goTo", args: ["Record"] },
      { ref: "Sign the entry", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Signed: 0.5105 g KHP, 25.00 mL NaOH, 0.1000 M.",
  },
  breaks: [
    {
      broke: "The bridge no longer says which closed steps can hide a missing field.",
      find: "reveals: true,",
      replace: "",
      caught: "agent: a field on a closed step is reported as behind the steps that can open it",
    },
    {
      broke: "The bridge no longer knows the steps.",
      find: "items: (api) => api.steps().map((name) => ({ value: name, label: name })),",
      replace: "",
      caught: "agent: the stepper lists its 4 steps, and a step that is not one of them is refused",
    },
    {
      broke: "The current step has no aria-current.",
      find: '"aria-current": current ? "step" : undefined,',
      replace: '"aria-current": undefined,',
      caught: "keyboard: only the current step has aria-current=step, and only its panel shows",
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
      caught: "keyboard: on the page, Tab returns to the current step, not to the step that had focus last",
    },
  ],
}

export { labStepper }
export default ui
