import "@ui-sdk/web/drawer"
import type { UI } from "../src/ui"

const pages = [
  { value: "home", label: "Home" },
  { value: "orders", label: "Orders" },
  { value: "messages", label: "Messages" },
  { value: "account", label: "Account" },
]

const html = `
<div data-phone>
  <header data-bar>
    <ui-drawer side="left" prevent-edge-swipe>
      <ui-drawer-trigger><button>Open menu</button></ui-drawer-trigger>
      <ui-drawer-backdrop hidden></ui-drawer-backdrop>
      <ui-drawer-content hidden>
        <ui-drawer-title>Main navigation</ui-drawer-title>
        <ui-drawer-description>Go to a page of the shop app.</ui-drawer-description>
        <nav data-pages>
          ${pages.map((p) => `<ui-drawer-close value="${p.value}"><button>${p.label}</button></ui-drawer-close>`).join("")}
        </nav>
        <ui-drawer-close><button data-variant="outline">Close menu</button></ui-drawer-close>
      </ui-drawer-content>
    </ui-drawer>
    <span data-brand>Fernbar</span>
  </header>
  <main data-page>
    <h2 data-heading>Home</h2>
    <p>Your latest activity appears here.</p>
  </main>
  <p role="status" data-status>No page is chosen.</p>
</div>`

const css = `
[data-stage] { display: grid; max-width: 390px; }
[data-stage] p, [data-stage] h2 { margin: 0; }
[data-stage] [data-phone] { display: grid; gap: 12px; padding: 12px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-background); }
[data-stage] [data-bar] { display: flex; align-items: center; gap: 12px; }
[data-stage] [data-brand] { font-weight: 700; color: var(--ui-foreground); }
[data-stage] [data-page] { display: grid; gap: 8px; padding: 16px 4px; color: var(--ui-foreground); }
[data-stage] [data-status] { color: var(--ui-foreground); }
[data-stage] ui-drawer-content { width: min(280px, 80vw); padding: 16px; display: grid; gap: 12px; align-content: start; background: var(--ui-background); color: var(--ui-foreground); }
[data-stage] [data-pages] { display: grid; gap: 4px; }
[data-stage] [data-pages] button { width: 100%; justify-content: flex-start; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const heading = root.querySelector("[data-heading]")!
  root.querySelector("ui-drawer")!.addEventListener("openchange", (event) => {
    const { value, returnValue } = (event as CustomEvent).detail as { value: boolean; returnValue?: string }
    if (value) return
    const page = pages.find((p) => p.value === returnValue)
    if (!page) {
      status.textContent = "Menu closed. No page is chosen."
      return
    }
    heading.textContent = page.label
    status.textContent = `Opened page: ${page.label}.`
  })
}

const ui: UI = {
  id: "A20",
  request: "Build a phone navigation drawer that slides in from the left edge, lists 4 pages, and closes when a page is chosen.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Main navigation", action: "press" },
      { ref: "Main navigation", action: "press", args: ["Orders"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Opened page: Orders.",
  },
}

export default ui
