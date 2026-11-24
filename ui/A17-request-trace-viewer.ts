import "@ui-sdk/web/button"
import "@ui-sdk/web/waterfall"
import type { WaterfallData, WaterfallDataItem } from "@ui-sdk/core/waterfall"
import type { UI } from "../src/ui"

const trace: WaterfallData = [
  {
    value: "checkout",
    label: "POST /checkout",
    start: 0,
    duration: 920,
    children: [
      { value: "auth", label: "auth.verify", start: 12, duration: 64 },
      {
        value: "cart",
        label: "cart.load",
        start: 80,
        duration: 310,
        children: [
          { value: "cart-db", label: "db.query carts", start: 96, duration: 140 },
          { value: "prices", label: "pricing.quote", start: 240, duration: 136 },
        ],
      },
      {
        value: "payment",
        label: "payments.charge",
        start: 400,
        duration: 470,
        children: [
          { value: "fraud", label: "fraud.score", start: 410, duration: 120 },
          { value: "gateway", label: "gateway.capture", start: 540, duration: 310 },
        ],
      },
      { value: "email", label: "email.enqueue", start: 880, duration: 30 },
    ],
  },
]

const sizes: Record<string, string> = {
  checkout: "4 kB",
  auth: "1 kB",
  cart: "9 kB",
  "cart-db": "6 kB",
  prices: "2 kB",
  payment: "3 kB",
  fraud: "1 kB",
  gateway: "2 kB",
  email: "1 kB",
}

const flat = (items: WaterfallDataItem[]): WaterfallDataItem[] => items.flatMap((item) => [item, ...flat(item.children ?? [])])
const byValue = new Map(flat(trace).map((span) => [span.value, span]))

const rows = (items: WaterfallDataItem[]): string =>
  items
    .map(
      (item) => `
      <ui-waterfall-row value="${item.value}">
        <ui-waterfall-row-header>
          ${item.children ? "<ui-waterfall-indicator></ui-waterfall-indicator>" : ""}
          ${item.label}
        </ui-waterfall-row-header>
        <ui-waterfall-cell>${sizes[item.value]}</ui-waterfall-cell>
        <ui-waterfall-bar></ui-waterfall-bar>
      </ui-waterfall-row>${rows(item.children ?? [])}`,
    )
    .join("")

const html = `
<div data-controls>
  <ui-button data-expand><button>Expand all spans</button></ui-button>
  <ui-button data-collapse><button>Collapse all spans</button></ui-button>
</div>
<ui-waterfall aria-label="Checkout trace" default-expanded="checkout">
  <ui-waterfall-header-row>
    <ui-waterfall-column-header>Span</ui-waterfall-column-header>
    <ui-waterfall-column-header>Size</ui-waterfall-column-header>
    <ui-waterfall-column-header aria-label="Timeline">
      <ui-waterfall-axis max-ticks="5"></ui-waterfall-axis>
    </ui-waterfall-column-header>
  </ui-waterfall-header-row>
  ${rows(trace)}
</ui-waterfall>
<p data-detail>Choose a span to see its timing.</p>
<p role="status" data-status>No span is selected.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 720px; }
[data-stage] [data-controls] { display: flex; gap: 12px; }
[data-stage] ui-waterfall { display: block; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); overflow: hidden; }
[data-stage] ui-waterfall-header-row,
[data-stage] ui-waterfall-row { display: grid; grid-template-columns: 210px 56px minmax(0, 1fr); align-items: center; }
[data-stage] ui-waterfall-row[hidden] { display: none; }
[data-stage] ui-waterfall-header-row { background: var(--ui-muted); border-bottom: 1px solid var(--ui-border); color: var(--ui-muted-foreground); }
[data-stage] ui-waterfall-row { border-bottom: 1px solid var(--ui-border); }
[data-stage] ui-waterfall-row:last-child { border-bottom: 0; }
[data-stage] ui-waterfall-column-header,
[data-stage] ui-waterfall-row-header,
[data-stage] ui-waterfall-cell { padding: 6px 12px; min-width: 0; }
[data-stage] ui-waterfall-row-header { display: flex; align-items: center; gap: 6px; padding-inline-start: calc(var(--waterfall-level, 1) * 14px - 2px); white-space: nowrap; }
[data-stage] ui-waterfall-row-header:not([data-branch]) { padding-inline-start: calc(var(--waterfall-level, 1) * 14px + 16px); }
[data-stage] ui-waterfall-cell { color: var(--ui-muted-foreground); }
[data-stage] ui-waterfall-row[data-selected] ui-waterfall-row-header,
[data-stage] ui-waterfall-row[data-selected] ui-waterfall-cell { color: var(--ui-foreground); font-weight: 600; }
[data-stage] ui-waterfall-row[data-selected] { background: var(--ui-muted); }
[data-stage] ui-waterfall-row:focus-visible,
[data-stage] ui-waterfall-row-header:focus-visible,
[data-stage] ui-waterfall-cell:focus-visible,
[data-stage] ui-waterfall-bar:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: -2px; }
[data-stage] ui-waterfall-indicator { display: inline-flex; width: 10px; height: 10px; align-items: center; justify-content: center; cursor: pointer; }
[data-stage] ui-waterfall-indicator::before { content: ""; width: 6px; height: 6px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); }
[data-stage] ui-waterfall-indicator[data-expanded]::before { transform: rotate(45deg); }
[data-stage] ui-waterfall-column-header:last-child { padding-inline: 0; }
[data-stage] ui-waterfall-axis { display: block; position: relative; height: 20px; margin-inline: 12px; }
[data-stage] ui-waterfall-tick { position: absolute; inset-inline-start: var(--waterfall-tick); transform: translateX(-50%); font-size: 0.75rem; white-space: nowrap; }
[data-stage] ui-waterfall-bar { display: block; position: relative; height: 28px; margin-inline: 12px; }
[data-stage] ui-waterfall-bar::before { content: ""; position: absolute; inset-block: 8px; inset-inline-start: var(--waterfall-start); width: var(--waterfall-size); min-width: 2px; background: var(--ui-primary); border-radius: 2px; }
[data-stage] ui-waterfall-row[data-branch] ui-waterfall-bar::before { background: var(--ui-input); }
[data-stage] ui-waterfall-row[data-selected] ui-waterfall-bar::before { background: var(--ui-ring); }
[data-stage] p { margin: 0; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const waterfall = root.querySelector("ui-waterfall")!
  const detail = root.querySelector("[data-detail]")!
  const status = root.querySelector("[data-status]")!
  waterfall.items = trace
  waterfall.format = { style: "unit", unit: "millisecond", unitDisplay: "narrow" }
  waterfall.getBarLabel = (span, { start, duration }) => `${sizes[span.value]}, starts at ${start}, takes ${duration}`
  waterfall.addEventListener("valuechange", (e) => {
    const value = (e as CustomEvent).detail.value as string | null
    const span = value ? byValue.get(value) : undefined
    if (!span) return
    waterfall.api.reveal(span.value)
    detail.textContent = `${span.label} starts at ${span.start} ms and takes ${span.duration} ms, ${sizes[span.value]}.`
    status.textContent = `Selected: ${span.label}`
  })
  root.querySelector("[data-expand]")!.addEventListener("action", () => waterfall.api.expandAll())
  root.querySelector("[data-collapse]")!.addEventListener("action", () => waterfall.api.collapseAll())
}

const ui: UI = {
  id: "A17",
  request: "Build a request trace viewer: spans on a shared time axis that expand to the spans they started, with a line that tells when the selected span starts and how long it takes.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Expand all spans", action: "press" },
      { ref: "Checkout trace", action: "setValue", args: ["gateway.capture"] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Selected: gateway.capture" &&
      root.querySelector("[data-detail]")!.textContent === "gateway.capture starts at 540 ms and takes 310 ms, 2 kB.",
  },
}

export default ui
