import { createAsyncOptions } from "@ui-sdk/core/async-options"
import "@ui-sdk/web/autocomplete"
import "@ui-sdk/web/button"
import type { UI } from "../src/ui"

const airports = [
  "Amsterdam (AMS)",
  "Athens (ATH)",
  "Barcelona (BCN)",
  "Berlin (BER)",
  "Brussels (BRU)",
  "Copenhagen (CPH)",
  "Dublin (DUB)",
  "Lisbon (LIS)",
  "London Gatwick (LGW)",
  "London Heathrow (LHR)",
  "Madrid (MAD)",
  "Paris (CDG)",
  "Rome (FCO)",
  "Tokyo (HND)",
]

const delay = 300

function searchAirports(query: string, { signal }: { signal: AbortSignal }) {
  return new Promise<string[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      const needle = query.trim().toLowerCase()
      resolve(airports.filter((airport) => airport.toLowerCase().split(/[\s(]+/).some((word) => word.startsWith(needle))))
    }, delay)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })
}

const html = `
<ui-autocomplete filter="false">
  <div data-slot="stack">
    <ui-autocomplete-label>Destination airport</ui-autocomplete-label>
    <ui-autocomplete-input><input placeholder="City or code, like Lisbon" /></ui-autocomplete-input>
  </div>
  <ui-autocomplete-content hidden>
    <ui-autocomplete-status></ui-autocomplete-status>
    <ui-autocomplete-empty>No airport matches “<span></span>”.</ui-autocomplete-empty>
    <ui-autocomplete-list></ui-autocomplete-list>
  </ui-autocomplete-content>
  <template><ui-autocomplete-item></ui-autocomplete-item></template>
</ui-autocomplete>
<ui-button data-search><button>Search flights</button></ui-button>
<p role="status" data-status>No search has run.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 420px; justify-items: start; }
[data-stage] ui-autocomplete { width: 100%; }
[data-stage] p { margin: 0; }
[data-stage] [data-status] { color: var(--ui-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const autocomplete = root.querySelector("ui-autocomplete")! as HTMLElement & { items: string[] }
  const list = root.querySelector("ui-autocomplete-status")!
  const empty = root.querySelector("ui-autocomplete-empty span")!
  const status = root.querySelector("[data-status]")!
  const results = createAsyncOptions(searchAirports, { debounce: 200 })
  let text = ""

  const update = () => {
    const { items, status: loading } = results.getState()
    autocomplete.items = items
    autocomplete.setAttribute("status", loading)
    list.textContent = loading === "loading" ? "Searching airports…" : items.length ? `${items.length} ${items.length === 1 ? "airport" : "airports"}` : ""
  }
  const unsubscribe = results.subscribe(update)
  update()

  autocomplete.addEventListener("valuechange", (event) => {
    text = (event as CustomEvent<{ value: string }>).detail.value
    empty.textContent = text
    results.setQuery(text)
  })
  root.querySelector("[data-search]")!.addEventListener("action", () => {
    status.textContent = airports.includes(text) ? `Searching flights to ${text}.` : "Choose an airport from the list first."
  })
  return () => {
    unsubscribe()
    results.cancel()
  }
}

const ui: UI = {
  id: "A23",
  request: "Build a flight search with a destination field that suggests airports while I type: the list loads after a short delay, and a search button uses my choice.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Destination airport", action: "setValue", args: ["Lisbon (LIS)"] },
      { ref: "Search flights", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Searching flights to Lisbon (LIS).",
  },
}

export default ui
