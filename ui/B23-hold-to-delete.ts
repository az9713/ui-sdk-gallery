import { bindHold, type ChangeDetails, createChange, definePrimitive } from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import type { UI } from "../src/ui"

// "hold" and "release" are not in the shared vocabulary: a press that lasts the delay, and a press that ends before it.
type Reason = "hold" | "release" | "imperative"
type Phase = "idle" | "holding" | "released" | "confirmed"
type Options = {
  delay?: number
  phase?: Phase
  defaultPhase?: Phase
  onPhaseChange?: (value: Phase, details: ChangeDetails<Reason>) => void
}
// delay is an option that the button binds from, so the state has a copy.
type State = { phase: Phase; delay: number }

const holdButton = definePrimitive({
  name: "hold-button",
  options: { delay: "number", phase: "string", defaultPhase: "string", onPhaseChange: "callback" },
  controlled: ["phase"],
  state: (options: Options): State => ({
    phase: options.phase ?? options.defaultPhase ?? "idle",
    delay: options.delay ?? 1500,
  }),
  sync: (options) => ({
    delay: options.delay ?? 1500,
    ...(options.phase === undefined ? {} : { phase: options.phase }),
  }),
  api: (context) => {
    const change = createChange(context)
    const phase = () => context.store.get().phase
    const to = (value: Phase, details: { reason: Reason; event?: Event }) =>
      phase() === "confirmed" || phase() === value ? false : change("phase", value, details)
    return {
      phase,
      start: (event: Event) => to("holding", { reason: "hold", event }),
      confirm: (event: Event) => to("confirmed", { reason: "hold", event }),
      release: (event?: Event) => to("released", { reason: "release", event }),
      hold: () => to("confirmed", { reason: "imperative" }),
      reset: () => (phase() === "idle" ? false : change("phase", "idle", { reason: "imperative" })),
    }
  },
  slots: (slot) => ({
    root: slot({ role: "group" }),
    trigger: slot({
      role: "button",
      focus: "native",
      attrs: (state) => ({
        type: "button",
        "aria-disabled": state.phase === "confirmed" ? "true" : undefined,
        "data-confirmed": state.phase === "confirmed" ? "" : undefined,
      }),
      press: ({ api }, event) => void api.release(event),
      bind: (el, { api, store }) =>
        bindHold(el, {
          delay: store.get().delay,
          onPress: ({ event }) => void api.start(event),
          onHold: ({ event }) => void api.confirm(event),
          onEnd: ({ event, held }) => void (held || api.release(event)),
          disabled: () => store.get().phase === "confirmed",
        }),
    }),
  }),
  agent: { actions: ["hold", "reset"] },
})

createParts(holdButton, {
  root: { tag: "b23-hold-button", display: "block", api: ["hold", "reset"] },
  trigger: { tag: "b23-hold", target: wrappedButton, display: "contents" },
})

const HOLD_MS = 1500
const TARGET = "SMP-2417"
const SAMPLES = [
  { id: "SMP-2415", organism: "Salmonella enterica LT2", spot: "F2 / R3 / B12" },
  { id: "SMP-2416", organism: "Staphylococcus aureus USA300", spot: "F2 / R3 / B13" },
  { id: TARGET, organism: "Escherichia coli K-12 MG1655", spot: "F2 / R3 / B14" },
  { id: "SMP-2418", organism: "Pseudomonas aeruginosa PAO1", spot: "F2 / R3 / B15" },
  { id: "SMP-2419", organism: "Bacillus subtilis 168", spot: "F2 / R3 / B16" },
]

// The helix: 16 base pairs. Strand A of each pair slides left and strand B slides right, from the top down.
const PAIRS = "GATTACACCGTAGCTA"
const COMPLEMENT: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" }
const RUNGS = PAIRS.length
const CX = 70
const SWING = 36
const SLIDE = 26
const TOP = 14
const STEP = 232 / (RUNGS - 1)
const TWIST = 0.62
const SLIDE_MS = 400
const phaseAt = (i: number) => i * TWIST
const yAt = (i: number) => TOP + i * STEP
const xAt = (i: number, side: 1 | -1) => CX + side * SWING * Math.sin(phaseAt(i))

function segment(i: number, side: 1 | -1) {
  const points = Array.from({ length: 5 }, (_, k) => {
    const at = i + k / 4
    return `${(CX + side * SWING * Math.sin(phaseAt(at))).toFixed(1)},${yAt(at).toFixed(1)}`
  })
  return `M${points.join(" L")}`
}

function strand(i: number, side: 1 | -1, base: string) {
  const x = xAt(i, side).toFixed(1)
  const y = yAt(i).toFixed(1)
  return `<g data-strand="${side === 1 ? "a" : "b"}" data-rung="${i}">
    <line data-base="${base}" x1="${x}" y1="${y}" x2="${CX}" y2="${y}" />
    ${i < RUNGS - 1 ? `<path d="${segment(i, side)}" />` : ""}
    <circle cx="${x}" cy="${y}" r="4" />
  </g>`
}

const helix = Array.from({ length: RUNGS }, (_, i) => {
  const base = PAIRS[i]
  return strand(i, 1, base) + strand(i, -1, COMPLEMENT[base])
}).join("")

const html = `
<div data-lab>
  <figure data-helix>
    <svg viewBox="0 0 140 260" aria-hidden="true" focusable="false">${helix}</svg>
    <figcaption data-legend><span data-key="A">A</span><span data-key="T">T</span><span data-key="G">G</span><span data-key="C">C</span></figcaption>
  </figure>
  <div data-sample>
    <h2>Sample ${TARGET}</h2>
    <dl>
      <div><dt>Organism</dt><dd>Escherichia coli K-12 MG1655</dd></div>
      <div><dt>Library</dt><dd>Whole genome, 150 bp paired-end</dd></div>
      <div><dt>Sequencing run</dt><dd>4.2 million reads, mean Q 36, 82x coverage</dd></div>
      <div><dt>Freezer position</dt><dd>F2 / R3 / B14 at -80 °C</dd></div>
    </dl>
    <p id="b23-help">Hold the button for 1.5 seconds to delete this sample from the freezer list. Release early to keep it.</p>
    <b23-hold-button aria-label="Delete sample ${TARGET}" aria-describedby="b23-help" delay="${HOLD_MS}" data-agent-confirm="Deletes sample ${TARGET} from the freezer list">
      <b23-hold><button><span data-text>Hold to delete</span><span data-fill aria-hidden="true"></span></button></b23-hold>
    </b23-hold-button>
    <p role="status" data-status></p>
  </div>
  <section data-freezer aria-labelledby="b23-freezer">
    <h2 id="b23-freezer">Freezer list</h2>
    <ul>
      ${SAMPLES.map((s) => `<li data-sample-id="${s.id}"><strong>${s.id}</strong> <span>${s.organism}</span> <small>${s.spot}</small></li>`).join("")}
    </ul>
  </section>
</div>`

const css = `
[data-stage] {
  --b23-a: light-dark(#0e7490, #22d3ee);
  --b23-t: light-dark(#b45309, #fbbf24);
  --b23-g: light-dark(#4d7c0f, #a3e635);
  --b23-c: light-dark(#be185d, #f472b6);
  --b23-fill: light-dark(#fecaca, #7f1d1d);
}
[data-stage] h2, [data-stage] p, [data-stage] dl, [data-stage] dd, [data-stage] ul, [data-stage] figure { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] [data-lab] {
  display: grid; grid-template-columns: 160px minmax(0, 1fr) minmax(0, 15rem); gap: 24px; align-items: start; max-width: 840px;
}
[data-stage] [data-helix] { display: grid; gap: 8px; justify-items: center; }
[data-stage] [data-helix] svg { width: 140px; height: 260px; overflow: visible; }
[data-stage] [data-strand] path { fill: none; stroke: var(--ui-muted-foreground); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
[data-stage] [data-strand] circle { fill: var(--ui-foreground); }
[data-stage] [data-strand] line { stroke-width: 4; stroke-linecap: round; }
[data-stage] [data-base="A"], [data-stage] [data-key="A"] { --b23-base: var(--b23-a); }
[data-stage] [data-base="T"], [data-stage] [data-key="T"] { --b23-base: var(--b23-t); }
[data-stage] [data-base="G"], [data-stage] [data-key="G"] { --b23-base: var(--b23-g); }
[data-stage] [data-base="C"], [data-stage] [data-key="C"] { --b23-base: var(--b23-c); }
[data-stage] [data-base] { stroke: var(--b23-base); }
[data-stage] [data-legend] { display: flex; gap: 6px; }
[data-stage] [data-key] {
  display: grid; place-items: center; width: 24px; height: 24px; border: 2px solid var(--b23-base);
  border-radius: var(--ui-radius); font-size: 0.75rem; font-weight: 600;
}
[data-stage] [data-sample] { display: grid; gap: 14px; justify-items: start; }
[data-stage] [data-sample] dl { display: grid; gap: 6px; font-size: 0.875rem; }
[data-stage] [data-sample] dl div { display: grid; grid-template-columns: 8.5rem minmax(0, 1fr); gap: 8px; }
[data-stage] dt { color: var(--ui-muted-foreground); }
[data-stage] #b23-help, [data-stage] [data-status] { max-width: 60ch; font-size: 0.875rem; color: var(--ui-muted-foreground); }
[data-stage] b23-hold-button { display: block; }
[data-stage] b23-hold-button button {
  display: grid; gap: 8px; height: auto; min-width: 14rem; padding: 10px 16px 0; cursor: pointer; user-select: none; touch-action: none;
  border: 1px solid var(--ui-destructive); background: var(--ui-background); color: var(--ui-foreground); font-weight: 600;
}
[data-stage] b23-hold-button button:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b23-hold-button [data-fill] {
  display: block; height: 6px; margin-inline: -16px; background: var(--ui-destructive);
  transform: scaleX(0); transform-origin: left center; transition: transform 200ms ease-out;
}
[data-stage] b23-hold-button [data-fill]:dir(rtl) { transform-origin: right center; }
[data-stage] b23-hold-button [data-holding] [data-fill] { transform: scaleX(1); transition: transform var(--hold-delay) linear; }
[data-stage] b23-hold-button [data-confirmed] [data-fill] { transform: scaleX(1); }
[data-stage] b23-hold-button [data-confirmed] { cursor: default; border-color: var(--ui-input); color: var(--ui-muted-foreground); }
@media (prefers-reduced-motion: reduce) {
  [data-stage] b23-hold-button [data-fill] { transition: none; }
  [data-stage] b23-hold-button [data-holding]:not([data-held]):not([data-confirmed]) [data-fill] { transform: scaleX(0); transition: none; }
}
[data-stage] [data-freezer] { display: grid; gap: 8px; }
[data-stage] [data-freezer] ul { display: grid; list-style: none; padding: 0; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] [data-freezer] li { display: grid; gap: 2px; padding: 8px 12px; border-top: 1px solid var(--ui-border); font-size: 0.875rem; }
[data-stage] [data-freezer] li:first-child { border-top: 0; }
[data-stage] [data-freezer] li[hidden] { display: none; }
[data-stage] [data-freezer] li[data-sample-id="${TARGET}"] { background: var(--ui-muted); }
[data-stage] [data-freezer] small { color: var(--ui-muted-foreground); font-size: 0.75rem; }
@media (max-width: 760px) {
  [data-stage] [data-lab] { grid-template-columns: 1fr; }
}
`

type Control = HTMLElement & { api: { hold: () => boolean; reset: () => boolean } }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const control = root.querySelector<Control>("b23-hold-button")!
  const status = root.querySelector("[data-status]")!
  const items = [...root.querySelectorAll<HTMLElement>("[data-sample-id]")]
  const strands = [...root.querySelectorAll<SVGGElement>("[data-strand]")]
  const svg = root.querySelector<SVGSVGElement>("[data-helix] svg")!
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  const listed = () => items.filter((item) => !item.hidden).length

  // Each half of a pair slides apart, 1 pair after another, so the last pair opens as the hold ends.
  const slides = strands.map((el) => {
    if (!el.animate) return null
    const i = Number(el.dataset.rung)
    const side = el.dataset.strand === "a" ? -1 : 1
    const slide = el.animate(
      [{ transform: "translateX(0px)" }, { transform: `translateX(${side * SLIDE}px)` }],
      { duration: SLIDE_MS, delay: (i * (HOLD_MS - SLIDE_MS)) / (RUNGS - 1), easing: "ease-out", fill: "both" },
    )
    slide.pause()
    return slide
  })
  const fade = svg.animate?.([{ opacity: 1 }, { opacity: 0.4 }], { duration: 300, fill: "both" })
  fade?.pause()

  const run = (act: (slide: Animation) => void) => slides.forEach((slide) => slide && act(slide))
  let before: Phase = "idle"

  function show(phase: Phase) {
    if (phase === "idle") items.forEach((item) => (item.hidden = false))
    if (phase === "idle") status.textContent = `${TARGET} is in the freezer list. ${listed()} samples listed.`
    if (phase === "holding") status.textContent = `Holding. Keep holding to delete ${TARGET}.`
    if (phase === "released") status.textContent = `Released early. ${TARGET} is still in the freezer list.`
    if (phase === "confirmed") {
      items.find((item) => item.dataset.sampleId === TARGET)!.hidden = true
      status.textContent = `Deleted ${TARGET} from the freezer list. ${listed()} samples remain.`
    }
    if (phase === "holding" && !reduced)
      run((slide) => {
        slide.playbackRate = 1
        slide.play()
      })
    if (phase === "released" && before === "holding" && !reduced)
      run((slide) => {
        slide.updatePlaybackRate(-3)
        slide.play()
      })
    if (phase === "confirmed") {
      run((slide) => slide.finish())
      fade?.finish()
    }
    if (phase === "idle") {
      run((slide) => {
        slide.currentTime = 0
        slide.pause()
      })
      if (fade) fade.currentTime = 0
    }
    before = phase
  }

  control.addEventListener("phasechange", (event) => show((event as CustomEvent<{ value: Phase }>).detail.value))
  show("idle")
}

const ui: UI = {
  id: "B23",
  request:
    "Build a hold-to-delete button for a DNA sample in a lab freezer list: a person presses and holds it until it fills, and letting go early deletes nothing.",
  css,
  mount,
  task: {
    steps: [{ ref: "Delete sample", action: "hold" }],
    done: (root) => root.querySelector("[data-status]")!.textContent === `Deleted ${TARGET} from the freezer list. 4 samples remain.`,
  },
  breaks: [
    {
      broke: "A hold that lasts the whole delay no longer deletes the sample.",
      find: "onHold: ({ event }) => void api.confirm(event),",
      replace: "",
      caught: "keyboard: holding Space for the whole delay confirms, and Enter does the same",
    },
    {
      broke: "The delay is 0, so a short press deletes the sample.",
      find: "delay: store.get().delay,",
      replace: "delay: 0,",
      caught: "keyboard: letting go before the delay deletes nothing",
    },
    {
      broke: "A deleted sample's button no longer says it is disabled.",
      find: '"aria-disabled": state.phase === "confirmed" ? "true" : undefined,',
      replace: "",
      caught: "keyboard: after the deletion the button is aria-disabled and a new hold changes nothing",
    },
    {
      broke: "A plain click no longer reports an early release.",
      find: "press: ({ api }, event) => void api.release(event),",
      replace: "press: () => {},",
      caught: "keyboard: a click with no hold reports an early release",
    },
    {
      broke: "An agent can no longer hold the button.",
      find: 'hold: () => to("confirmed", { reason: "imperative" }),',
      replace: "hold: () => false,",
      caught: "agent: an agent holds the button after the person allows it, and the sample leaves the list",
    },
  ],
}

export { holdButton }
export default ui
