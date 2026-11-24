import { type ChangeDetails, createChange, createRovingFocus, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import type { UI } from "../src/ui"

type Reason = "item-press" | "list-navigation" | "imperative"
type Options = {
  sizes: string[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, details: ChangeDetails<Reason>) => void
}
// sizes is an option that the size parts render from, so the state has a copy: a part must not read an option.
type State = { focused: string | null; value: string; sizes: string[] }

// A radio group of shoe sizes: 1 tab stop on the chosen size, the arrow keys choose as they move, Space chooses.
const sizePicker = definePrimitive({
  name: "size-picker",
  options: { sizes: "list", value: "string", defaultValue: "string", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    focused: null,
    value: options.value ?? options.defaultValue ?? "",
    sizes: options.sizes ?? [],
  }),
  sync: (options) => ({ sizes: options.sizes ?? [], ...(options.value === undefined ? {} : { value: options.value }) }),
  api: (context) => {
    const change = createChange(context)
    const sizes = () => context.store.get().sizes
    const roving = createRovingFocus<State, { value: string }>(context, {
      slot: "size",
      key: "focused",
      remember: false,
      preferred: (size) => size.key === context.store.get().value,
      claims: (state, size) => size.key === (state.sizes.includes(state.value) ? state.value : state.sizes[0]),
      orientation: () => "both",
      loop: () => true,
    })
    const pick = (value: string, reason: Reason, event?: Event) => {
      if (!sizes().includes(value)) return false
      return change("value", value, { reason, event })
    }
    return {
      roving,
      sizes: () => sizes().map((size) => ({ value: size, label: size })),
      // The bridge refuses a size that is not an item before this runs. A direct call gets false.
      setValue: (value: string) => pick(value, "imperative"),
      press: (value: string, event?: Event) => void pick(value, "item-press", event),
      keydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (event.defaultPrevented) return
        const moved = roving.keydown(event, el)
        if (moved) return void pick(moved.key, "list-navigation", event)
        if (event.key === " ") {
          event.preventDefault()
          pick(key, "item-press", event)
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({ role: "radiogroup", keys: { none: "Each size handles the arrow keys." } }),
    size: slot<{ value: string }>({
      role: "radio",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, { key, props, api }) => ({
        tabindex: api.roving.tabIndex(state, { key, props }),
        "aria-checked": String(state.value === key),
        "data-checked": state.value === key ? "" : undefined,
      }),
      press: ({ api, key }, event) => api.press(key, event),
      on: {
        // A radio is not a button, so press hears only its clicks.
        keydown: (event, { el, api, key }) => api.keydown(event, el!, key),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
  agent: { actions: ["setValue"], closed: true, items: (api) => api.sizes() },
})

createParts(sizePicker, {
  root: { tag: "f07-size-picker", display: "block" },
  size: { tag: "f07-size", display: "block" },
})

const SIZES = ["38", "39", "40", "41", "42", "43", "44", "45", "46"]
const START = "41"
const PRODUCT = "Trail Runner 2"
// A Paris point is 2/3 cm of shoe last; the foot is about 1.5 cm shorter than the last.
const footCm = (size: string) => Math.round((Number(size) * (2 / 3) - 1.5) * 10) / 10
const LARGEST = footCm(SIZES.at(-1)!)
const scaleOf = (size: string) => `scale(${(footCm(size) / LARGEST).toFixed(4)})`

// The outline at the largest size: heel at y 304, big toe tip at y 23, so 281 units for the longest foot.
const HEEL = 304
const UNITS_PER_CM = (HEEL - 23) / LARGEST
const SOLE =
  "M72 304 C52 304 40 291 39 270 C38 248 45 226 46 204 C47 184 37 166 32 146 C27 126 22 106 24 88 C26 70 42 60 62 60 C82 60 100 68 110 80 C120 92 122 112 120 134 C117 162 108 190 106 216 C104 246 106 270 101 287 C96 300 86 304 72 304 Z"
const TOES = [
  [36, 41, 15, 18],
  [61, 34, 9, 10],
  [79, 39, 8, 9],
  [95, 48, 7, 8],
  [109, 61, 6, 7.5],
]
const foot = (attrs: string) =>
  `<g ${attrs}><path d="${SOLE}"/>${TOES.map(([cx, cy, rx, ry]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`).join("")}</g>`
const RULER = Array.from({ length: Math.floor(LARGEST) + 1 }, (_, cm) => {
  const y = (HEEL - cm * UNITS_PER_CM).toFixed(1)
  return `<line x1="4" x2="${cm % 5 === 0 ? 14 : 9}" y1="${y}" y2="${y}"/>`
}).join("")

const status = (size: string) => `Size ${size} selected. Foot length ${footCm(size).toFixed(1)} cm.`

const html = `
<div data-product>
  <figure data-fit>
    <svg viewBox="0 0 144 320" aria-hidden="true" focusable="false">
      <g data-ruler>${RULER}</g>
      ${foot("data-ghost")}
      <g data-foot style="transform: ${scaleOf(START)}">
        ${foot("data-outline")}
        <line data-measure x1="134" x2="134" y1="${HEEL}" y2="23"/>
        <line data-measure x1="128" x2="140" y1="${HEEL}" y2="${HEEL}"/>
        <line data-measure x1="128" x2="140" y1="23" y2="23"/>
      </g>
    </svg>
    <figcaption>
      <span data-length-label>Foot length</span>
      <strong data-length>${footCm(START).toFixed(1)} cm</strong>
      <span data-note>Drawn to scale. Dashed: size ${SIZES.at(-1)}.</span>
    </figcaption>
  </figure>
  <div data-details>
    <h2>${PRODUCT}</h2>
    <p data-price>$128.00</p>
    <p data-colour>Slate grey, road and trail</p>
    <p id="f07-size-label" data-size-label>Shoe size (EU)</p>
    <f07-size-picker aria-labelledby="f07-size-label" sizes="${SIZES}" default-value="${START}">
      ${SIZES.map((size) => `<f07-size value="${size}">${size}</f07-size>`).join("")}
    </f07-size-picker>
    <ui-button data-bag><button>Add to bag</button></ui-button>
    <p role="status" data-status>${status(START)}</p>
  </div>
</div>`

const css = `
[data-stage] { display: block; }
[data-stage] h2, [data-stage] p, [data-stage] figure { margin: 0; }
[data-stage] [data-product] { display: flex; flex-wrap: wrap; gap: 32px; align-items: start; }
[data-stage] [data-fit] {
  display: grid; gap: 12px; width: 220px; padding: 16px; box-sizing: border-box;
  border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-muted);
}
[data-stage] [data-fit] svg { display: block; width: 188px; height: 418px; }
[data-stage] [data-ruler] line { stroke: var(--ui-muted-foreground); stroke-width: 1; }
[data-stage] [data-ghost] { fill: none; stroke: var(--ui-muted-foreground); stroke-width: 1; stroke-dasharray: 4 4; }
[data-stage] [data-foot] {
  transform-box: view-box; transform-origin: 72px ${HEEL}px; transition: transform 320ms cubic-bezier(0.2, 0.7, 0.2, 1);
}
[data-stage] [data-outline] { fill: var(--ui-background); stroke: var(--ui-foreground); stroke-width: 1.5; }
[data-stage] [data-measure] { stroke: var(--ui-primary); stroke-width: 1.5; }
[data-stage] figcaption { display: grid; gap: 2px; }
[data-stage] [data-length-label], [data-stage] [data-note] { color: var(--ui-muted-foreground); font-size: 0.8125rem; }
[data-stage] [data-length] { font-size: 1.25rem; font-weight: 600; font-variant-numeric: tabular-nums; }
[data-stage] [data-details] { display: grid; gap: 12px; justify-items: start; width: min(100%, 340px); }
[data-stage] h2 { font-size: 1.5rem; font-weight: 600; }
[data-stage] [data-price] { font-size: 1.125rem; font-variant-numeric: tabular-nums; }
[data-stage] [data-colour] { color: var(--ui-muted-foreground); }
[data-stage] [data-size-label] { margin-top: 8px; font-weight: 600; }
[data-stage] f07-size-picker { display: grid; grid-template-columns: repeat(5, 56px); gap: 8px; }
[data-stage] f07-size {
  display: grid; place-items: center; height: 44px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius); background: var(--ui-background);
  font-variant-numeric: tabular-nums; cursor: pointer; user-select: none;
}
[data-stage] f07-size:hover { border-color: var(--ui-foreground); }
[data-stage] f07-size[data-checked] {
  border-color: var(--ui-primary); background: var(--ui-primary); color: var(--ui-primary-foreground); font-weight: 600;
}
[data-stage] f07-size:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] [data-bag] button { min-width: 296px; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); max-width: 60ch; }
@media (prefers-reduced-motion: reduce) { [data-stage] [data-foot] { transition: none; } }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const picker = root.querySelector("f07-size-picker")!
  const shape = root.querySelector<SVGGElement>("[data-foot]")!
  const length = root.querySelector("[data-length]")!
  const line = root.querySelector("[data-status]")!
  let size = START
  picker.addEventListener("valuechange", (event) => {
    size = (event as CustomEvent<{ value: string }>).detail.value
    shape.style.transform = scaleOf(size)
    length.textContent = `${footCm(size).toFixed(1)} cm`
    line.textContent = status(size)
  })
  root.querySelector("[data-bag]")!.addEventListener("action", () => {
    line.textContent = `Added ${PRODUCT} in size ${size} to your bag.`
  })
}

const ui: UI = {
  id: "F07",
  request:
    "Build a shoe product page with a size picker whose value is always one of its sizes, and an outline of a foot that grows with the chosen size.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Shoe size", action: "setValue", args: ["42"] },
      { ref: "Shoe size", action: "setValue", args: ["47"] },
    ],
    person: "deny",
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Size 42 selected. Foot length 26.5 cm." &&
      root.querySelector("f07-size[aria-checked=true]")?.getAttribute("value") === "42",
  },
  breaks: [
    {
      broke: "The bridge no longer refuses a size that the picker does not have.",
      find: "closed: true,",
      replace: "",
      caught: "agent: an agent chooses size 42, and size 47 is refused with the 9 real sizes",
    },
    {
      broke: "The arrow keys move focus but no longer choose a size.",
      find: 'if (moved) return void pick(moved.key, "list-navigation", event)',
      replace: "if (moved) return",
      caught: "keyboard: the arrow keys choose a size as they move, and the group is 1 tab stop on the chosen one",
    },
    {
      broke: "Space no longer chooses a size.",
      find: 'if (event.key === " ") {',
      replace: "if (false) {",
      caught: "keyboard: Space chooses the focused size, and a click chooses a size",
    },
    {
      broke: "A direct setValue call can set a size that the picker does not have.",
      find: "if (!sizes().includes(value)) return false",
      replace: "",
      caught: "agent: the primitive's setValue takes only its own sizes",
    },
    {
      broke: "The foot outline no longer scales to the chosen size.",
      find: "shape.style.transform = scaleOf(size)",
      replace: "",
      caught: "keyboard: on the page, the arrow keys change the size, the foot outline scales and the status line follows",
    },
  ],
}

export { sizePicker }
export default ui
