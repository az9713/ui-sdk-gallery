import "@ui-sdk/web/accordion"
import "@ui-sdk/web/autocomplete"
import "@ui-sdk/web/button"
import "@ui-sdk/web/collapsible"
import type { UI } from "../src/ui"

const topics = [
  { value: "shipping", label: "What are your shipping options?", answer: "Standard shipping takes 5 to 7 days, express takes 2 to 3 days. Orders over $50 ship free." },
  { value: "returns", label: "What is your return policy?", answer: "Return any unused item in its original packaging within 30 days. Refunds arrive within 5 to 7 business days." },
  { value: "billing", label: "How do I change my billing address?", answer: "Open Account, then Billing, and edit the address. The change applies to your next invoice." },
  { value: "support", label: "How can I reach support?", answer: "Write to us by email or chat. We answer within 24 hours on business days." },
]

const html = `
<h2>Search help</h2>
<form role="search" data-search>
  <ui-autocomplete name="q">
    <div data-slot="stack">
      <ui-autocomplete-label>Help topic</ui-autocomplete-label>
      <ui-autocomplete-input><input placeholder="e.g. Refunds" /></ui-autocomplete-input>
    </div>
    <ui-autocomplete-content hidden>
      <ui-autocomplete-empty>No topics found.</ui-autocomplete-empty>
      <ui-autocomplete-list>
        ${["Shipping", "Returns", "Billing", "Support"].map((t) => `<ui-autocomplete-item value="${t}">${t}</ui-autocomplete-item>`).join("")}
      </ui-autocomplete-list>
    </ui-autocomplete-content>
  </ui-autocomplete>
  <ui-button data-search-button><button type="submit">Search</button></ui-button>
</form>
<h2>Common questions</h2>
<ui-accordion multiple aria-label="Help questions">
  ${topics
    .map(
      (t) => `
  <ui-accordion-item value="${t.value}">
    <ui-accordion-header>
      <h3><ui-accordion-trigger><button type="button">${t.label}</button></ui-accordion-trigger></h3>
    </ui-accordion-header>
    <ui-accordion-panel hidden><p>${t.answer}</p></ui-accordion-panel>
  </ui-accordion-item>`,
    )
    .join("")}
</ui-accordion>
<ui-collapsible data-contact>
  <ui-collapsible-trigger><button type="button">Still need help? Contact details</button></ui-collapsible-trigger>
  <ui-collapsible-panel hidden>
    <p>Email help@example.com or call 555 0100, Monday to Friday, 9:00 to 17:00.</p>
  </ui-collapsible-panel>
</ui-collapsible>
<p role="status" data-status>Nothing is searched.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 520px; }
[data-stage] h2 { margin: 0; font-size: 1.125rem; }
[data-stage] [data-search] { display: flex; align-items: flex-end; gap: 12px; }
[data-stage] [data-search] ui-autocomplete { flex: 1; }
[data-stage] ui-accordion-panel p, [data-stage] ui-collapsible-panel p { margin: 0; padding: 4px 0 12px; }
[data-stage] [data-contact] { border-top: 1px solid var(--ui-border); }
[data-stage] [data-status] { margin: 0; color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const search = root.querySelector("ui-autocomplete")!
  const accordion = root.querySelector("ui-accordion") as HTMLElement & { value: string[] }
  const contact = root.querySelector("ui-collapsible")!
  root.querySelector("form")!.addEventListener("submit", (event) => event.preventDefault())
  search.addEventListener("submit", (event) => {
    const text = ((event as CustomEvent).detail.value as string).trim()
    const topic = topics.find((t) => text && t.value.startsWith(text.toLowerCase()))
    if (topic) {
      accordion.value = [...new Set([...accordion.value, topic.value])]
      status.textContent = `Searched: ${text}. Opened: ${topic.label}`
    } else status.textContent = `Searched: ${text}. No answer found.`
  })
  root.querySelector("[data-search-button]")!.addEventListener("action", () => {
    search.dispatchEvent(new CustomEvent("submit", { detail: { value: (search as unknown as { api: { getValue(): string } }).api.getValue() } }))
  })
  accordion.addEventListener("valuechange", (event) => {
    const open = (event as CustomEvent).detail.value as string[]
    status.textContent = open.length ? `Open: ${open.join(", ")}.` : "All answers are closed."
  })
  contact.addEventListener("openchange", (event) => {
    status.textContent = (event as CustomEvent).detail.value ? "Contact details are shown." : "Contact details are hidden."
  })
}

const ui: UI = {
  id: "A14",
  request: "Build a help center with a search box that suggests topics, a list of questions whose answers open one by one, and a contact section that opens.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Help topic", action: "setValue", args: ["Returns"] },
      { ref: "Search", action: "press" },
      { ref: "Still need help? Contact details", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Contact details are shown." && root.querySelector("ui-accordion-item[value=returns]")!.hasAttribute("data-open"),
  },
}

export default ui
