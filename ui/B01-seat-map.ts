import {
  byCell,
  type ChangeDetails,
  createChange,
  createGridFocus,
  createSelection,
  definePrimitive,
  type GridCell,
  selects,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import type { UI } from "../src/ui"

type Reason = "item-press" | "list-navigation" | "imperative"
type Options = {
  rows: number
  cols: number
  taken?: string[]
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[], details: ChangeDetails<Reason>) => void
}
// rows, cols and taken are options that a seat renders from, so the state has a copy: a part must not read an option.
type State = { active: GridCell | null; value: string[]; taken: string[]; rows: number; cols: number }

const seatId = ({ row, col }: GridCell) => `${String.fromCharCode(65 + row)}${col + 1}`

const seatMap = definePrimitive({
  name: "seat-map",
  options: { rows: "number", cols: "number", taken: "list", value: "list", defaultValue: "list", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    active: null,
    value: options.value ?? options.defaultValue ?? [],
    taken: options.taken ?? [],
    rows: options.rows,
    cols: options.cols,
  }),
  sync: (options) => ({
    rows: options.rows,
    cols: options.cols,
    taken: options.taken ?? [],
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: (context) => {
    const change = createChange(context)
    const free = (id: string) => !context.store.get().taken.includes(id)
    const seats = () => {
      const { rows, cols } = context.store.get()
      return Array.from({ length: rows * cols }, (_, i) => seatId({ row: Math.floor(i / cols), col: i % cols })).filter(free)
    }
    const selection = createSelection(context, {
      key: "value",
      set: (value, details) => change("value", value, details),
      order: seats,
      multiple: () => true,
      selectable: free,
    })
    const grid = createGridFocus(context, {
      key: "active",
      rows: () => context.store.get().rows,
      cols: () => context.store.get().cols,
      disabled: (cell) => !free(seatId(cell)),
      onMove: (cell, { from, shift, reason, event }) => {
        if (shift && from && reason === "list-navigation")
          selection.extend(seatId(cell), { from: seatId(from), reason, event })
      },
    })
    return {
      grid,
      seats,
      toggle: (id: string, event?: Event) => selection.toggle(id, { reason: event ? "item-press" : "imperative", event }),
      clear: () => change("value", [], { reason: "imperative" }),
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "grid",
      keys: { none: "Each seat handles the arrow keys." },
      attrs: () => ({ "aria-multiselectable": "true" }),
    }),
    row: slot({ role: "row" }),
    // Each seat has a value, like "B3": it is the key that tells 2 parts of this slot apart.
    seat: slot<GridCell & { value: string }>({
      role: "gridcell",
      focus: "roving",
      props: { value: "string", row: "number", col: "number" },
      selects: selects({ active: byCell, value: ({ key }) => [key] }),
      attrs: (state, { key, props, api }) => {
        const taken = state.taken.includes(key)
        const selected = state.value.includes(key)
        return {
          tabindex: api.grid.tabIndex(state, props),
          "aria-selected": taken ? undefined : String(selected),
          "aria-disabled": taken ? "true" : undefined,
          "data-selected": selected ? "" : undefined,
          "data-taken": taken ? "" : undefined,
        }
      },
      press: ({ api, key }, event) => api.toggle(key, event),
      on: {
        // A gridcell is not a button, so press hears only its clicks.
        keydown: (event, { api, key }) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault()
            api.toggle(key, event)
          } else api.grid.keydown(event)
        },
        pointerdown: (event, { api, props }) => void api.grid.focus(props, { reason: "item-press", event }),
      },
      bind: (el, { api, props }) => api.grid.bind(el, props),
    }),
  }),
  agent: { actions: ["toggle", "clear"], items: (api) => api.seats().map((id) => ({ value: id, label: id })) },
})

createParts(seatMap, { root: "b01-seat-map", row: "b01-seat-row", seat: "b01-seat" })

const ROWS = 5
const COLS = 8
const TAKEN = ["A4", "A5", "C1", "C2", "D6"]

const html = `
<h2>Screen 2, 19:30</h2>
<b01-seat-map aria-label="Seat map" rows="${ROWS}" cols="${COLS}" taken="${TAKEN}">
  ${Array.from(
    { length: ROWS },
    (_, row) => `<b01-seat-row>${Array.from(
      { length: COLS },
      (_, col) => `<b01-seat value="${seatId({ row, col })}" row="${row}" col="${col}">${seatId({ row, col })}</b01-seat>`,
    ).join("")}</b01-seat-row>`,
  ).join("")}
</b01-seat-map>
<p data-legend><span data-key="free">Free</span><span data-key="selected">Selected</span><span data-key="taken">Taken</span></p>
<p role="status" data-status>No seat is selected.</p>
<ui-button data-book><button>Book seats</button></ui-button>`

const css = `
[data-stage] { display: grid; gap: 20px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] b01-seat-map { display: grid; gap: 8px; }
[data-stage] b01-seat-row { display: flex; gap: 8px; }
[data-stage] b01-seat, [data-stage] [data-key] {
  display: grid; place-items: center; width: 44px; height: 40px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  font-size: 0.8125rem; cursor: pointer; user-select: none;
}
[data-stage] b01-seat:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b01-seat[data-selected], [data-stage] [data-key="selected"] {
  border-color: var(--ui-primary); background: var(--ui-primary); color: var(--ui-primary-foreground); font-weight: 600;
}
[data-stage] b01-seat[data-taken], [data-stage] [data-key="taken"] {
  border-color: var(--ui-muted); background: var(--ui-muted); color: var(--ui-muted-foreground);
  text-decoration: line-through; cursor: default;
}
[data-stage] [data-legend] { display: flex; gap: 8px; }
[data-stage] [data-key] { width: auto; padding: 0 12px; cursor: default; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  let seats: string[] = []
  const list = () => [...seats].sort().join(", ")
  root.querySelector("b01-seat-map")!.addEventListener("valuechange", (event) => {
    seats = (event as CustomEvent<{ value: string[] }>).detail.value
    status.textContent = seats.length ? `Selected: ${list()}.` : "No seat is selected."
  })
  root.querySelector("[data-book]")!.addEventListener("action", () => {
    status.textContent = seats.length ? `Booked: ${list()}.` : "Select a seat first."
  })
}

const ui: UI = {
  id: "B01",
  request: "Build a cinema seat map: arrow keys move between seats, taken seats are skipped, and a person can select more than 1 seat.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Seat map", action: "toggle", args: ["C4"] },
      { ref: "Seat map", action: "toggle", args: ["C5"] },
      { ref: "Book seats", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Booked: C4, C5.",
  },
}

export { seatMap }
export default ui
