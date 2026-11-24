import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/number-input"
import "@ui-sdk/web/select"
import { formatNumber, isPartialNumber, parseNumber, scrubTo } from "@ui-sdk/core/number"
import type { UI } from "../src/ui"

const BASE_SERVINGS = 4
const SERVINGS = { min: 1, max: 48, step: 1 }
const FLOUR_PER_SERVING = 250 / BASE_SERVINGS

const formats = [
  { value: "en-US", label: "English" },
  { value: "de-DE", label: "German" },
]

const ingredients = [
  { name: "Flour", amount: 250, unit: "g" },
  { name: "Sugar", amount: 0.75, unit: "cup" },
  { name: "Milk", amount: 300, unit: "ml" },
  { name: "Eggs", amount: 2, unit: "" },
  { name: "Vanilla", amount: 1.5, unit: "tsp" },
]

const html = `
<section data-controls>
  <ui-field>
    <ui-field-label>Number format</ui-field-label>
    <ui-select name="format" default-value="en-US">
      <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
      <ui-select-content>
        ${formats.map((f) => `<ui-select-item value="${f.value}">${f.label}</ui-select-item>`).join("")}
      </ui-select-content>
    </ui-select>
  </ui-field>
  <ui-field>
    <ui-field-label>Servings</ui-field-label>
    <ui-number-input default-value="${BASE_SERVINGS}" min="${SERVINGS.min}" max="${SERVINGS.max}" step="${SERVINGS.step}" large-step="4">
      <ui-number-input-group>
        <ui-number-input-decrement><button aria-label="Fewer servings"></button></ui-number-input-decrement>
        <ui-number-input-control><input /></ui-number-input-control>
        <ui-number-input-increment><button aria-label="More servings"></button></ui-number-input-increment>
      </ui-number-input-group>
    </ui-number-input>
    <ui-field-description>The recipe is written for ${BASE_SERVINGS}.</ui-field-description>
  </ui-field>
  <div data-fit>
    <ui-field>
      <ui-field-label>Flour on hand</ui-field-label>
      <ui-input><input placeholder="1.000" /></ui-input>
      <ui-field-description>In grams, in the number format above.</ui-field-description>
    </ui-field>
    <ui-button data-fit-button><button>Fit to flour</button></ui-button>
  </div>
</section>
<section data-recipe>
  <h2>Pancake batter</h2>
  <ul aria-label="Ingredients" data-ingredients></ul>
</section>
<p role="status" data-status></p>`

const css = `
[data-stage] { display: grid; gap: 24px; max-width: 520px; }
[data-stage] [data-controls] { display: grid; gap: 20px; }
[data-stage] [data-fit] { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start; }
[data-stage] [data-fit] ui-button { margin-top: 24px; }
[data-stage] [data-recipe] h2 { margin: 0 0 8px; font-size: 18px; }
[data-stage] [data-ingredients] { list-style: none; margin: 0; padding: 0; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] [data-ingredients] li { display: flex; justify-content: space-between; gap: 16px; padding: 10px 14px; }
[data-stage] [data-ingredients] li + li { border-top: 1px solid var(--ui-border); }
[data-stage] [data-ingredients] [data-quantity] { font-variant-numeric: tabular-nums; font-weight: 600; }
[data-stage] [data-status] { margin: 0; color: var(--ui-foreground); }
`

type NumberInput = HTMLElement & { api: { setValue(value: number | null): boolean } }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const state = { locale: "en-US", servings: BASE_SERVINGS as number | null }
  const list = root.querySelector("[data-ingredients]")!
  const status = root.querySelector("[data-status]")!
  const servings = root.querySelector("ui-number-input") as NumberInput
  const flour = root.querySelector("ui-input input") as HTMLInputElement
  const formatLabel = () => formats.find((f) => f.value === state.locale)!.label
  const show = (value: number) => formatNumber(value, state.locale, { maximumFractionDigits: 2 })

  const render = () => {
    if (state.servings === null) {
      status.textContent = "Enter a number of servings."
      return
    }
    const scale = state.servings / BASE_SERVINGS
    list.innerHTML = ingredients
      .map((item) => {
        const text = `${show(item.amount * scale)}${item.unit ? ` ${item.unit}` : ""}`
        return `<li><span>${item.name}</span> <span data-quantity>${text}</span></li>`
      })
      .join("")
    status.textContent = `Recipe for ${state.servings} ${state.servings === 1 ? "serving" : "servings"} (x${show(scale)}), ${formatLabel()} format.`
  }

  servings.addEventListener("valuechange", (e) => {
    state.servings = (e as CustomEvent).detail.value
    render()
  })
  root.querySelector("ui-select")!.addEventListener("valuechange", (e) => {
    state.locale = (e as CustomEvent).detail.value
    render()
  })
  root.querySelector("[data-fit-button]")!.addEventListener("action", () => {
    const text = flour.value.trim()
    const amount = parseNumber(text, state.locale)
    if (amount === null) {
      status.textContent = isPartialNumber(text, state.locale)
        ? `"${text}" is not a full number yet.`
        : `Cannot read "${text}" as a number in ${formatLabel()} format.`
      return
    }
    const fitted = scrubTo(amount / FLOUR_PER_SERVING, SERVINGS).value
    servings.api.setValue(fitted)
    state.servings = fitted
    render()
  })
  render()
}

const ui: UI = {
  id: "A26",
  request: "Build a recipe scaler: a servings field that rescales 5 ingredients, a number format choice of English or German, and a flour field that fits the servings to the flour you have.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Number format", action: "setValue", args: ["German"] },
      { ref: "Flour on hand", action: "setValue", args: ["1.000"] },
      { ref: "Fit to flour", action: "press" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Recipe for 16 servings (x4), German format." &&
      root.querySelector("[data-ingredients] li")!.textContent === "Flour 1.000 g",
  },
}

export default ui
