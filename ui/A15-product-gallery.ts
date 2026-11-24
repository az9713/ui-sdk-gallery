import "@ui-sdk/web/carousel"
import "@ui-sdk/web/pagination"
import "@ui-sdk/web/rating"
import type { UiRatingElement } from "@ui-sdk/web"
import type { UI } from "../src/ui"

const products = [
  { name: "Trail Lantern", price: "$34" },
  { name: "Ridge Backpack", price: "$120" },
  { name: "Summit Bottle", price: "$22" },
  { name: "Camp Stove", price: "$58" },
]

const results = [
  "Trail Lantern", "Ridge Backpack", "Summit Bottle",
  "Camp Stove", "Dome Tent", "Fleece Jacket",
  "Wool Socks", "Rain Shell", "Compass Watch",
]
const perPage = 3
const star = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6L2.5 9.5l6.6-.9z"/></svg>`
const chevron = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="${d}"/></svg>`

const html = `
<h2>Product gallery</h2>
<ui-carousel aria-label="Featured products">
  <div data-row>
    <ui-carousel-previous><button aria-label="Previous product">${chevron("M15 6l-6 6 6 6")}</button></ui-carousel-previous>
    <ui-carousel-viewport>
      <ui-carousel-content>
        ${products.map((p) => `<ui-carousel-item><div data-tile><strong>${p.name}</strong><span>${p.price}</span></div></ui-carousel-item>`).join("")}
      </ui-carousel-content>
    </ui-carousel-viewport>
    <ui-carousel-next><button aria-label="Next product">${chevron("M9 6l6 6-6 6")}</button></ui-carousel-next>
  </div>
  <ui-carousel-indicator-group aria-label="Choose a product">
    ${products.map((p) => `<ui-carousel-indicator><button aria-label="${p.name}"></button></ui-carousel-indicator>`).join("")}
  </ui-carousel-indicator-group>
</ui-carousel>
<div data-rate>
  <span data-rate-label>Score for the product on show</span>
  <ui-rating aria-label="Product score" deselectable>
    <template><ui-rating-item>${star}</ui-rating-item></template>
  </ui-rating>
</div>
<h2>Result pages</h2>
<ul data-results aria-label="Results"></ul>
<ui-pagination aria-label="Result pages" page-count="${Math.ceil(results.length / perPage)}">
  <ui-pagination-list>
    <ui-pagination-item>
      <ui-pagination-previous><button data-variant="ghost">${chevron("M15 6l-6 6 6 6")}<span data-slot="visually-hidden">Previous page</span></button></ui-pagination-previous>
    </ui-pagination-item>
    <template>
      <ui-pagination-item><ui-pagination-link><button data-variant="ghost"></button></ui-pagination-link></ui-pagination-item>
    </template>
    <ui-pagination-item>
      <ui-pagination-next><button data-variant="ghost"><span data-slot="visually-hidden">Next page</span>${chevron("M9 6l6 6-6 6")}</button></ui-pagination-next>
    </ui-pagination-item>
  </ui-pagination-list>
</ui-pagination>
<p role="status" data-status>No score is saved.</p>`

const css = `
[data-stage] { display: grid; gap: 20px; max-width: 560px; }
[data-stage] h2 { margin: 0; font-size: 1.125rem; }
[data-stage] [data-row] { display: flex; align-items: center; gap: 8px; }
[data-stage] ui-carousel { display: block; width: 100%; }
[data-stage] ui-carousel-viewport { flex: 1; min-width: 0; }
[data-stage] ui-carousel-indicator button { width: 12px; height: 12px; padding: 0; border-radius: 50%; border: 2px solid var(--ui-muted-foreground); background: transparent; }
[data-stage] ui-carousel-indicator button[aria-selected=true] { background: var(--ui-foreground); border-color: var(--ui-foreground); }
[data-stage] ui-carousel-item { flex: 0 0 100%; padding: 0 4px; box-sizing: border-box; }
[data-stage] [data-tile] { display: grid; place-content: center; gap: 4px; height: 120px; text-align: center; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-muted); color: var(--ui-foreground); }
[data-stage] ui-carousel-indicator-group { display: flex; justify-content: center; gap: 8px; margin-top: 12px; }
[data-stage] [data-rate] { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
[data-stage] ui-rating-item { color: var(--ui-muted-foreground); }
[data-stage] ui-rating-item[data-filled] { color: var(--ui-foreground); }
[data-stage] [data-results] { margin: 0; padding-left: 20px; display: grid; gap: 4px; min-height: 72px; }
[data-stage] [data-status] { margin: 0; color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const carousel = root.querySelector("ui-carousel")!
  const rating = root.querySelector("ui-rating") as UiRatingElement
  const pagination = root.querySelector("ui-pagination")!
  const list = root.querySelector("[data-results]")!
  const status = root.querySelector("[data-status]")!
  const scores: Record<string, number> = {}
  let shown = products[0].name
  let syncing = false

  const showResults = (page: number) => {
    list.innerHTML = results.slice((page - 1) * perPage, page * perPage).map((name) => `<li>${name}</li>`).join("")
  }
  showResults(1)

  carousel.addEventListener("pagechange", (e) => {
    shown = products[(e as CustomEvent).detail.value - 1].name
    syncing = true
    rating.api.setValue(scores[shown] ?? null)
    syncing = false
  })
  rating.addEventListener("valuechange", (e) => {
    if (syncing) return
    const value = (e as CustomEvent).detail.value as number | null
    if (value) scores[shown] = value
    else delete scores[shown]
    status.textContent = value ? `Scored ${shown}: ${value} of 5.` : `Score cleared for ${shown}.`
  })
  pagination.addEventListener("pagechange", (e) => {
    const page = (e as CustomEvent).detail.value as number
    showResults(page)
    status.textContent = `Showing results ${(page - 1) * perPage + 1} to ${Math.min(page * perPage, results.length)} of ${results.length}.`
  })
}

const ui: UI = {
  id: "A15",
  request: "Build a product gallery: a carousel of 4 products, a star score for the product on show, and numbered result pages below.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Result pages", action: "setPage", args: [2] },
      { ref: "Featured products", action: "setPage", args: [3] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Showing results 4 to 6 of 9." &&
      root.querySelector("[data-results] li")!.textContent === "Camp Stove" &&
      root.querySelector("ui-carousel-indicator [aria-selected=true]")?.getAttribute("aria-label") === "Summit Bottle",
  },
}

export default ui
