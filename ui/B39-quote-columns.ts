import {
  type ChangeDetails,
  bindDrag,
  createChange,
  createReorder,
  createRovingFocus,
  css,
  definePrimitive,
  dragThreshold,
  isRTL,
  keepFocus,
  type ReorderDraft,
  type ReorderReason,
  settleDraft,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import { area, extent, line, scaleLinear } from "d3"
import type { UI } from "../src/ui"

type WidthReason = "drag" | "step-key" | "imperative"
type Options = {
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[], details: ChangeDetails<ReorderReason>) => void
  widths?: string[]
  defaultWidths?: string[]
  onWidthsChange?: (value: string[], details: ChangeDetails<WidthReason>) => void
}
type Sizing = { key: string; width: number }
type State = {
  active: string | null
  value: string[]
  moving: ReorderDraft | null
  widths: string[]
  sizing: Sizing | null
}

const MIN = 64
const MAX = 320
const STEP = 8
const FALLBACK = 120

// Widths travel as "key:px" items, so a list attribute can hold them.
const parseWidths = (list: string[]) =>
  Object.fromEntries(list.map((item) => item.split(":")).map(([key, px]) => [key, Number(px)])) as Record<string, number>
const clamp = (width: number) => Math.round(Math.min(MAX, Math.max(MIN, width)))
const withWidth = (list: string[], key: string, width: number) => {
  const widths = { ...parseWidths(list), [key]: clamp(width) }
  return Object.entries(widths).map(([column, px]) => `${column}:${px}`)
}
const widthOf = (state: State, key: string) =>
  state.sizing?.key === key ? state.sizing.width : (parseWidths(state.widths)[key] ?? FALLBACK)

const quoteTable = definePrimitive({
  name: "quote-table",
  options: {
    value: "list",
    defaultValue: "list",
    onValueChange: "callback",
    widths: "list",
    defaultWidths: "list",
    onWidthsChange: "callback",
  },
  controlled: ["value", "widths"],
  state: (options: Options): State => ({
    active: null,
    value: options.value ?? options.defaultValue ?? [],
    moving: null,
    widths: options.widths ?? options.defaultWidths ?? [],
    sizing: null,
  }),
  sync: (options) => ({
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.widths === undefined ? {} : { widths: options.widths }),
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const reorder = createReorder(context, {
      slot: "column",
      key: "value",
      draft: "moving",
      orientation: () => "horizontal",
      set: (value, details) => change("value", value, details),
    })
    const roving = createRovingFocus(context, { slot: "column", key: "active", orientation: () => "horizontal" })
    const order = () => reorder.order(store.get())
    const known = (key: string) => {
      if (!order().includes(key)) throw new Error(`No column "${key}". Columns: ${order().join(", ")}.`)
    }
    const resize = (key: string, width: number, details: { reason: WidthReason; event?: Event }) =>
      change("widths", withWidth(store.get().widths, key, width), details)
    let stop: (() => void) | undefined
    context.onDestroy(() => stop?.())
    return {
      reorder,
      roving,
      order,
      columns: () =>
        order().map((key) => ({ value: key, label: context.element("column", key)?.textContent?.trim() || key })),
      moveColumn: (key: string, index: number) => {
        known(key)
        if (!Number.isInteger(index) || index < 0 || index >= order().length)
          throw new Error(`Index ${index} is outside 0 to ${order().length - 1}.`)
        return reorder.move(key, index)
      },
      resizeColumn: (key: string, width: number) => {
        known(key)
        if (!Number.isFinite(width)) throw new Error(`Width "${width}" is not a number of pixels.`)
        return resize(key, width, { reason: "imperative" })
      },
      // Shift with Left or Right resizes the focused column. The edge that moves is the end edge, so right to left flips the keys.
      resizeKey(event: KeyboardEvent, key: string, el: HTMLElement) {
        if (!event.shiftKey || store.get().moving || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return false
        event.preventDefault()
        const wider = (event.key === "ArrowRight") !== isRTL(el)
        resize(key, widthOf(store.get(), key) + (wider ? STEP : -STEP), { reason: "step-key", event })
        return true
      },
      gripDown(event: PointerEvent, key: string, el: HTMLElement) {
        if (event.button !== 0) return
        // A handled press does not start a move of the column around the grip.
        event.preventDefault()
        stop?.()
        const start = widthOf(store.get(), key)
        const from = event.clientX
        const rtl = isRTL(el)
        stop = bindDrag(el, event, {
          threshold: dragThreshold,
          cancelOnEscape: true,
          onMove: ({ x }) => store.set({ sizing: { key, width: clamp(start + (rtl ? from - x : x - from)) } }),
          onEnd: (_end, canceled) => {
            const draft = store.get().sizing
            if (canceled || !draft) return void store.set({ sizing: null })
            const before = store.get().widths
            resize(key, draft.width, { reason: "drag", event })
            const clear = () => void (store.get().sizing === draft && store.set({ sizing: null }))
            settleDraft(store, () => store.get().widths, before, clear)
          },
        })
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state, { api }) => {
        const keys = api.reorder.order(state)
        const vars = Object.fromEntries(keys.map((key) => [`--column-${key}`, `${widthOf(state, key)}px`]))
        const total = keys.reduce((sum, key) => sum + widthOf(state, key), 0)
        return { style: css({ ...vars, "--columns-width": `${total}px` }) }
      },
      // Cells that carry data-column, like a table's, follow the column order the state shows.
      bind: (el, { api, store }) => {
        const place = () => {
          const order = api.order()
          const rows = new Set([...el.querySelectorAll("[data-column]")].map((cell) => cell.parentElement!))
          for (const row of rows) {
            const cells = [...row.children].filter((cell) => cell.hasAttribute("data-column"))
            const sorted = order.map((key) => cells.find((cell) => cell.getAttribute("data-column") === key)).filter((cell) => !!cell)
            if (!sorted.every((cell, i) => cell === cells[i])) for (const cell of sorted) row.append(cell)
          }
        }
        place()
        return store.subscribe(place)
      },
    }),
    bar: slot({
      role: "listbox",
      keys: { none: "Each column handles the arrow keys." },
      attrs: () => ({ "aria-orientation": "horizontal", "aria-roledescription": "column order" }),
      bind: (el, { api, store }) => {
        const place = () => {
          const columns = [...el.children].filter((child) => child.hasAttribute("value")) as HTMLElement[]
          const sorted = api.order().map((key) => columns.find((column) => column.getAttribute("value") === key)!)
          if (sorted.some((column) => !column) || sorted.every((column, i) => column === columns[i])) return
          const focused = sorted.find((column) => column === document.activeElement)
          for (const column of sorted) el.append(column)
          if (focused) keepFocus(() => focused)
        }
        return store.subscribe(place)
      },
    }),
    column: slot<{ value: string }>({
      role: "option",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, { key, props, api }) => ({
        tabindex: api.roving.tabIndex(state, { key, props }),
        "aria-selected": String(api.reorder.moving(state, key)),
        "aria-roledescription": "movable column",
        "data-grabbed": api.reorder.moving(state, key) ? "" : undefined,
        "data-dragging": api.reorder.dragging(state, key) ? "" : undefined,
        "data-resizing": state.sizing?.key === key ? "" : undefined,
      }),
      press: { none: "Space or Enter picks a column up, and the keydown handler does it." },
      on: {
        keydown: (event, { el, api, key }) =>
          void (api.resizeKey(event, key, el!) || api.reorder.keydown(event, key) || api.roving.keydown(event, el!)),
        pointerdown: (event, { api, key }) => api.reorder.pointerdown(event, key),
      },
      bind: (el, part) => {
        const cleanups = [part.api.roving.bind(el, part), part.api.reorder.bind(el, part)]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
    grip: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { key }) => ({ "data-resizing": state.sizing?.key === key ? "" : undefined }),
      on: { pointerdown: (event, { el, api, key }) => api.gripDown(event, key, el!) },
    }),
  }),
  agent: { actions: ["moveColumn", "resizeColumn"], items: (api) => api.columns() },
})

createParts(quoteTable, {
  root: { tag: "b39-quote-table", display: "block" },
  bar: { tag: "b39-columns", display: "block" },
  column: { tag: "b39-column", display: "block" },
  grip: { tag: "b39-grip", display: "block" },
})

type Column = { key: string; label: string; width: number; end?: boolean }
const COLUMNS: Column[] = [
  { key: "symbol", label: "Symbol", width: 88 },
  { key: "name", label: "Company", width: 196 },
  { key: "last", label: "Last", width: 96, end: true },
  { key: "change", label: "Change", width: 96, end: true },
  { key: "volume", label: "Volume", width: 96, end: true },
  { key: "pe", label: "P/E", width: 72, end: true },
  { key: "trend", label: "30-day trend", width: 156 },
]
const KEYS = COLUMNS.map((column) => column.key)
const labelOf = (key: string) => COLUMNS.find((column) => column.key === key)?.label ?? key

const STOCKS: [string, string, number, number][] = [
  ["NWND", "Northwind Systems", 142, 28.4],
  ["KSTR", "Kestrel Energy", 61, 11.2],
  ["ALDR", "Alder Biotech", 38, 54.7],
  ["MRDN", "Meridian Bank", 47, 9.8],
  ["QUAY", "Quayside Retail", 23, 17.5],
  ["HLIX", "Helix Semis", 215, 36.1],
  ["BRCH", "Birch Logistics", 84, 21.3],
  ["ORRY", "Orrery Aerospace", 129, 31.9],
]

// Mulberry32: the same 30 closes on each run.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

type Quote = { symbol: string; name: string; closes: number[]; change: number; volume: number; pe: number }
const quotes = (): Quote[] => {
  const next = seeded(39)
  return STOCKS.map(([symbol, name, base, pe]) => {
    let price = base
    const closes = Array.from({ length: 30 }, () => (price *= 1 + (next() - 0.48) * 0.045))
    const [prev, last] = closes.slice(-2)
    return { symbol, name, closes, change: ((last - prev) / prev) * 100, volume: 0.4 + next() * 9, pe }
  })
}

function spark(closes: number[]) {
  const x = scaleLinear().domain([0, closes.length - 1]).range([1, 119])
  const y = scaleLinear().domain(extent(closes) as [number, number]).range([27, 3])
  const path = line<number>().x((_, i) => x(i)).y(y)(closes)!
  const fill = area<number>().x((_, i) => x(i)).y0(30).y1(y)(closes)!
  return `<svg viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path data-fill d="${fill}"/><path data-spark d="${path}"/></svg>`
}

const cell = (quote: Quote, key: string) => {
  const last = quote.closes.at(-1)!
  const down = quote.change < 0
  const content: Record<string, string> = {
    symbol: `<b>${quote.symbol}</b>`,
    name: quote.name,
    last: last.toFixed(2),
    change: `${down ? "−" : "+"}${Math.abs(quote.change).toFixed(2)}%`,
    volume: `${quote.volume.toFixed(2)}M`,
    pe: quote.pe.toFixed(1),
    trend: `${spark(quote.closes)}<span data-sr>${quote.closes[0].toFixed(2)} to ${last.toFixed(2)}</span>`,
  }
  const trendDown = last < quote.closes[0]
  const tone = (key === "change" && down) || (key === "trend" && trendDown) ? " data-down" : ""
  return `<td data-column="${key}"${tone}>${content[key]}</td>`
}

const html = (rows: Quote[]) => `
<div data-term>
  <header>
    <h2>Watchlist</h2>
    <p data-sub>8 symbols, USD, close of 24 Nov 2026</p>
  </header>
  <p id="b39-help">Drag a column title to move it, or its right edge to resize it. Keyboard: Space picks up a column, Left and Right move it, Space drops it. Shift with Left or Right resizes the column.</p>
  <div data-scroll>
    <b39-quote-table aria-label="Quote table" value="${KEYS}" widths="${COLUMNS.map((column) => `${column.key}:${column.width}`)}">
      <b39-columns aria-label="Columns" aria-describedby="b39-help">
        ${COLUMNS.map((column) => `<b39-column value="${column.key}" aria-describedby="b39-help"${column.end ? " data-end" : ""}><span>${column.label}</span><b39-grip value="${column.key}" aria-hidden="true"></b39-grip></b39-column>`).join("")}
      </b39-columns>
      <table aria-label="Quotes">
        <colgroup>${KEYS.map((key) => `<col data-column="${key}">`).join("")}</colgroup>
        <thead data-sr><tr>${COLUMNS.map((column) => `<th scope="col" data-column="${column.key}">${column.label}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((quote) => `<tr>${KEYS.map((key) => cell(quote, key)).join("")}</tr>`).join("")}</tbody>
      </table>
    </b39-quote-table>
  </div>
  <p role="status" data-status>The columns are in their first order.</p>
</div>`

const widthRules = KEYS.map(
  (key) => `[data-stage] b39-column[value="${key}"], [data-stage] col[data-column="${key}"] { width: var(--column-${key}); }`,
).join("\n")
const endRules = COLUMNS.filter((column) => column.end)
  .map((column) => `[data-stage] td[data-column="${column.key}"]`)
  .join(", ")

const styles = `
[data-stage] { display: block; width: min(100%, 880px); }
[data-stage] [data-term] {
  --b39-bg: #0a0906; --b39-amber: #ffb000; --b39-dim: #c78f1f; --b39-line: #4a3810; --b39-rule: #241b09;
  --b39-row: #14100a; --b39-down: #ff6b5a;
  display: grid; gap: 14px; padding: 20px; border: 1px solid var(--b39-line); border-radius: 8px;
  background: var(--b39-bg); color: var(--b39-amber);
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 0.875rem;
}
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1.125rem; font-weight: 600; }
[data-stage] [data-sub], [data-stage] #b39-help, [data-stage] [data-status] { color: var(--b39-dim); max-width: 60ch; }
[data-stage] [data-sub] { margin-top: 4px; }
[data-stage] [data-scroll] { overflow-x: auto; }
[data-stage] b39-quote-table { width: var(--columns-width); }
[data-stage] b39-columns { display: flex; border-bottom: 1px solid var(--b39-amber); }
[data-stage] b39-column {
  position: relative; flex: none; display: flex; align-items: center; padding: 8px 12px;
  font-weight: 600; cursor: grab; user-select: none; touch-action: none;
}
[data-stage] b39-column[data-end] { justify-content: flex-end; }
[data-stage] b39-column > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-stage] b39-column:focus-visible { outline: 2px solid var(--b39-amber); outline-offset: -2px; }
[data-stage] b39-column[data-grabbed] { background: var(--b39-amber); color: var(--b39-bg); }
[data-stage] b39-column[data-dragging] { transform: translate(var(--drag-x, 0), var(--drag-y, 0)); z-index: 2; cursor: grabbing; }
[data-stage] b39-grip { position: absolute; inset-block: 0; inset-inline-end: 0; width: 9px; cursor: col-resize; touch-action: none; z-index: 1; }
[data-stage] b39-grip::after { content: ""; position: absolute; inset-block: 8px; inset-inline-end: 0; width: 2px; background: var(--b39-line); }
[data-stage] b39-grip:hover::after, [data-stage] b39-grip[data-resizing]::after { background: var(--b39-amber); }
${widthRules}
[data-stage] table { table-layout: fixed; width: var(--columns-width); border-collapse: collapse; }
[data-stage] td {
  padding: 7px 12px; border-bottom: 1px solid var(--b39-rule);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums;
}
${endRules} { text-align: end; }
[data-stage] tbody tr:nth-child(even) { background: var(--b39-row); }
[data-stage] td[data-down] { color: var(--b39-down); }
[data-stage] td svg { display: block; width: 100%; height: 24px; }
[data-stage] [data-spark] { fill: none; stroke: currentColor; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
[data-stage] [data-fill] { fill: currentColor; fill-opacity: 0.14; }
[data-stage] [data-sr] { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html(quotes())
  const table = root.querySelector<HTMLElement>("b39-quote-table")!
  const status = root.querySelector("[data-status]")!
  // The page owns the order and the widths: the table shows only what the page writes back.
  table.addEventListener("valuechange", (event) => {
    const { value } = (event as CustomEvent<{ value: string[] }>).detail
    if (value[0] !== "symbol") {
      status.textContent = "Symbol stays the first column. The order did not change."
      return
    }
    table.setAttribute("value", value.join(","))
    status.textContent = `Columns: ${value.map(labelOf).join(", ")}.`
  })
  table.addEventListener("widthschange", (event) => {
    const { value } = (event as CustomEvent<{ value: string[] }>).detail
    const before = parseWidths(table.getAttribute("widths")!.split(","))
    const after = parseWidths(value)
    const key = KEYS.find((column) => before[column] !== after[column])
    table.setAttribute("widths", value.join(","))
    if (key) status.textContent = `${labelOf(key)} column: ${after[key]} px wide.`
  })
}

const ui: UI = {
  id: "B39",
  request:
    "Build a stock quote table whose columns a person moves and resizes, by dragging or with the keyboard, where the page owns the column order and keeps Symbol first.",
  css: styles,
  mount,
  task: {
    steps: [
      { ref: "Quote table", action: "moveColumn", args: ["Change", 2] },
      { ref: "Quote table", action: "resizeColumn", args: ["Company", 220] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Company column: 220 px wide." &&
      root.querySelector("b39-quote-table")!.getAttribute("value")!.startsWith("symbol,name,change,last"),
  },
  breaks: [
    {
      broke: "Every column is a tab stop.",
      find: "tabindex: api.roving.tabIndex(state, { key, props }),",
      replace: 'tabindex: "0",',
      caught: "keyboard: the column bar is 1 tab stop, and Left and Right move focus without a change of order",
    },
    {
      broke: "Space and Enter no longer pick a column up.",
      find: "api.reorder.keydown(event, key) || ",
      replace: "",
      caught: "keyboard: Space picks up a column, Right moves it, and Space drops it",
    },
    {
      broke: "Shift with an arrow no longer resizes a column.",
      find: "api.resizeKey(event, key, el!) || ",
      replace: "",
      caught: "keyboard: Shift with Right and Left resizes the focused column in steps of 8 px, from 64 to 320 px",
    },
    {
      broke: "A press on a column's edge also starts a move of the column.",
      find: "    event.preventDefault()\n        stop?.()",
      replace: "    stop?.()",
      caught: "pointer: a drag of a column's edge resizes it and does not move it, and Escape puts the width back",
    },
    {
      broke: "The dropped width is cleared before the owner sends it back, so the old width shows for a moment.",
      find: "settleDraft(store, () => store.get().widths, before, clear)",
      replace: "clear()",
      caught: "controlled: a dropped width stays on screen until the owner writes it back a microtask later, then the draft clears",
    },
    {
      broke: "The table cells no longer follow the column order.",
      find: "for (const cell of sorted) row.append(cell)",
      replace: "void sorted",
      caught: "keyboard: on the page, the header and every row follow a moved column, focus stays on it, and the status line reports it",
    },
    {
      broke: "The page writes back every order, so Symbol can leave the first place.",
      find: 'if (value[0] !== "symbol") {',
      replace: "if (false) {",
      caught: "controlled: the page refuses an order that moves Symbol, and the table goes back to the order the page holds",
    },
    {
      broke: "An agent can no longer move or resize a column.",
      find: 'actions: ["moveColumn", "resizeColumn"],',
      replace: "actions: [],",
      caught: "agent: an agent finds the table and its columns, moves Change and resizes Company",
    },
  ],
}

export { quoteTable }
export default ui
