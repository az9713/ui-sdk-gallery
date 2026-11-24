import "@ui-sdk/web/button"
import "@ui-sdk/web/hover-card"
import "@ui-sdk/web/menu"
import "@ui-sdk/web/navigation-menu"
import type { UI } from "../src/ui"

const html = `
<header data-header>
  <a data-brand href="#home">Lumen</a>
  <ui-navigation-menu aria-label="Site sections">
    <ui-navigation-menu-list>
      <ui-navigation-menu-item value="products">
        <ui-navigation-menu-trigger><button>Products</button></ui-navigation-menu-trigger>
        <ui-navigation-menu-content>
          <ul data-links>
            <li><ui-navigation-menu-link><a href="#analytics"><span>Analytics</span><span data-slot="hint">Dashboards that update as events arrive.</span></a></ui-navigation-menu-link></li>
            <li><ui-navigation-menu-link><a href="#automations"><span>Automations</span><span data-slot="hint">Run a task when a rule matches.</span></a></ui-navigation-menu-link></li>
            <li><ui-navigation-menu-link><a href="#integrations"><span>Integrations</span><span data-slot="hint">Connect 40 tools in one step.</span></a></ui-navigation-menu-link></li>
          </ul>
        </ui-navigation-menu-content>
      </ui-navigation-menu-item>
      <ui-navigation-menu-item value="resources">
        <ui-navigation-menu-trigger><button>Resources</button></ui-navigation-menu-trigger>
        <ui-navigation-menu-content>
          <ul data-links>
            <li><ui-navigation-menu-link><a href="#guides"><span>Guides</span><span data-slot="hint">Short lessons for each feature.</span></a></ui-navigation-menu-link></li>
            <li><ui-navigation-menu-link><a href="#api"><span>API reference</span><span data-slot="hint">Every endpoint with an example.</span></a></ui-navigation-menu-link></li>
          </ul>
        </ui-navigation-menu-content>
      </ui-navigation-menu-item>
      <ui-navigation-menu-item value="pricing">
        <ui-navigation-menu-link><a href="#pricing">Pricing</a></ui-navigation-menu-link>
      </ui-navigation-menu-item>
    </ui-navigation-menu-list>
    <ui-navigation-menu-viewport side-offset="8"></ui-navigation-menu-viewport>
  </ui-navigation-menu>
  <ui-hover-card delay="100" close-delay="100">
    <ui-hover-card-trigger><a href="#release-4-2">What is new in 4.2</a></ui-hover-card-trigger>
    <ui-hover-card-content hidden>
      <div data-preview>
        <p data-title>Release 4.2</p>
        <p>Saved views, a faster export, and 3 new chart types.</p>
        <p data-slot="hint">Published 12 March 2026</p>
      </div>
      <ui-hover-card-arrow></ui-hover-card-arrow>
    </ui-hover-card-content>
  </ui-hover-card>
  <ui-menu>
    <ui-menu-trigger><button aria-label="Account menu for Hollis Grant">Hollis Grant</button></ui-menu-trigger>
    <ui-menu-content hidden>
      <ui-menu-item value="profile">Your profile</ui-menu-item>
      <ui-menu-item value="billing">Billing</ui-menu-item>
      <ui-menu-separator></ui-menu-separator>
      <ui-menu-item value="sign-out" data-agent-confirm="Signs Hollis Grant out on this device">Sign out</ui-menu-item>
    </ui-menu-content>
  </ui-menu>
</header>
<p role="status" data-status>No link is opened.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 880px; }
[data-stage] p { margin: 0; }
[data-stage] [data-header] { display: flex; align-items: center; gap: 24px; padding: 8px 16px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-background); }
[data-stage] [data-brand] { font-weight: 700; color: var(--ui-foreground); text-decoration: none; }
[data-stage] ui-navigation-menu { flex: 1; }
[data-stage] [data-links] { list-style: none; margin: 0; padding: 8px; display: grid; gap: 4px; width: 320px; }
[data-stage] [data-links] a { display: grid; gap: 2px; padding: 8px 12px; border-radius: var(--ui-radius); color: var(--ui-foreground); text-decoration: none; }
[data-stage] [data-links] a:hover { background: var(--ui-muted); }
[data-stage] [data-links] [data-slot="hint"] { color: var(--ui-muted-foreground); font-size: 0.875em; }
[data-stage] ui-hover-card-trigger a { color: var(--ui-foreground); }
[data-stage] ui-hover-card-content { width: 260px; padding: 12px; }
[data-stage] [data-preview] { display: grid; gap: 4px; }
[data-stage] [data-title] { font-weight: 600; }
[data-stage] [data-slot="hint"] { color: var(--ui-muted-foreground); font-size: 0.875em; }
[data-stage] [data-status] { color: var(--ui-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const names: Record<string, string> = {}
  for (const link of root.querySelectorAll<HTMLAnchorElement>("a[href^='#']")) {
    names[link.getAttribute("href")!] = link.querySelector("span")?.textContent ?? link.textContent!.trim()
    link.addEventListener("click", (event) => {
      event.preventDefault()
      status.textContent = `Opened: ${names[link.getAttribute("href")!]}.`
    })
  }
  root.querySelector("ui-menu")!.addEventListener("action", (event) => {
    const value = (event as CustomEvent).detail.value as string
    status.textContent = value === "sign-out" ? "Signed out." : `Opened: ${value === "profile" ? "Your profile" : "Billing"}.`
  })
}

const ui: UI = {
  id: "A10",
  request: "Build a site header with a Products and a Resources panel of links, a Pricing link, a link that previews on hover, and an account menu that asks before it signs out.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Site sections", action: "setValue", args: ["Resources"] },
      { ref: "What is new in 4.2", action: "press" },
      { ref: "Account menu for Hollis Grant", action: "press", args: ["Sign out"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Signed out.",
  },
}

export default ui
