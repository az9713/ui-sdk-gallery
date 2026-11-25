import { type ChangeDetails, createChange, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import { max, min, randomLcg, randomNormal, scaleLinear, select } from "d3"
import { type CrosshairPointer, type CrosshairReason, createCrosshair } from "../src/behaviors/crosshair"
import type { UI } from "../src/ui"

type Candle = { date: string; open: number; high: number; low: number; close: number }
type Options = {
  candles?: Candle[]
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null, details: ChangeDetails<CrosshairReason>) => void
}
// candles is an option that the plot renders from, so the state has a copy: a part must not read an option.
type State = { value: string | null; candles: Candle[]; pointer: CrosshairPointer | null }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const dayLabel = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`
const money = (price: number) => price.toFixed(2)
const centerAt = (index: number, count: number) => (index + 0.5) / count
const domainOf = (candles: Candle[]) =>
  scaleLinear()
    .domain([min(candles, (c) => c.low) ?? 0, max(candles, (c) => c.high) ?? 1])
    .nice(6)
    .domain()
// Where a price sits on the plot, from 0 at the top to 1 at the bottom.
const levelOf = (candles: Candle[]) => {
  const [low, high] = domainOf(candles)
  return scaleLinear().domain([low, high]).range([1, 0])
}
const readout = (candles: Candle[], date: string) => {
  const at = candles.findIndex((c) => c.date === date)
  const c = candles[at]
  if (!c) return date
  const before = candles[at - 1]?.close ?? c.open
  const change = ((c.close - before) / before) * 100
  return `${dayLabel(date)}: open ${money(c.open)}, high ${money(c.high)}, low ${money(c.low)}, close ${money(c.close)}, ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(2)}%`
}

const candleChart = definePrimitive({
  name: "candle-chart",
  options: { candles: "value", value: "string", defaultValue: "string", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    value: options.value ?? options.defaultValue ?? null,
    candles: options.candles ?? [],
    pointer: null,
  }),
  sync: (options) => ({
    candles: options.candles ?? [],
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: (context) => {
    const change = createChange(context)
    const candles = () => context.store.get().candles
    const candle = (date: string) => candles().find((c) => c.date === date)
    const crosshair = createCrosshair(context, {
      key: "value",
      pointer: "pointer",
      set: (value, details) => change("value", value, details),
      points: () => candles().map((c, i, all) => ({ value: c.date, at: centerAt(i, all.length) })),
      cross: (date) => levelOf(candles())(candle(date)?.close ?? 0),
      label: (date) => readout(candles(), date),
      empty: () => "Crosshair hidden",
      page: () => 5,
    })
    return {
      crosshair,
      days: () => candles().map((c) => ({ value: c.date, label: dayLabel(c.date) })),
      // Returns false for a day with no candle, so the bridge's closed list is what refuses it.
      setValue: (date: string) => crosshair.show(date),
      clear: () => crosshair.hide(),
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state, { api }) => api.crosshair.lineAttrs(state),
      bind: (el, { api, store }) => draw(el, store.get().candles, () => api.crosshair.position(store.get()), store),
    }),
    plot: slot({
      role: "slider",
      focus: "tab-stop",
      keys: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", "Escape"],
      attrs: (state, { api }) => api.crosshair.surfaceAttrs(state),
      on: {
        keydown: (event, { el, api }) => void api.crosshair.keydown(event, el!),
        pointermove: (event, { el, api }) => api.crosshair.pointermove(event, el!),
        pointerdown: (event, { el, api }) => api.crosshair.pointerdown(event, el!),
        pointerleave: (event, { api }) => api.crosshair.pointerleave(event),
      },
    }),
  }),
  agent: { actions: ["setValue", "clear"], closed: true, items: (api) => api.days() },
})

createParts(candleChart, {
  root: {
    tag: "c01-candle-chart",
    display: "block",
    options: (el) => ({ candles: JSON.parse(el.getAttribute("data-candles") ?? "[]") as Candle[] }),
  },
  plot: { tag: "c01-plot", display: "block" },
})

const WIDTH = 640
const HEIGHT = 300
// The crosshair opens mid-chart, between 2 date labels, so the first view shows both of its lines.
const OPEN_DAY = "2026-11-02"

// Draws the candles, the grid and the axis labels with d3, and keeps the 2 axis tags on the crosshair.
function draw(
  el: HTMLElement,
  candles: Candle[],
  position: () => { x: number; y: number | undefined } | null,
  store: { get: () => State; subscribe: (listener: () => void) => () => void },
) {
  const svg = el.querySelector<SVGSVGElement>("[data-chart]")
  const prices = el.querySelector<HTMLElement>("[data-price-axis]")
  const dates = el.querySelector<HTMLElement>("[data-date-axis]")
  if (!svg || !prices || !dates || !candles.length) return
  const level = levelOf(candles)
  const y = (price: number) => level(price) * HEIGHT
  const step = WIDTH / candles.length
  const body = Math.max(1, step * 0.62)
  const ticks = level.ticks(6)

  select(svg)
    .selectAll("line[data-grid]")
    .data(ticks)
    .join("line")
    .attr("data-grid", "")
    .attr("x1", 0)
    .attr("x2", WIDTH)
    .attr("y1", y)
    .attr("y2", y)
  const groups = select(svg)
    .selectAll<SVGGElement, Candle>("g[data-candle]")
    .data(candles, (c) => c.date)
    .join((enter) => {
      const g = enter.append("g").attr("data-candle", "")
      g.append("line")
      g.append("rect")
      return g
    })
    .attr("data-up", (c) => (c.close >= c.open ? "" : null))
  groups
    .select("line")
    .attr("x1", (_, i) => centerAt(i, candles.length) * WIDTH)
    .attr("x2", (_, i) => centerAt(i, candles.length) * WIDTH)
    .attr("y1", (c) => y(c.high))
    .attr("y2", (c) => y(c.low))
  groups
    .select("rect")
    .attr("x", (_, i) => centerAt(i, candles.length) * WIDTH - body / 2)
    .attr("width", body)
    .attr("y", (c) => y(Math.max(c.open, c.close)))
    .attr("height", (c) => Math.max(1, Math.abs(y(c.open) - y(c.close))))

  const label = (axis: HTMLElement, at: number, text: string) =>
    select(axis).append("span").attr("data-tick", "").attr("data-at", at).style("--at", at).text(text)
  for (const price of ticks) label(prices, level(price), money(price))
  // 1 label for each 2 weeks: 10 trading days.
  candles.forEach((c, i) => i % 10 === 0 && label(dates, centerAt(i, candles.length), dayLabel(c.date)))

  const priceTag = select(prices).append("span").attr("data-tag", "").node()!
  const dateTag = select(dates).append("span").attr("data-tag", "").node()!
  const update = () => {
    const at = position()
    const { value } = store.get()
    if (at && value) {
      priceTag.textContent = money(level.invert(at.y ?? 0))
      dateTag.textContent = dayLabel(value)
    }
    // An axis label under a tag is hidden, so the 2 never overlap.
    for (const [axis, near, place] of [
      [prices, 0.08, at?.y],
      [dates, 0.09, at?.x],
    ] as const)
      for (const tick of axis.querySelectorAll<HTMLElement>("[data-tick]"))
        tick.toggleAttribute("data-covered", place !== undefined && Math.abs(Number(tick.dataset.at) - place) < near)
  }
  update()
  const stop = store.subscribe(update)
  return () => {
    stop()
    select(svg).selectAll("*").remove()
    select(prices).selectAll("*").remove()
    select(dates).selectAll("*").remove()
  }
}

// A seeded random walk: the same 50 trading days on each run, from Monday 14 September to Friday 20 November 2026.
function makeCandles(): Candle[] {
  const random = randomLcg(0.2611)
  const move = randomNormal.source(random)(0.0011, 0.016)
  const wick = randomNormal.source(random)(0, 0.006)
  const round = (price: number) => Math.round(price * 100) / 100
  const days: string[] = []
  for (let time = Date.UTC(2026, 8, 14); days.length < 50; time += 86_400_000) {
    const day = new Date(time)
    if (day.getUTCDay() % 6 !== 0) days.push(day.toISOString().slice(0, 10))
  }
  let close = 142
  return days.map((date) => {
    const open = round(close * (1 + wick() / 2))
    close = round(open * (1 + move()))
    const high = round(Math.max(open, close) * (1 + Math.abs(wick())))
    const low = round(Math.min(open, close) * (1 - Math.abs(wick())))
    return { date, open, high, low, close }
  })
}

const html = (candles: Candle[]) => `
<div data-card>
  <header>
    <h2>NWND, Northwind Systems</h2>
    <p data-sub>Daily candles, 50 trading days, USD</p>
  </header>
  <p role="status" data-status></p>
  <c01-candle-chart aria-label="Price chart" dir="ltr" default-value="${OPEN_DAY}" data-candles='${JSON.stringify(candles)}'>
    <div data-frame>
      <c01-plot aria-label="Crosshair" aria-describedby="c01-help">
        <svg data-chart viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" aria-hidden="true" focusable="false"></svg>
        <span data-line="x"></span><span data-line="y"></span>
      </c01-plot>
      <div data-price-axis aria-hidden="true"></div>
      <div data-date-axis aria-hidden="true"></div>
    </div>
  </c01-candle-chart>
  <p id="c01-help">Point at a candle, or focus the chart and use the arrow keys. Page Up and Page Down move a week, Home and End go to the ends, and Escape hides the crosshair.</p>
</div>`

const css = `
[data-stage] { display: block; width: min(100%, 760px); }
[data-stage] [data-card] {
  display: grid; gap: 16px; padding: 20px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius);
  background: var(--ui-muted); color: var(--ui-foreground);
}
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1.125rem; font-weight: 600; }
[data-stage] [data-sub] { margin-top: 4px; }
[data-stage] [data-sub], [data-stage] #c01-help { color: var(--ui-muted-foreground); max-width: 60ch; }
[data-stage] [data-status] { max-width: 60ch; font-variant-numeric: tabular-nums; }
[data-stage] [data-frame] { display: grid; grid-template-columns: minmax(0, 1fr) 64px; grid-template-rows: 300px 28px; }
[data-stage] c01-plot {
  position: relative; grid-column: 1; grid-row: 1; cursor: crosshair; touch-action: none;
  box-shadow: inset 0 0 0 1px var(--ui-border);
}
[data-stage] c01-plot:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] c01-plot > svg { display: block; width: 100%; height: 100%; }
[data-stage] [data-grid] { stroke: var(--ui-border); stroke-width: 1; vector-effect: non-scaling-stroke; }
[data-stage] [data-candle] { color: var(--ui-destructive); }
[data-stage] [data-candle][data-up] { color: var(--ui-primary); }
[data-stage] [data-candle] line { stroke: currentColor; stroke-width: 1; vector-effect: non-scaling-stroke; }
[data-stage] [data-candle] rect { fill: currentColor; }
[data-stage] [data-line] { position: absolute; pointer-events: none; visibility: hidden; }
[data-stage] [data-line="x"] { inset-block: 0; inset-inline-start: calc(var(--crosshair-x) * 100%); border-inline-start: 1px dashed var(--ui-ring); }
[data-stage] [data-line="y"] { inset-inline: 0; top: calc(var(--crosshair-y) * 100%); border-top: 1px dashed var(--ui-ring); }
[data-stage] [data-price-axis], [data-stage] [data-date-axis] { position: relative; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
[data-stage] [data-price-axis] { grid-column: 2; grid-row: 1; }
[data-stage] [data-date-axis] { grid-column: 1; grid-row: 2; }
[data-stage] [data-tick] { position: absolute; color: var(--ui-muted-foreground); white-space: nowrap; }
[data-stage] [data-price-axis] [data-tick] { inset-inline-start: 8px; top: calc(var(--at) * 100%); transform: translateY(-50%); }
[data-stage] [data-date-axis] [data-tick] { top: 6px; inset-inline-start: calc(var(--at) * 100%); transform: translateX(-50%); }
[data-stage] [data-tick][data-covered] { visibility: hidden; }
[data-stage] [data-tag] {
  position: absolute; visibility: hidden; display: grid; place-items: center; height: 22px; padding: 0 6px;
  border-radius: 4px; background: var(--ui-ring); color: var(--ui-background); font-weight: 600; white-space: nowrap;
}
[data-stage] [data-price-axis] [data-tag] { inset-inline-start: 4px; top: clamp(0px, calc(var(--crosshair-y) * 100% - 11px), calc(100% - 22px)); }
[data-stage] [data-date-axis] [data-tag] { top: 3px; width: 56px; padding: 0; inset-inline-start: clamp(0px, calc(var(--crosshair-x) * 100% - 28px), calc(100% - 56px)); }
[data-stage] c01-candle-chart[data-crosshair] :is([data-line], [data-tag]) { visibility: visible; }
`

function mount(root: HTMLElement) {
  const candles = makeCandles()
  root.innerHTML = html(candles)
  const chart = root.querySelector("c01-candle-chart")!
  const status = root.querySelector("[data-status]")!
  const say = (date: string | null) => (status.textContent = date ? readout(candles, date) : "Crosshair hidden.")
  say(OPEN_DAY)
  chart.addEventListener("valuechange", (event) => say((event as CustomEvent<{ value: string | null }>).detail.value))
}

const ui: UI = {
  id: "C01",
  request:
    "Build a candlestick price chart with a crosshair: hovering or the arrow keys put it on the nearest candle and read out that day's open, high, low and close.",
  css,
  mount,
  task: {
    steps: [{ ref: "Price chart", action: "setValue", args: ["Oct 15"] }],
    done: (root) => root.querySelector("[data-status]")!.textContent!.startsWith("Oct 15: open "),
  },
  breaks: [
    {
      broke: "The arrow keys no longer move the crosshair.",
      find: "keydown: (event, { el, api }) => void api.crosshair.keydown(event, el!),",
      replace: "keydown: () => {},",
      caught: "keyboard: the plot is 1 tab stop, arrows step 1 candle, Page Up and Page Down a week, Home and End go to the ends",
    },
    {
      broke: "A hover no longer moves the crosshair.",
      find: "pointermove: (event, { el, api }) => api.crosshair.pointermove(event, el!),",
      replace: "",
      caught: "pointer: a hover puts the crosshair on the nearest candle, the cross line follows the pointer, and leaving hides it",
    },
    {
      broke: "The crosshair stays on the chart after the pointer leaves it.",
      find: "pointerleave: (event, { api }) => api.crosshair.pointerleave(event),",
      replace: "",
      caught: "pointer: a hover puts the crosshair on the nearest candle, the cross line follows the pointer, and leaving hides it",
    },
    {
      broke: "The crosshair stops on the left edge of each candle, not on its center.",
      find: "at: centerAt(i, all.length) }))",
      replace: "at: i / all.length }))",
      caught: "pointer: the vertical line sits on the candle's center and, with no pointer, the cross line on its close",
    },
    {
      broke: "With no pointer, the cross line no longer sits on the close.",
      find: "cross: (date) => levelOf(candles())(candle(date)?.close ?? 0),",
      replace: "",
      caught: "pointer: the vertical line sits on the candle's center and, with no pointer, the cross line on its close",
    },
    {
      broke: "An agent can no longer move or hide the crosshair.",
      find: 'actions: ["setValue", "clear"],',
      replace: "actions: [],",
      caught: "agent: an agent finds the chart, lists its days, moves the crosshair to Oct 15, is refused a Saturday, and hides it",
    },
    {
      broke: "The bridge no longer refuses a day with no candle.",
      find: "closed: true,",
      replace: "",
      caught: "agent: an agent finds the chart, lists its days, moves the crosshair to Oct 15, is refused a Saturday, and hides it",
    },
    {
      broke: "The status line no longer follows the crosshair.",
      find: 'chart.addEventListener("valuechange", (event) => say((event as CustomEvent<{ value: string | null }>).detail.value))',
      replace: "void chart",
      caught: "keyboard: on the page, arrows move the crosshair and the status line reads each candle",
    },
  ],
}

export { type Candle, candleChart, makeCandles, readout }
export default ui
