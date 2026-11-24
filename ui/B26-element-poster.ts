import { bindFindable, bindPanel, type ChangeDetails, createChange, definePrimitive, hiddenAttrs, idPart } from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import type { UI } from "../src/ui"

type Reason = "item-press" | "find-in-page" | "imperative"
type Opening = "mount" | "instant" | "animate"
type Options = {
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[], details: ChangeDetails<Reason>) => void
}
// value lists the open panels. The data sources block is a panel too, with the key "notes".
type State = { value: string[]; exiting: string[]; opening: Opening }

const NOTES = "notes"

const GROUPS = {
  nonmetal: "Nonmetal",
  noble: "Noble gas",
  alkali: "Alkali metal",
  halogen: "Halogen",
  transition: "Transition metal",
} as const

type Element = {
  symbol: string
  name: string
  number: number
  mass: string
  group: keyof typeof GROUPS
  column: number
  period: number
  phase: string
  config: string
  fact: string
}

// Standard atomic weights in u. The shape and the values come from the row's brief: 8 elements.
const ELEMENTS: Element[] = [
  { symbol: "H", name: "Hydrogen", number: 1, mass: "1.008", group: "nonmetal", column: 1, period: 1, phase: "gas", config: "1s<sup>1</sup>", fact: "The lightest element. It makes up about three quarters of the ordinary matter in the universe by mass." },
  { symbol: "He", name: "Helium", number: 2, mass: "4.0026", group: "noble", column: 18, period: 1, phase: "gas", config: "1s<sup>2</sup>", fact: "Seen in the spectrum of the Sun in 1868, 27 years before anyone isolated it on Earth." },
  { symbol: "Li", name: "Lithium", number: 3, mass: "6.94", group: "alkali", column: 1, period: 2, phase: "solid", config: "[He] 2s<sup>1</sup>", fact: "The lightest metal. It is soft enough to cut with a knife and it is used in rechargeable batteries." },
  { symbol: "Ne", name: "Neon", number: 10, mass: "20.180", group: "noble", column: 18, period: 2, phase: "gas", config: "[He] 2s<sup>2</sup> 2p<sup>6</sup>", fact: "Glows red-orange in a low-pressure discharge tube, as in a neon sign." },
  { symbol: "Na", name: "Sodium", number: 11, mass: "22.990", group: "alkali", column: 1, period: 3, phase: "solid", config: "[Ne] 3s<sup>1</sup>", fact: "Reacts violently with water. Table salt is a compound of sodium and chlorine." },
  { symbol: "Cl", name: "Chlorine", number: 17, mass: "35.45", group: "halogen", column: 17, period: 3, phase: "gas", config: "[Ne] 3s<sup>2</sup> 3p<sup>5</sup>", fact: "A yellow-green gas at room temperature. Water works use it to disinfect drinking water." },
  { symbol: "Fe", name: "Iron", number: 26, mass: "55.845", group: "transition", column: 8, period: 4, phase: "solid", config: "[Ar] 3d<sup>6</sup> 4s<sup>2</sup>", fact: "The main metal in steel. The core of the Earth is mostly iron and nickel." },
  { symbol: "Au", name: "Gold", number: 79, mass: "196.97", group: "transition", column: 11, period: 6, phase: "solid", config: "[Xe] 4f<sup>14</sup> 5d<sup>10</sup> 6s<sup>1</sup>", fact: "Does not tarnish in air or water. Its density is 19.3 g/cm<sup>3</sup>, about 19 times that of water." },
]
const SYMBOLS = ELEMENTS.map((element) => element.symbol)
const nameOf = (symbol: string) => ELEMENTS.find((element) => element.symbol === symbol)?.name ?? symbol

const poster = definePrimitive({
  name: "element-poster",
  options: { value: "list", defaultValue: "list", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    value: options.value ?? options.defaultValue ?? [],
    exiting: [],
    opening: "mount",
  }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    // A panel that closes with animation is in exiting until its transition ends. Nothing in exiting closes at once.
    const set = (value: string[], details: { reason: Reason; event?: Event }, opening: Opening, closing: string[] = []) => {
      const { exiting } = context.store.get()
      context.store.set({ opening, exiting: [...exiting.filter((key) => !closing.includes(key)), ...closing] })
      if (!change("value", value, details)) context.store.set({ exiting })
    }
    const known = (key: string) => {
      if (key !== NOTES && !SYMBOLS.includes(key)) throw new Error(`No panel "${key}". Panels: ${SYMBOLS.join(", ")}.`)
    }
    return {
      elements: () => ELEMENTS.map((element) => ({ value: element.symbol, label: element.name })),
      toggle: (key: string, event?: Event) => {
        known(key)
        const { value } = context.store.get()
        const open = value.includes(key)
        set(open ? value.filter((k) => k !== key) : [...value, key], { reason: event ? "item-press" : "imperative", event }, "animate", open ? [key] : [])
      },
      // Find in page opened the panel by itself, so it opens at once.
      find: (key: string, event: Event) => {
        const { value } = context.store.get()
        if (value.includes(key)) return
        set([...value, key], { reason: "find-in-page", event }, "instant")
      },
      showAll: () => {
        const { value } = context.store.get()
        set([...SYMBOLS, ...value.filter((key) => key === NOTES)], { reason: "imperative" }, "instant")
      },
      hideAll: () => {
        const { value } = context.store.get()
        set(value.filter((key) => key === NOTES), { reason: "imperative" }, "instant")
      },
    }
  },
  slots: (slot) => ({
    root: slot({ role: "group" }),
    element: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { key }) => ({ "data-open": state.value.includes(key) ? "" : undefined }),
    }),
    trigger: slot<{ value: string }>({
      role: "button",
      focus: "native",
      props: { value: "string" },
      attrs: (state, { id, key }) => ({
        type: "button",
        id: `${id}-${idPart(key)}-trigger`,
        "aria-expanded": String(state.value.includes(key)),
        "aria-controls": `${id}-${idPart(key)}-panel`,
      }),
      press: ({ api, key }, event) => api.toggle(key, event),
    }),
    panel: slot<{ value: string }>({
      role: "group",
      props: { value: "string" },
      attrs: (state, { id, key }) => ({
        id: `${id}-${idPart(key)}-panel`,
        "aria-labelledby": `${id}-${idPart(key)}-trigger`,
        ...hiddenAttrs(state.value.includes(key) || state.exiting.includes(key), true),
      }),
      bind: (el, { api, key, store }) =>
        bindPanel(el, {
          size: (el, height) => el.style.setProperty("--panel-height", height),
          isOpen: () => store.get().value.includes(key),
          isExiting: () => store.get().exiting.includes(key),
          isFindable: () => true,
          opening: () => store.get().opening,
          reveal: (event) => api.find(key, event),
          trigger: () => el.parentElement?.querySelector<HTMLElement>("button") ?? undefined,
          subscribe: store.subscribe,
          settled: () => {},
          exited: () => store.set({ exiting: store.get().exiting.filter((item) => item !== key) }),
        }),
    }),
    // The data sources have no transition, so they use bindFindable alone.
    notes: slot({
      role: "group",
      attrs: (state, { id }) => ({ id: `${id}-notes`, ...hiddenAttrs(state.value.includes(NOTES), true) }),
      bind: (el, { api, store }) => {
        const findable = bindFindable(el, {
          shown: () => store.get().value.includes(NOTES),
          findable: () => true,
          reveal: (event) => api.find(NOTES, event),
        })
        const unsubscribe = store.subscribe(findable.check)
        return () => {
          unsubscribe()
          findable()
        }
      },
    }),
  }),
  agent: { actions: ["toggle"], items: (api) => api.elements() },
})

createParts(poster, {
  root: { tag: "b26-poster", display: "block", api: ["toggle", "showAll", "hideAll"] },
  element: { tag: "b26-element", display: "block" },
  trigger: { tag: "b26-trigger", target: wrappedButton, display: "contents" },
  panel: { tag: "b26-panel", display: "block" },
  notes: { tag: "b26-notes", display: "block" },
})

const tile = (element: Element) => `
  <b26-element value="${element.symbol}" data-group="${element.group}">
    <div data-tile>
      <span data-number>${element.number}</span>
      <span data-mass>${element.mass}</span>
      <span data-symbol aria-hidden="true">${element.symbol}</span>
      <b26-trigger value="${element.symbol}"><button>${element.name}</button></b26-trigger>
      <span data-kind>${GROUPS[element.group]}</span>
      <svg data-chevron aria-hidden="true" width="14" height="14" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </div>
    <b26-panel value="${element.symbol}">
      <div data-facts>
        <dl>
          <div><dt>Group</dt><dd>${element.column}</dd></div>
          <div><dt>Period</dt><dd>${element.period}</dd></div>
          <div><dt>At 20 °C</dt><dd>${element.phase}</dd></div>
          <div><dt>Electrons</dt><dd>${element.config}</dd></div>
        </dl>
        <p>${element.fact}</p>
      </div>
    </b26-panel>
  </b26-element>`

const html = `
<div data-poster>
  <header>
    <h2>Elements by family</h2>
    <p data-kicker>Periodic table, 8 of 118 elements</p>
    <p data-help>Each tile shows the atomic number, the atomic weight in u, the symbol, the name and the family. Press a tile to open its facts. Find in page opens a closed panel that holds the text you search for.</p>
  </header>
  <ul data-legend aria-label="Element families">
    ${Object.entries(GROUPS)
      .map(([key, label]) => `<li data-group="${key}"><span data-swatch></span>${label}</li>`)
      .join("")}
  </ul>
  <b26-poster aria-label="Chemical elements" default-value="Ne,Na">
    <div data-tiles>${ELEMENTS.map(tile).join("")}</div>
    <b26-notes aria-label="Mass notes">
      <p>Atomic weights are the IUPAC standard values in unified atomic mass units (u). Hydrogen, lithium and chlorine vary between natural samples, so their values are conventional.</p>
    </b26-notes>
  </b26-poster>
</div>
<p role="status" data-status>Open panels: Neon, Sodium.</p>
<div data-actions>
  <ui-button data-all><button>Open all panels</button></ui-button>
  <ui-button data-none><button>Close all panels</button></ui-button>
  <ui-button data-sources><button aria-expanded="false">Data sources</button></ui-button>
</div>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 800px; }
[data-stage] h2, [data-stage] p, [data-stage] dl, [data-stage] dd, [data-stage] ul { margin: 0; }
[data-stage] [data-poster] {
  display: grid; gap: 16px; padding: 24px; border: 2px solid var(--ui-foreground); border-radius: var(--ui-radius);
  background: var(--ui-background);
}
[data-stage] [data-poster] header { display: grid; gap: 4px; padding-bottom: 12px; border-bottom: 2px solid var(--ui-foreground); }
[data-stage] [data-kicker] { font-size: 0.875rem; font-weight: 600; }
[data-stage] h2 { font: 700 1.75rem/1.15 ui-serif, Georgia, "Times New Roman", serif; }
[data-stage] [data-help] { max-width: 60ch; font-size: 0.875rem; color: var(--ui-muted-foreground); }

[data-stage] [data-legend] { display: flex; flex-wrap: wrap; gap: 8px 16px; padding: 0; list-style: none; font-size: 0.8125rem; }
[data-stage] [data-legend] li { display: flex; align-items: center; gap: 6px; }
[data-stage] [data-swatch] { width: 14px; height: 14px; border-radius: 3px; background: var(--g); }

[data-stage] [data-group="alkali"] { --g: light-dark(#c2410c, #fb923c); --on-g: light-dark(#ffffff, #1a0e05); }
[data-stage] [data-group="noble"] { --g: light-dark(#7e22ce, #c084fc); --on-g: light-dark(#ffffff, #12071e); }
[data-stage] [data-group="halogen"] { --g: light-dark(#0f766e, #2dd4bf); --on-g: light-dark(#ffffff, #04201d); }
[data-stage] [data-group="nonmetal"] { --g: light-dark(#15803d, #4ade80); --on-g: light-dark(#ffffff, #052110); }
[data-stage] [data-group="transition"] { --g: light-dark(#1d4ed8, #60a5fa); --on-g: light-dark(#ffffff, #07142b); }

[data-stage] [data-tiles] { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: start; }
[data-stage] b26-element { min-width: 0; }
[data-stage] [data-tile] {
  position: relative; display: grid; grid-template-columns: auto 1fr; column-gap: 8px; row-gap: 2px; padding: 10px 12px 12px;
  border: 2px solid var(--g); border-radius: var(--ui-radius);
  background: color-mix(in srgb, var(--g) 16%, var(--ui-background)); color: var(--ui-foreground);
}
[data-stage] b26-element[data-open] [data-tile] { background: var(--g); color: var(--on-g); }
[data-stage] [data-number] { font-size: 0.875rem; font-weight: 700; }
[data-stage] [data-mass] { justify-self: end; font-size: 0.8125rem; font-variant-numeric: tabular-nums; }
[data-stage] [data-symbol] { grid-column: 1 / -1; font: 700 2.5rem/1.1 ui-serif, Georgia, "Times New Roman", serif; }
[data-stage] b26-trigger { display: contents; }
[data-stage] b26-trigger button {
  grid-column: 1 / -1; padding: 0; border: 0; background: none; color: inherit; font: inherit; font-size: 1rem; font-weight: 700;
  text-align: start; cursor: pointer;
}
[data-stage] b26-trigger button::after { content: ""; position: absolute; inset: 0; border-radius: var(--ui-radius); }
[data-stage] b26-trigger button:focus-visible { outline: none; }
[data-stage] b26-trigger button:focus-visible::after { outline: 3px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] [data-kind] { grid-column: 1 / 2; font-size: 0.8125rem; }
[data-stage] [data-chevron] { grid-column: 2; grid-row: 4; justify-self: end; align-self: end; width: 14px; height: 14px; transition: transform 200ms ease-out; }
[data-stage] b26-element[data-open] [data-chevron] { transform: rotate(180deg); }

[data-stage] b26-panel { display: block; transition: opacity 200ms ease-out; }
[data-stage] b26-panel[data-starting-style], [data-stage] b26-panel[data-ending-style] { opacity: 0; }
[data-stage] [data-facts] {
  display: grid; gap: 8px; margin-top: 6px; padding: 10px 12px; border: 1px solid var(--g); border-radius: var(--ui-radius);
  background: var(--ui-background); font-size: 0.8125rem; line-height: 1.4;
}
[data-stage] [data-facts] dl { display: grid; gap: 2px; }
[data-stage] [data-facts] dl div { display: flex; justify-content: space-between; gap: 8px; }
[data-stage] [data-facts] dt { color: var(--ui-muted-foreground); }
[data-stage] [data-facts] dd { text-align: end; font-variant-numeric: tabular-nums; }

[data-stage] b26-notes { display: block; margin-top: 12px; }
[data-stage] b26-notes p { padding: 10px 12px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); font-size: 0.8125rem; max-width: 60ch; }
[data-stage] [data-status] { font-size: 0.875rem; color: var(--ui-muted-foreground); }
[data-stage] [data-actions] { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 640px) { [data-stage] [data-tiles] { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: reduce) {
  [data-stage] b26-panel, [data-stage] [data-chevron] { transition: none; }
}
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const grid = root.querySelector<HTMLElement>("b26-poster")!
  const api = (grid as HTMLElement & { api: { showAll: () => void; hideAll: () => void; toggle: (key: string) => void } }).api
  const status = root.querySelector("[data-status]")!
  const sources = root.querySelector("[data-sources] button")!
  const summary = (open: string[]) => {
    const names = SYMBOLS.filter((symbol) => open.includes(symbol)).map(nameOf)
    return `${names.length ? `Open panels: ${names.join(", ")}.` : "No panel is open."}${open.includes(NOTES) ? " Data sources are shown." : ""}`
  }
  let open = ["Ne", "Na"]
  grid.addEventListener("valuechange", (event) => {
    const detail = (event as CustomEvent<{ value: string[]; reason: string }>).detail
    const found = detail.reason === "find-in-page" ? detail.value.find((key) => !open.includes(key)) : undefined
    open = detail.value
    sources.setAttribute("aria-expanded", String(open.includes(NOTES)))
    const opened = found === undefined ? "" : `Find in page opened ${found === NOTES ? "the data sources" : nameOf(found)}. `
    status.textContent = opened + summary(open)
  })
  root.querySelector("[data-all]")!.addEventListener("action", () => api.showAll())
  root.querySelector("[data-none]")!.addEventListener("action", () => api.hideAll())
  root.querySelector("[data-sources]")!.addEventListener("action", () => api.toggle(NOTES))
}

const ui: UI = {
  id: "B26",
  request: "Build a poster of 8 chemical elements. Each element is a tile in its family colour, and a press on the tile opens a panel of facts. Closed panels must open when a person searches the page with find in page.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Chemical elements", action: "toggle", args: ["Gold"] },
      { ref: "Chemical elements", action: "toggle", args: ["Chlorine"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Open panels: Neon, Sodium, Chlorine, Gold.",
  },
  breaks: [
    {
      broke: "A closed panel is hidden with no until-found value, so find in page cannot open it.",
      find: "isFindable: () => true,",
      replace: "isFindable: () => false,",
      caught: "keyboard: a closed panel is hidden until found, and an open panel is shown",
    },
    {
      broke: "A match in a closed panel no longer opens it.",
      find: "reveal: (event) => api.find(key, event),",
      replace: "reveal: () => {},",
      caught: "find: a beforematch event on a closed panel opens it, at once",
    },
    {
      broke: "The data sources are hidden with no until-found value.",
      find: "findable: () => true,",
      replace: "findable: () => false,",
      caught: "keyboard: a closed panel is hidden until found, and an open panel is shown",
    },
    {
      broke: "A match in the data sources no longer opens them.",
      find: "reveal: (event) => api.find(NOTES, event),",
      replace: "reveal: () => {},",
      caught: "find: a beforematch event on the data sources opens them with no panel",
    },
    {
      broke: "Space and Enter no longer open a panel.",
      find: "press: ({ api, key }, event) => api.toggle(key, event),",
      replace: "press: () => {},",
      caught: "keyboard: Space and Enter open and close a panel, and the panels are independent",
    },
    {
      broke: "The trigger no longer reports that its panel is open.",
      find: '"aria-expanded": String(state.value.includes(key)),',
      replace: '"aria-expanded": "false",',
      caught: "keyboard: a trigger reports its panel in aria-expanded and aria-controls",
    },
    {
      broke: "A panel that closes stays in the exiting list, so it stays shown.",
      find: "exited: () => store.set({ exiting: store.get().exiting.filter((item) => item !== key) }),",
      replace: "exited: () => {},",
      caught: "keyboard: a closed panel leaves the exiting list and is hidden until found again",
    },
  ],
}

export { poster }
export default ui
