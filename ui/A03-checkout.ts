import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/number-input"
import "@ui-sdk/web/radio"
import type { UI } from "../src/ui"

const speeds = [
  { value: "standard", label: "Standard", detail: "Free, 5 to 7 days", cost: 0 },
  { value: "express", label: "Express", detail: "$9.00, 2 days", cost: 9 },
  { value: "overnight", label: "Overnight", detail: "$24.00, next day", cost: 24 },
]

const money = (amount: number) => `$${amount.toFixed(2)}`

const html = `
<ui-field>
  <ui-field-label>Shipping speed</ui-field-label>
  <ui-radio-group default-value="standard">
    ${speeds
      .map(
        (speed) => `
    <label data-slot="label">
      <ui-radio value="${speed.value}"><ui-radio-indicator></ui-radio-indicator></ui-radio>
      ${speed.label}
      <span data-slot="hint">(${speed.detail})</span>
    </label>`,
      )
      .join("")}
  </ui-radio-group>
</ui-field>
<ui-field>
  <ui-field-label>Tip amount</ui-field-label>
  <ui-number-input default-value="5" min="0" max="100" step="0.01" large-step="1">
    <ui-number-input-group>
      <ui-number-input-decrement><button aria-label="Decrease tip"></button></ui-number-input-decrement>
      <ui-number-input-control><input /></ui-number-input-control>
      <ui-number-input-increment><button aria-label="Increase tip"></button></ui-number-input-increment>
    </ui-number-input-group>
  </ui-number-input>
  <ui-field-description>Goes to the courier. Steps by 1 cent.</ui-field-description>
</ui-field>
<ui-button data-order><button>Place order</button></ui-button>
<p role="status" data-status>No order is placed.</p>`

const css = `
[data-stage] { display: grid; gap: 24px; max-width: 420px; justify-items: start; }
[data-stage] ui-field { width: 100%; }
[data-stage] ui-radio-group { display: grid; gap: 10px; }
[data-stage] [data-status] { margin: 0; color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const order = { speed: "standard", tip: 5 as number | null }
  const status = root.querySelector("[data-status]")!
  const number = root.querySelector("ui-number-input") as HTMLElement & { format: Intl.NumberFormatOptions }
  number.format = { style: "currency", currency: "USD" }
  root.querySelector("ui-radio-group")!.addEventListener("valuechange", (e) => {
    order.speed = (e as CustomEvent).detail.value
  })
  number.addEventListener("valuechange", (e) => {
    order.tip = (e as CustomEvent).detail.value
  })
  root.querySelector("[data-order]")!.addEventListener("action", () => {
    const speed = speeds.find((s) => s.value === order.speed)!
    const tip = order.tip ?? 0
    status.textContent = `Ordered: ${speed.label} shipping, tip ${money(tip)}, total ${money(speed.cost + tip)}.`
  })
}

const ui: UI = {
  id: "A03",
  request: "Build a checkout with a shipping speed choice of 3 radios, a tip field in dollars that steps by 1 cent, and a Place order button.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Shipping speed", action: "setValue", args: ["express"] },
      { ref: "Tip amount", action: "setValue", args: [6.25] },
      { ref: "Place order", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Ordered: Express shipping, tip $6.25, total $15.25.",
  },
}

export default ui
