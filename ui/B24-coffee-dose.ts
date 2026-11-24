import { bindRepeat, type ChangeDetails, createChange, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import { gsap } from "gsap"
import type { UI } from "../src/ui"

type Reason = "step-press" | "hold-repeat" | "imperative"
type Options = {
  min: number
  max: number
  delay?: number
  repeat?: number
  value?: number
  defaultValue?: number
  onValueChange?: (value: number, details: ChangeDetails<Reason>) => void
}
// min, max, delay and repeat are options that the buttons read, so the state has a copy: a part must not read an option.
type State = { value: number; min: number; max: number; delay: number; repeat: number }

const DELAY = 400
const REPEAT = 80

const brew = definePrimitive({
  name: "brew-dose",
  options: {
    min: "number",
    max: "number",
    delay: "number",
    repeat: "number",
    value: "number",
    defaultValue: "number",
    onValueChange: "callback",
  },
  controlled: ["value"],
  state: (options: Options): State => ({
    value: options.value ?? options.defaultValue ?? options.min,
    min: options.min,
    max: options.max,
    delay: options.delay ?? DELAY,
    repeat: options.repeat ?? REPEAT,
  }),
  sync: (options) => ({
    min: options.min,
    max: options.max,
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: (context) => {
    const change = createChange(context)
    // Moves 1 gram. A step at a bound changes nothing.
    const move = (by: 1 | -1, reason: Reason, event?: Event) => {
      const { value, min, max } = context.store.get()
      const next = Math.min(max, Math.max(min, value + by))
      if (next === value) return false
      return change("value", next, { reason, event } as ChangeDetails<Reason>)
    }
    const room = (by: 1 | -1) => {
      const { value, min, max } = context.store.get()
      return by > 0 ? value < max : value > min
    }
    return {
      timing: () => ({ delay: context.store.get().delay, repeat: context.store.get().repeat }),
      room,
      // A press steps at once; each repeat after the delay has a count above 1. It returns whether the hold can go on.
      hold: (by: 1 | -1, count: number, event: Event) => {
        move(by, count > 1 ? "hold-repeat" : "step-press", event)
        return room(by)
      },
      setValue: (grams: number) => {
        const { min, max } = context.store.get()
        if (!Number.isInteger(grams) || grams < min || grams > max)
          throw new Error(`The dose is a whole number from ${min} to ${max} g.`)
        return change("value", grams, { reason: "imperative" })
      },
      increment: () => move(1, "imperative"),
      decrement: () => move(-1, "imperative"),
    }
  },
  slots: (slot) => {
    const button = (by: 1 | -1) =>
      slot({
        role: "button",
        focus: "tab-stop",
        attrs: (state) => {
          const stuck = by > 0 ? state.value >= state.max : state.value <= state.min
          return { tabindex: "0", "aria-disabled": stuck ? "true" : undefined, "data-limit": stuck ? "" : undefined }
        },
        // bindRepeat hears the clicks, the keys and the pointer, so the press does nothing: a second step would double each click.
        press: () => {},
        bind: (el, { api }) =>
          bindRepeat(el, {
            delay: api.timing().delay,
            repeat: api.timing().repeat,
            disabled: () => !api.room(by),
            onStep: ({ event, count }) => api.hold(by, count, event),
          }),
      })
    return { root: slot({ role: "group" }), less: button(-1), more: button(1) }
  },
  agent: { actions: ["setValue", "increment", "decrement"] },
})

createParts(brew, {
  root: { tag: "b24-brew", display: "block" },
  less: "b24-less",
  more: "b24-more",
})

const MIN = 8
const MAX = 40
const START = 18
const RATIO = 16

// The cup: a glass mug. Its inside runs from y 40 (rim) to y 176 (bottom).
const BOTTOM = 176
const HEIGHT = 136
const LIGHT = "#d89b5b"
const DARK = "#2a140a"
const CREMA_LIGHT = "#f0c58a"
const CREMA_DARK = "#8a5a30"
const INSIDE = "M52 40 H188 L176 150 Q172 176 148 176 H92 Q68 176 64 150 Z"

const share = (grams: number) => (grams - MIN) / (MAX - MIN)
const levelY = (grams: number) => BOTTOM - HEIGHT * (0.1 + 0.84 * share(grams))

const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

const cup = () => `
<svg data-cup viewBox="0 0 260 230" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="b24-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b3a26"/><stop offset="1" stop-color="#3a2216"/></linearGradient>
    <linearGradient id="b24-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8703c"/><stop offset="1" stop-color="#6b4220"/></linearGradient>
    <linearGradient id="b24-saucer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf3e2"/><stop offset="1" stop-color="#d3bf9a"/></linearGradient>
    <linearGradient id="b24-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="b24-inside"><path d="${INSIDE}"/></clipPath>
  </defs>
  <rect width="260" height="230" fill="url(#b24-wall)"/>
  <rect y="196" width="260" height="34" fill="url(#b24-wood)"/>
  <path d="M0 196 H260" stroke="#c88f55" stroke-width="2"/>
  <path d="M20 212 H90 M120 220 H230 M150 205 H200" stroke="#5a3719" stroke-width="1.5" stroke-opacity="0.6"/>
  <ellipse cx="120" cy="208" rx="110" ry="12" fill="#000" fill-opacity="0.35"/>
  <ellipse cx="120" cy="200" rx="108" ry="15" fill="url(#b24-saucer)"/>
  <ellipse cx="120" cy="196" rx="78" ry="8" fill="#e6d6b4"/>
  <g data-steam fill="none" stroke="#f3e6d0" stroke-width="3" stroke-linecap="round">
    <path d="M96 30 C88 20 104 14 96 4" opacity="0.5"/>
    <path d="M122 28 C114 16 130 10 122 -2" opacity="0.5"/>
    <path d="M148 30 C140 20 156 14 148 4" opacity="0.5"/>
  </g>
  <path d="M186 62 C238 56 242 138 172 148" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="12" stroke-linecap="round"/>
  <path d="M186 62 C238 56 242 138 172 148" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/>
  <path d="${INSIDE}" fill="#fff" fill-opacity="0.1"/>
  <g clip-path="url(#b24-inside)">
    <rect data-liquid x="40" width="160" fill="${LIGHT}"/>
    <ellipse data-crema cx="120" rx="68" ry="7" fill="${CREMA_LIGHT}"/>
  </g>
  <g data-ticks stroke="#fff" stroke-opacity="0.75" stroke-width="2" stroke-linecap="round"></g>
  <path d="${INSIDE}" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="3" stroke-linejoin="round"/>
  <ellipse cx="120" cy="40" rx="68" ry="8" fill="none" stroke="#fff" stroke-opacity="0.8" stroke-width="3"/>
  <path d="M60 52 L69 142" stroke="url(#b24-shine)" stroke-width="8" stroke-linecap="round"/>
</svg>`

type Cup = { show: (grams: number, animate: boolean) => void }

// The cup is drawn in its full state at once. Later doses tween the level and the colour.
function drawCup(root: HTMLElement, grams: number): Cup | undefined {
  const svg = root.querySelector<SVGSVGElement>("[data-cup]")
  const liquid = svg?.querySelector("[data-liquid]")
  const crema = svg?.querySelector("[data-crema]")
  const ticks = svg?.querySelector("[data-ticks]")
  const steam = svg?.querySelectorAll("[data-steam] path")
  if (!svg || !liquid || !crema || !ticks || !steam) return undefined
  for (const mark of [16, 24, 32, 40]) {
    const y = levelY(mark)
    const wall = 52 + ((y - 40) * 12) / 110
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
    for (const [name, value] of Object.entries({ x1: wall + 4, x2: wall + 16, y1: y, y2: y })) line.setAttribute(name, String(value))
    ticks.append(line)
  }
  const show = (next: number, animate: boolean) => {
    svg.dataset.amount = String(next)
    const y = levelY(next)
    const t = share(next)
    const body = { attr: { y, height: BOTTOM + 14 - y }, fill: gsap.utils.interpolate(LIGHT, DARK, t) }
    const top = { attr: { cy: y }, fill: gsap.utils.interpolate(CREMA_LIGHT, CREMA_DARK, t) }
    if (animate && !calm()) {
      gsap.to(liquid, { ...body, duration: 0.3, ease: "power2.out", overwrite: true })
      gsap.to(crema, { ...top, duration: 0.3, ease: "power2.out", overwrite: true })
    } else {
      gsap.set(liquid, body)
      gsap.set(crema, top)
    }
  }
  show(grams, false)
  if (!calm()) {
    const wisp: gsap.core.Tween = gsap.to(steam, {
      opacity: 0.15,
      duration: 2.4,
      stagger: 0.6,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      onRepeat: () => {
        if (!root.isConnected) wisp.kill()
      },
    })
  }
  return { show }
}

const html = () => `
<h2>Pour-over dose</h2>
<div data-bar>
  ${cup()}
  <div data-panel>
    <b24-brew aria-label="Coffee dose" min="${MIN}" max="${MAX}" default-value="${START}" delay="${DELAY}" repeat="${REPEAT}">
      <p data-dose><span data-grams>${START}</span> <span data-unit>g coffee</span></p>
      <div data-pad>
        <b24-less>Less coffee</b24-less>
        <b24-more>More coffee</b24-more>
      </div>
    </b24-brew>
    <p data-water><span data-water-grams>${START * RATIO}</span> g water at 1:${RATIO}</p>
    <p data-hint>Press and hold a button to keep going. A press moves 1 g, from ${MIN} g to ${MAX} g.</p>
    <p role="status" data-status>Dose: ${START} g coffee, ${START * RATIO} g water.</p>
    <ui-button data-brew><button>Start brew</button></ui-button>
  </div>
</div>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] [data-bar] { display: flex; flex-wrap: wrap; gap: 20px; align-items: start; }
[data-stage] [data-cup] {
  display: block; flex: none; width: 260px; height: 230px;
  border: 1px solid #5c3d27; border-radius: 10px; box-shadow: 0 6px 14px rgba(0, 0, 0, 0.4);
}
[data-stage] [data-panel] {
  display: grid; gap: 14px; justify-items: start; width: min(100%, 340px); padding: 20px;
  border: 1px solid #c9b28c; border-radius: 10px; background: #f3e6d0; color: #3b2616;
  box-shadow: inset 0 1px 0 #fff8ea, 0 6px 14px rgba(0, 0, 0, 0.35);
}
[data-stage] b24-brew { display: grid; gap: 12px; width: 100%; }
[data-stage] [data-dose] { font-size: 2.5rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
[data-stage] [data-unit] { font-size: 1rem; font-weight: 500; }
[data-stage] [data-pad] { display: flex; flex-wrap: wrap; gap: 10px; }
[data-stage] b24-less, [data-stage] b24-more {
  display: inline-grid; place-items: center; min-width: 120px; min-height: 44px; padding: 0 16px;
  border: 1px solid #3d2410; border-radius: 8px; background: #7a4a1f; color: #fff6e5;
  font-weight: 600; cursor: pointer; user-select: none; touch-action: none;
  outline: 1px solid #c8935a; outline-offset: -4px;
}
[data-stage] b24-less[data-holding], [data-stage] b24-more[data-holding] {
  transform: translateY(2px); background: #5e3715;
}
[data-stage] b24-less[aria-disabled="true"], [data-stage] b24-more[aria-disabled="true"] {
  border-color: #b39c76; background: #d8c7a8; color: #5a4632; cursor: default;
}
[data-stage] b24-less:focus-visible, [data-stage] b24-more:focus-visible { outline: 2px solid #7c2d12; outline-offset: 2px; }
[data-stage] [data-water] { font-size: 1.125rem; font-variant-numeric: tabular-nums; }
[data-stage] [data-hint], [data-stage] [data-status] { color: #5a4632; max-width: 60ch; }
`

const doseText = (grams: number) => `${grams} g coffee, ${grams * RATIO} g water`

function mount(root: HTMLElement) {
  root.innerHTML = html()
  const status = root.querySelector("[data-status]")!
  const grams = root.querySelector("[data-grams]")!
  const water = root.querySelector("[data-water-grams]")!
  let dose = START
  const scene = drawCup(root, dose)
  root.querySelector("b24-brew")!.addEventListener("valuechange", (event) => {
    dose = (event as CustomEvent<{ value: number }>).detail.value
    grams.textContent = String(dose)
    water.textContent = String(dose * RATIO)
    status.textContent = `Dose: ${doseText(dose)}.`
    scene?.show(dose, true)
  })
  root.querySelector("[data-brew]")!.addEventListener("action", () => {
    status.textContent = `Brewing ${dose} g coffee with ${dose * RATIO} g water.`
  })
}

const ui: UI = {
  id: "B24",
  request:
    "Build a coffee dose control with Less coffee and More coffee buttons: a press moves 1 gram, holding a button keeps going and stops at the limits, and a cup shows the dose.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Coffee dose", action: "setValue", args: [20] },
      { ref: "Coffee dose", action: "increment" },
      { ref: "Coffee dose", action: "increment" },
      { ref: "Start brew", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Brewing 22 g coffee with 352 g water.",
  },
  breaks: [
    {
      broke: "Holding a button no longer repeats: the delay never ends.",
      find: "delay: api.timing().delay,",
      replace: "delay: 3600000,",
      caught: "keyboard: holding More coffee steps at once, keeps stepping, and stops at the limit",
    },
    {
      broke: "A step can go past the limit.",
      find: "const next = Math.min(max, Math.max(min, value + by))",
      replace: "const next = value + by",
      caught: "agent: an agent sets 20 g, steps up twice and starts the brew, and a dose out of range is refused",
    },
    {
      broke: "A repeat reports the reason of a first press.",
      find: 'count > 1 ? "hold-repeat" : "step-press"',
      replace: '"step-press"',
      caught: "keyboard: holding More coffee steps at once, keeps stepping, and stops at the limit",
    },
    {
      broke: "A button at its limit is not marked aria-disabled.",
      find: '"aria-disabled": stuck ? "true" : undefined,',
      replace: "",
      caught: "keyboard: a button at its limit is aria-disabled and stays a tab stop",
    },
    {
      broke: "A click steps twice, because the press steps as well.",
      find: "press: () => {},",
      replace: 'press: ({ api }, event) => void api.hold(by, 1, event),',
      caught: "keyboard: a press with a pointer steps once, and the click after it does not step again",
    },
    {
      broke: "An agent can set a dose outside the range.",
      find: "if (!Number.isInteger(grams) || grams < min || grams > max)",
      replace: "if (false)",
      caught: "agent: an agent sets 20 g, steps up twice and starts the brew, and a dose out of range is refused",
    },
  ],
}

export { brew }
export default ui
