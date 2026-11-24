import {
  type ChangeDetails,
  createChange,
  createRovingFocus,
  definePrimitive,
  elements,
  nearestInDirection,
  type SpatialRect,
  spatialMove,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import type { UI } from "../src/ui"

type Reason = "item-press" | "imperative"
type Options = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, details: ChangeDetails<Reason>) => void
}
type State = { focused: string | null; value: string | null }
type CellProps = { value: string; name: string; number: number; group: number }

const DIRECTIONS: Record<string, readonly [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
}
const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: DIRECTIONS.left,
  ArrowRight: DIRECTIONS.right,
  ArrowUp: DIRECTIONS.up,
  ArrowDown: DIRECTIONS.down,
}
type Box = { key: string; rect: SpatialRect }
const inLine = (a: SpatialRect, b: SpatialRect, [x]: readonly [number, number]) =>
  x !== 0 ? a.top < b.bottom && b.top < a.bottom : a.left < b.right && b.left < a.right

// The arrow keys and selectNeighbor both measure the cells, so they follow the table as it is drawn.
// The search alone sends Right from H to V, closer than He across the gap, so an element in the same row or column comes first.
const periodicTable = definePrimitive({
  name: "periodic-table",
  options: { value: "string", defaultValue: "string", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({ focused: null, value: options.value ?? options.defaultValue ?? null }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    const cells = () => elements<CellProps>(context, "cell")
    const symbols = () => cells().map((cell) => cell.key)
    const boxes = (from: string) => {
      const all: Box[] = cells().map(({ el, key }) => ({ key, rect: el.getBoundingClientRect() }))
      const start = all.find((box) => box.key === from)
      if (!start) throw new Error(`No element "${from}" in the table.`)
      return { start: start.rect, others: all.filter((box) => box.key !== from) }
    }
    const ahead = (from: string, vector: readonly [number, number]) => {
      const { start, others } = boxes(from)
      return nearestInDirection(start, others.filter((box) => inLine(start, box.rect, vector)), vector)
    }
    const neighbor = (from: string, direction: string) => {
      const vector = DIRECTIONS[direction]
      if (!vector) throw new Error(`No direction "${direction}". Directions: ${Object.keys(DIRECTIONS).join(", ")}.`)
      const { start, others } = boxes(from)
      return ahead(from, vector) ?? nearestInDirection(start, others, vector)
    }
    const spatial = spatialMove()
    const roving = createRovingFocus<State, CellProps>(context, {
      slot: "cell",
      key: "focused",
      move: (event, moving) => {
        const vector = ARROWS[event.key]
        const modified = event.altKey || event.ctrlKey || event.metaKey
        return (vector && !modified ? ahead(moving.from.key, vector) : undefined) ?? spatial(event, moving)
      },
    })
    const pick = (value: string, reason: Reason, event?: Event) => {
      if (!symbols().includes(value)) throw new Error(`No element "${value}". Use a symbol or a name, like "Fe" or "Iron".`)
      return change("value", value, { reason, event })
    }
    const symbolOf = (name: string) =>
      cells().find((cell) => cell.key === name || cell.props.name.toLowerCase() === String(name).toLowerCase())?.key ?? name
    return {
      roving,
      items: () => cells().map(({ key, props }) => ({ value: key, label: props.name })),
      neighbors: (from: string) =>
        Object.fromEntries(Object.keys(DIRECTIONS).map((direction) => [direction, neighbor(from, direction)])),
      setValue: (value: string) => pick(symbolOf(value), "imperative"),
      selectNeighbor: (direction: string) => {
        const { value } = context.store.get()
        if (!value) throw new Error('Select an element first, like setValue("Iron").')
        const next = neighbor(value, String(direction).toLowerCase())
        if (!next) throw new Error(`No element lies ${direction} of ${value}.`)
        return pick(next, "imperative")
      },
      press: (value: string, event?: Event) => void pick(value, "item-press", event),
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "grid",
      keys: { none: "Each cell handles the arrow keys." },
      attrs: () => ({ "aria-colcount": "18" }),
    }),
    row: slot({ role: "row" }),
    cell: slot<CellProps>({
      role: "gridcell",
      focus: "roving",
      props: { value: "string", name: "string", number: "number", group: "number" },
      attrs: (state, { key, props, api }) => ({
        tabindex: api.roving.tabIndex(state, { key, props }),
        "aria-label": `${props.number} ${key} ${props.name}`,
        "aria-colindex": String(props.group),
        "aria-selected": String(state.value === key),
        "data-selected": state.value === key ? "" : undefined,
      }),
      press: ({ api, key }, event) => api.press(key, event),
      on: {
        // A gridcell is not a button, so press hears only its clicks.
        keydown: (event, { el, api, key }) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault()
            api.press(key, event)
          } else api.roving.keydown(event, el!)
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
  // Not closed: the bridge would then check the direction of selectNeighbor against the elements.
  agent: { actions: ["setValue", "selectNeighbor"], items: (api) => api.items() },
})

createParts(periodicTable, {
  root: { tag: "b18-table", display: "block", api: ["neighbors"] },
  row: { tag: "b18-period", display: "block" },
  cell: { tag: "b18-cell", display: "block" },
})

const SYMBOLS =
  "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe".split(" ")
const NAMES = (
  "Hydrogen Helium Lithium Beryllium Boron Carbon Nitrogen Oxygen Fluorine Neon Sodium Magnesium Aluminium Silicon " +
  "Phosphorus Sulfur Chlorine Argon Potassium Calcium Scandium Titanium Vanadium Chromium Manganese Iron Cobalt Nickel " +
  "Copper Zinc Gallium Germanium Arsenic Selenium Bromine Krypton Rubidium Strontium Yttrium Zirconium Niobium Molybdenum " +
  "Technetium Ruthenium Rhodium Palladium Silver Cadmium Indium Tin Antimony Tellurium Iodine Xenon"
).split(" ")
const SHORT = [1, 2, 13, 14, 15, 16, 17, 18]
const LONG = Array.from({ length: 18 }, (_, i) => i + 1)
const ATOMS = [[1, 18], SHORT, SHORT, LONG, LONG]
  .flatMap((groups, row) => groups.map((group) => ({ group, period: row + 1 })))
  .map((place, i) => ({ ...place, number: i + 1, symbol: SYMBOLS[i], name: NAMES[i] }))

const cell = (atom: (typeof ATOMS)[number]) =>
  `<b18-cell value="${atom.symbol}" name="${atom.name}" number="${atom.number}" group="${atom.group}"><small>${atom.number}</small> <b>${atom.symbol}</b></b18-cell>`

const html = `
<h2>Periodic table, periods 1 to 5</h2>
<b18-table aria-label="Elements">
  ${[1, 2, 3, 4, 5]
    .map((period) => `<b18-period>${ATOMS.filter((atom) => atom.period === period).map(cell).join("")}</b18-period>`)
    .join("")}
</b18-table>
<p data-hint>The arrow keys go to the nearest element on screen, across the gaps. Space or Enter selects it.</p>
<div data-detail hidden>
  <b data-symbol></b>
  <span><strong data-name></strong> <span data-facts></span></span>
  <span data-near></span>
</div>
<p role="status" data-status>No element is selected.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] b18-table { display: grid; gap: 4px; }
[data-stage] b18-period { display: grid; grid-template-columns: repeat(18, 56px); gap: 4px; }
[data-stage] b18-cell {
  display: grid; grid-template-rows: auto 1fr; height: 56px; box-sizing: border-box; padding: 3px 5px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius); background: var(--ui-background); color: var(--ui-foreground);
  cursor: pointer; user-select: none;
}
${LONG.map((group) => `[data-stage] b18-cell[aria-colindex="${group}"] { grid-column: ${group}; }`).join("\n")}
[data-stage] b18-cell:is(${LONG.slice(2, 12).map((group) => `[aria-colindex="${group}"]`).join(", ")}) { background: var(--ui-muted); }
[data-stage] b18-cell small { font-size: 0.6875rem; line-height: 1; color: var(--ui-muted-foreground); }
[data-stage] b18-cell b { align-self: center; justify-self: center; font-size: 1.125rem; line-height: 1; }
[data-stage] b18-cell[data-selected] { border-color: var(--ui-primary); background: var(--ui-primary); color: var(--ui-primary-foreground); }
[data-stage] b18-cell[data-selected] small { color: inherit; }
[data-stage] b18-cell:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] [data-detail]:not([hidden]) {
  display: grid; grid-template-columns: 64px auto; grid-template-rows: auto auto; gap: 4px 16px; align-items: center;
}
[data-stage] [data-symbol] {
  grid-row: span 2; display: grid; place-items: center; height: 64px; border-radius: var(--ui-radius);
  background: var(--ui-primary); color: var(--ui-primary-foreground); font-size: 1.5rem;
}
[data-stage] [data-near], [data-stage] [data-hint], [data-stage] [data-status] { max-width: 60ch; color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const table = root.querySelector("b18-table") as HTMLElement & {
    api: { neighbors: (from: string) => Record<string, string | undefined> }
  }
  const status = root.querySelector("[data-status]")!
  const detail = root.querySelector<HTMLElement>("[data-detail]")!
  const text = (selector: string, value: string) => (detail.querySelector(selector)!.textContent = value)
  table.addEventListener("valuechange", (event) => {
    const atom = ATOMS.find((item) => item.symbol === (event as CustomEvent<{ value: string }>).detail.value)!
    const near = Object.entries(table.api.neighbors(atom.symbol))
    detail.hidden = false
    text("[data-symbol]", atom.symbol)
    text("[data-name]", atom.name)
    text("[data-facts]", `Atomic number ${atom.number}, group ${atom.group}, period ${atom.period}.`)
    text("[data-near]", `Nearest on screen: ${near.map(([direction, key]) => `${direction} ${key ?? "none"}`).join(", ")}.`)
    status.textContent = `Selected: ${atom.name} (${atom.symbol}), number ${atom.number}.`
  })
}

const ui: UI = {
  id: "B18",
  request:
    "Build a periodic table where the arrow keys go to the nearest element on screen, across the gaps of the table, and Space or Enter selects it.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Elements", action: "setValue", args: ["Iron"] },
      { ref: "Elements", action: "selectNeighbor", args: ["down"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Selected: Ruthenium (Ru), number 44.",
  },
  breaks: [
    {
      broke: "The arrow keys no longer prefer an element in the same row or column.",
      find: "(vector && !modified ? ahead(moving.from.key, vector) : undefined) ?? ",
      replace: "",
      caught: "keyboard: an arrow key moves focus to the nearest element on screen, across the gaps of the table",
    },
    {
      broke: "With nothing in line, the arrow keys and Home and End no longer measure the screen.",
      find: "?? spatial(event, moving)",
      replace: "?? undefined",
      caught: "keyboard: Home and End go to the first and last element, and with nothing in line an arrow takes the nearest element that way",
    },
    {
      broke: "Space and Enter no longer select an element.",
      find: 'if (event.key === " " || event.key === "Enter") {',
      replace: "if (false) {",
      caught: "keyboard: Space and Enter select the focused element, and the arrow keys do not",
    },
    {
      broke: "selectNeighbor down looks up.",
      find: "down: [0, 1],",
      replace: "down: [0, -1],",
      caught: "agent: selectNeighbor selects the nearest element on screen in a direction and leaves focus where it is",
    },
    {
      broke: "The table has 1 tab stop for each element.",
      find: "tabindex: api.roving.tabIndex(state, { key, props }),",
      replace: 'tabindex: "0",',
      caught: "keyboard: the table is 1 tab stop, and only the selected element is marked selected",
    },
    {
      broke: "The selected element is not marked selected.",
      find: '"aria-selected": String(state.value === key),',
      replace: '"aria-selected": "false",',
      caught: "keyboard: the table is 1 tab stop, and only the selected element is marked selected",
    },
  ],
}

export { ATOMS, periodicTable }
export default ui
