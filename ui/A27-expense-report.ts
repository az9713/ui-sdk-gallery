import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/toggle"
import type { UI } from "../src/ui"

type Report = { item: string; amount: string; billable: boolean }

const START_LOG = [
  "Server markup: 8 ui-sdk elements, 0 upgraded.",
  "Before upgrade, the native form reads: Taxi to airport, 42.50.",
  "After upgrade: 8 of 8 run. Billable is on, as the markup says.",
].join(" ")

const esc = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

// The HTML that a server sends: a string, with no DOM. aria-pressed describes the button before upgrade.
const serverMarkup = (report: Report) => `
<form data-report>
  <h2>Expense report, trip to Lyon</h2>
  <ui-field>
    <ui-field-label>Expense item</ui-field-label>
    <ui-input><input name="item" value="${esc(report.item)}" required /></ui-input>
  </ui-field>
  <ui-field>
    <ui-field-label>Amount in EUR</ui-field-label>
    <ui-input><input name="amount" inputmode="decimal" value="${esc(report.amount)}" required /></ui-input>
  </ui-field>
  <ui-toggle${report.billable ? " default-pressed" : ""}><button type="button" aria-pressed="${report.billable}">Billable</button></ui-toggle>
  <ui-button><button type="submit">Submit report</button></ui-button>
</form>
<p role="status" data-status>The report is not submitted.</p>
<section data-start>
  <h2>How this page started</h2>
  <ol data-log></ol>
</section>`

const css = `
[data-stage] { display: grid; gap: 24px; max-width: 480px; }
[data-stage] [data-report] { display: grid; gap: 20px; justify-items: start; }
[data-stage] [data-report] ui-field { width: 100%; }
[data-stage] h2 { margin: 0; font-size: 1.125rem; }
[data-stage] [data-status] { margin: 0; color: var(--ui-foreground); }
[data-stage] [data-start] { display: grid; gap: 12px; padding-top: 20px; border-top: 1px solid var(--ui-border); }
[data-stage] [data-log] { display: grid; gap: 8px; margin: 0; padding-left: 20px; color: var(--ui-muted-foreground); max-width: 60ch; }
`

const upgraded = (el: Element) => {
  const definition = customElements.get(el.localName)
  return !!definition && el instanceof definition
}

function mount(root: HTMLElement) {
  // A DOMParser document has no custom element registry, so its elements stay as the server sent them.
  const parsed = new DOMParser().parseFromString(serverMarkup({ item: "Taxi to airport", amount: "42.50", billable: true }), "text/html")
  const parts = [...parsed.body.querySelectorAll("*")].filter((el) => el.localName.startsWith("ui-"))
  const before = new FormData(parsed.querySelector("form")!)
  const said = parsed.querySelector("ui-toggle button")!.getAttribute("aria-pressed")
  const lines = [
    `Server markup: ${parts.length} ui-sdk elements, ${parts.filter(upgraded).length} upgraded.`,
    `Before upgrade, the native form reads: ${before.get("item")}, ${before.get("amount")}.`,
  ]

  root.append(...parsed.body.childNodes)
  const log = root.querySelector("[data-log]")!
  const write = () => log.replaceChildren(...lines.map((line) => Object.assign(document.createElement("li"), { textContent: line })))
  write()

  const form = root.querySelector<HTMLFormElement>("[data-report]")!
  const toggle = root.querySelector("ui-toggle") as HTMLElement & { pressed: boolean }
  const status = root.querySelector("[data-status]")!
  Promise.all([...new Set(parts.map((el) => el.localName))].map((tag) => customElements.whenDefined(tag))).then(() => {
    const running = parts.filter(upgraded).length
    const match = String(toggle.pressed) === said ? "as the markup says" : "unlike the markup"
    lines.push(`After upgrade: ${running} of ${parts.length} run. Billable is ${toggle.pressed ? "on" : "off"}, ${match}.`)
    write()
  })

  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const data = new FormData(form)
    status.textContent = `Submitted: ${data.get("item")}, ${data.get("amount")} EUR, ${toggle.pressed ? "billable" : "not billable"}.`
  })
}

const ui: UI = {
  id: "A27",
  request:
    "Build an expense report form that the server sends as HTML first, then upgrade its elements in the browser and show that their state matches the markup.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Expense item", action: "setValue", args: ["Hotel night"] },
      { ref: "Amount in EUR", action: "setValue", args: ["96.00"] },
      { ref: "Billable", action: "setPressed", args: [false] },
      { ref: "Submit report", action: "press" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Submitted: Hotel night, 96.00 EUR, not billable." &&
      [...root.querySelectorAll("[data-log] li")].map((li) => li.textContent).join(" ") === START_LOG,
  },
}

export default ui
