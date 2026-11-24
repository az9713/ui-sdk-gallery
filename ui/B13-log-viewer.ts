import {
  byCell,
  type ChangeDetails,
  createChange,
  createGridFocus,
  createVirtualizer,
  definePrimitive,
  type GridCell,
  selects,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import type { UI } from "../src/ui"

type Reason = "item-press" | "imperative"
type Options = {
  count: number
  value?: number | null
  defaultValue?: number
  onValueChange?: (value: number | null, details: ChangeDetails<Reason>) => void
}
// count is an option that the rows render from, so the state has a copy: a part must not read an option.
type State = { count: number; active: GridCell | null; value: number | null }

const COLS = 3
const ROW_HEIGHT = 32

const logViewer = definePrimitive({
  name: "log-viewer",
  options: { count: "number", value: "number", defaultValue: "number", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    count: options.count,
    active: null,
    value: options.value ?? options.defaultValue ?? null,
  }),
  sync: (options) => ({ count: options.count, ...(options.value === undefined ? {} : { value: options.value }) }),
  api: (context) => {
    const change = createChange(context)
    const virtual = createVirtualizer({
      count: () => context.store.get().count,
      estimate: () => ROW_HEIGHT,
      // The row with the tab stop stays in the page wherever the list scrolls, so Tab and focus do not drop to the page.
      keep: () => [context.store.get().active?.row ?? 0],
    })
    const grid = createGridFocus(context, {
      key: "active",
      rows: () => context.store.get().count,
      cols: () => COLS,
      reveal: (cell) => virtual.scrollToIndex(cell.row),
    })
    const select = (line: number | string, event?: Event) => {
      const n = Number(line)
      const { count } = context.store.get()
      if (!Number.isInteger(n) || n < 1 || n > count) throw new Error(`No line ${line}. Lines go from 1 to ${count}.`)
      if (!event) virtual.scrollToIndex(n - 1, { align: "center" })
      return change("value", n, { reason: event ? "item-press" : "imperative", event })
    }
    return { grid, virtual, select }
  },
  slots: (slot) => ({
    root: slot({ role: "group" }),
    grid: slot({
      role: "grid",
      keys: { none: "Each cell handles the arrow keys." },
      attrs: (state) => ({ "aria-rowcount": String(state.count + 1), "aria-colcount": String(COLS) }),
    }),
    columns: slot({ role: "row", attrs: () => ({ "aria-rowindex": "1" }) }),
    column: slot<{ value: string }>({ role: "columnheader", props: { value: "string" } }),
    viewport: slot({ bind: (el, { api }) => api.virtual.connect(el) }),
    // Each row has its line number as its value: the key that tells 2 rows apart.
    row: slot<{ value: string }>({
      role: "row",
      props: { value: "string" },
      attrs: (state, { key }) => ({
        "aria-rowindex": String(Number(key) + 1),
        "aria-selected": String(state.value === Number(key)),
        "data-selected": state.value === Number(key) ? "" : undefined,
      }),
    }),
    cell: slot<GridCell & { value: string }>({
      role: "gridcell",
      focus: "roving",
      props: { value: "string", row: "number", col: "number" },
      selects: selects({ active: byCell }),
      attrs: (state, { props, api }) => ({ tabindex: api.grid.tabIndex(state, props) }),
      press: ({ api, props }, event) => void api.select(props.row + 1, event),
      on: {
        // A gridcell is not a button, so press hears only its clicks.
        keydown: (event, { api, props }) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault()
            api.select(props.row + 1, event)
          } else api.grid.keydown(event)
        },
        pointerdown: (event, { api, props }) => void api.grid.focus(props, { reason: "item-press", event }),
      },
      bind: (el, { api, props }) => api.grid.bind(el, props),
    }),
    rendered: slot({
      bind: (el, { api, store }) => {
        const show = () => {
          el.textContent = `${api.virtual.items().length} of ${store.get().count.toLocaleString("en-US")} lines are in the page.`
        }
        show()
        return api.virtual.subscribe(show)
      },
    }),
  }),
  agent: { actions: ["select"] },
})

const LEVELS = ["INFO", "INFO", "DEBUG", "INFO", "INFO", "WARN", "INFO", "DEBUG", "INFO", "INFO", "INFO", "ERROR"]
const MESSAGES: Record<string, ((n: number) => string)[]> = {
  INFO: [
    (n) => `GET /api/orders/${n % 9000} 200 in ${(n % 180) + 12} ms`,
    (n) => `User ${(n % 4000) + 100} signed in`,
    (n) => `Job ${n % 7000} finished in ${(n % 40) + 1} s`,
    (n) => `POST /api/carts 201 in ${(n % 90) + 20} ms`,
  ],
  DEBUG: [(n) => `Pool has ${n % 32} free connections`, (n) => `Cache hit for product ${n % 5000}`],
  WARN: [(n) => `Slow query on orders: ${(n % 900) + 600} ms`, (n) => `Retry ${(n % 3) + 1} of 3 for webhook ${n % 800}`],
  ERROR: [(n) => `Payment ${n % 60000} failed: card declined`, () => "Timeout calling inventory after 5000 ms"],
}
const hash = (i: number) => (Math.imul(i + 1, 2654435761) >>> 0) % 997
const two = (n: number) => String(n).padStart(2, "0")

// A line is a pure function of its index, so 100,000 lines need no array.
function entry(index: number) {
  const ms = index * 864
  const s = Math.floor(ms / 1000)
  const time = `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}.${String(ms % 1000).padStart(3, "0")}`
  const level = LEVELS[hash(index) % LEVELS.length]
  const messages = MESSAGES[level]
  return { time, level, message: messages[hash(index * 7) % messages.length](hash(index * 13) * 61 + index) }
}

function rowElement(doc: Document, index: number) {
  const { time, level, message } = entry(index)
  const row = doc.createElement("b13-row")
  row.setAttribute("value", String(index + 1))
  row.setAttribute("data-level", level.toLowerCase())
  ;[time, level, message].forEach((text, col) => {
    const cell = doc.createElement("b13-cell")
    cell.setAttribute("value", `${index}:${col}`)
    cell.setAttribute("row", String(index))
    cell.setAttribute("col", String(col))
    cell.textContent = text
    row.append(cell)
  })
  return row
}

createParts(logViewer, {
  root: {
    tag: "b13-log-viewer",
    display: "block",
    // The web renderer does not render a list from data, so the root puts the rows that the virtualizer names in the page.
    render: (el, instance) => {
      const { virtual } = instance.api as { virtual: ReturnType<typeof createVirtualizer> }
      const box = el.querySelector<HTMLElement>("[data-rows]")!
      const update = () => {
        box.style.height = `${virtual.size()}px`
        const items = virtual.items()
        const wanted = new Set(items.map((item) => String(item.index + 1)))
        for (const row of [...box.children]) if (!wanted.has(row.getAttribute("value")!)) row.remove()
        for (const item of items) {
          const line = item.index + 1
          let row = box.querySelector<HTMLElement>(`:scope > [value="${line}"]`)
          if (!row) {
            row = rowElement(el.ownerDocument, item.index)
            // Rows stay in line order, and a row that is in the page never moves, so the focused cell keeps focus.
            const next = [...box.children].find((child) => Number(child.getAttribute("value")) > line) ?? null
            box.insertBefore(row, next)
          }
          row.style.transform = `translateY(${item.start}px)`
        }
      }
      update()
      return virtual.subscribe(update)
    },
  },
  grid: { tag: "b13-grid", display: "block" },
  columns: "b13-columns",
  column: "b13-column",
  viewport: { tag: "b13-viewport", display: "block" },
  row: "b13-row",
  cell: "b13-cell",
  rendered: "b13-rendered",
})

const COUNT = 100_000
const format = (n: number) => n.toLocaleString("en-US")

const html = `
<h2>api-gateway, 24 November</h2>
<p data-hint>Arrow keys move between cells. Page Up and Page Down move 10 lines. Control with Home or End goes to the first or the last line. Enter selects a line.</p>
<b13-log-viewer aria-label="Server log" count="${COUNT}">
  <b13-grid aria-label="Log lines">
    <b13-columns><b13-column value="time">Time</b13-column><b13-column value="level">Level</b13-column><b13-column value="message">Message</b13-column></b13-columns>
    <b13-viewport><div data-rows></div></b13-viewport>
  </b13-grid>
  <p data-rendered><b13-rendered></b13-rendered></p>
</b13-log-viewer>
<p role="status" data-status>No line is selected.</p>`

const css = `
[data-stage] { display: grid; gap: 12px; max-width: 46rem; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] [data-hint], [data-stage] [data-rendered], [data-stage] [data-status] { max-width: 60ch; font-size: 0.875rem; }
[data-stage] [data-hint], [data-stage] [data-rendered] { color: var(--ui-muted-foreground); }
[data-stage] b13-log-viewer { display: grid; gap: 8px; }
[data-stage] b13-grid {
  border: 1px solid var(--ui-border); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground);
}
[data-stage] b13-columns, [data-stage] b13-row {
  display: grid; grid-template-columns: 8rem 4.5rem 1fr; align-items: center; height: ${ROW_HEIGHT}px;
}
[data-stage] b13-columns { border-bottom: 1px solid var(--ui-border); font-size: 0.8125rem; font-weight: 600; }
[data-stage] b13-column, [data-stage] b13-cell { padding: 0 10px; white-space: nowrap; }
[data-stage] b13-viewport { height: ${ROW_HEIGHT * 10}px; overflow-y: auto; }
[data-stage] [data-rows] { position: relative; }
[data-stage] b13-row {
  position: absolute; top: 0; left: 0; right: 0;
  font-family: var(--ui-font-mono); font-size: 0.8125rem; background: var(--ui-background);
}
[data-stage] b13-cell { line-height: ${ROW_HEIGHT}px; cursor: default; }
[data-stage] b13-cell:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: -2px; }
[data-stage] b13-row[data-level="warn"] b13-cell:nth-child(2) { font-weight: 700; }
[data-stage] b13-row[data-level="error"] b13-cell:nth-child(2) { color: var(--ui-destructive); font-weight: 700; }
[data-stage] b13-row[data-selected] { background: var(--ui-muted); box-shadow: inset 3px 0 var(--ui-primary); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  root.querySelector("b13-log-viewer")!.addEventListener("valuechange", (event) => {
    const line = (event as CustomEvent<{ value: number }>).detail.value
    const { time, level, message } = entry(line - 1)
    status.textContent = `Line ${format(line)} selected: ${time} ${level} ${message}`
  })
}

const TARGET = 87_412

const ui: UI = {
  id: "B13",
  request:
    "Build a log viewer for 100,000 lines that renders only the visible rows, with arrow keys, Page Up, Page Down and Control+End to move, and Enter to select a line.",
  css,
  mount,
  task: {
    steps: [{ ref: "Server log", action: "select", args: [TARGET] }],
    done: (root) => root.querySelector("[data-status]")!.textContent!.startsWith(`Line ${format(TARGET)} selected:`),
  },
  breaks: [
    {
      broke: "Rows that scroll out of view stay in the page.",
      find: "for (const row of [...box.children]) if (!wanted.has(row.getAttribute(\"value\")!)) row.remove()",
      replace: "",
      caught: "keyboard: on the page, only the visible rows are in it, and Control+End brings in line 100,000",
    },
    {
      broke: "A key move to a line that is not rendered does not bring it in first.",
      find: "reveal: (cell) => virtual.scrollToIndex(cell.row),",
      replace: "",
      caught: "keyboard: on the page, only the visible rows are in it, and Control+End brings in line 100,000",
    },
    {
      broke: "The focused row leaves the page when the list scrolls away.",
      find: "keep: () => [context.store.get().active?.row ?? 0],",
      replace: "",
      caught: "keyboard: on the page, the focused row stays in the page when the list scrolls away",
    },
    {
      broke: "Space and Enter no longer select a line.",
      find: 'if (event.key === " " || event.key === "Enter") {',
      replace: "if (false) {",
      caught: "keyboard: Space and Enter select the line of the focused cell, and a click selects too",
    },
    {
      broke: "A row no longer gives its place among the 100,000 lines.",
      find: '"aria-rowindex": String(Number(key) + 1),',
      replace: "",
      caught: "aria: the grid counts every line with its header row, and each row gives its place",
    },
    {
      broke: "An agent can select a line that is not in the log.",
      find: "if (!Number.isInteger(n) || n < 1 || n > count) throw",
      replace: "if (false) throw",
      caught: "agent: an agent selects line 87,412, which is not rendered, and a line outside the log is refused",
    },
  ],
}

export { entry, logViewer }
export default ui
