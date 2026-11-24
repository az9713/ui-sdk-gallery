import { createLocalStorage, createPreference } from "@ui-sdk/core"
import "@ui-sdk/web/field"
import "@ui-sdk/web/preferences"
import "@ui-sdk/web/segmented-control"
import type { UI } from "../src/ui"

const files = [
  { name: "Q3 roadmap.pdf", detail: "2.4 MB" },
  { name: "Launch checklist.md", detail: "12 KB" },
  { name: "Offsite photos", detail: "24 items" },
  { name: "Brand assets.zip", detail: "18 MB" },
]

const control = (label: string, name: string, items: [string, string][]) => `
    <ui-field>
      <ui-field-label>${label}</ui-field-label>
      <ui-segmented-control data-pref="${name}">
        <ui-segmented-control-indicator></ui-segmented-control-indicator>
        ${items.map(([value, text]) => `<ui-segmented-control-item value="${value}">${text}</ui-segmented-control-item>`).join("")}
      </ui-segmented-control>
    </ui-field>`

const html = `
<ui-preferences>
  <div data-slot="stack">
    <div data-slot="controls">
      ${control("File view", "view", [["list", "List"], ["grid", "Grid"]])}
      ${control("Row density", "density", [["comfortable", "Comfortable"], ["compact", "Compact"]])}
    </div>
    <ul data-slot="files" aria-label="Files">
      ${files.map((file) => `<li><span>${file.name}</span><span data-slot="hint">${file.detail}</span></li>`).join("")}
    </ul>
  </div>
</ui-preferences>
<p role="status" data-status>No change is saved.</p>`

const css = `
[data-stage] { display: grid; gap: 24px; max-width: 520px; }
[data-stage] [data-slot="stack"] { display: grid; gap: 24px; }
[data-stage] [data-slot="controls"] { display: flex; flex-wrap: wrap; gap: 24px; }
[data-stage] [data-slot="files"] { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
[data-stage] [data-slot="files"] li { display: flex; justify-content: space-between; gap: 12px; padding: 12px 16px; border: 1px solid var(--ui-border); border-radius: 8px; }
[data-stage] [data-slot="hint"] { color: var(--ui-muted-foreground); }
[data-stage] [data-view="grid"] [data-slot="files"] { grid-template-columns: repeat(2, 1fr); }
[data-stage] [data-view="grid"] [data-slot="files"] li { flex-direction: column; }
[data-stage] [data-density="compact"] [data-slot="files"] { gap: 4px; }
[data-stage] [data-density="compact"] [data-slot="files"] li { padding: 4px 12px; }
[data-stage] [data-status] { margin: 0; color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const view = createPreference({ values: ["list", "grid"], defaultValue: "list", attribute: "data-view", storage: createLocalStorage("a25-view") })
  const density = createPreference({
    values: ["comfortable", "compact"],
    defaultValue: "comfortable",
    attribute: "data-density",
    storage: createLocalStorage("a25-density"),
  })
  const status = root.querySelector("[data-status]")!
  root.querySelector("ui-preferences")!.preferences = [view, density]

  const bind = (name: string, preference: typeof view | typeof density, noun: string) => {
    const element = root.querySelector(`[data-pref=${name}]`)!
    const sync = () => element.setAttribute("value", preference.get().value)
    sync()
    const stop = preference.subscribe(sync)
    const change = (event: Event) => {
      const next = (event as CustomEvent).detail.value as string
      if (next === preference.get().value) return
      (preference as typeof view).set(next as never, { reason: "press" })
      status.textContent = `Saved the ${next} ${noun}.`
    }
    element.addEventListener("valuechange", change)
    return () => {
      stop()
      element.removeEventListener("valuechange", change)
    }
  }
  const stops = [bind("view", view, "view"), bind("density", density, "density")]
  return () => {
    for (const stop of stops) stop()
    root.querySelector("ui-preferences")!.preferences = []
  }
}

const ui: UI = {
  id: "A25",
  request: "Build a display preferences panel with a list or grid view and a comfortable or compact density that the page saves between visits.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Row density", action: "setValue", args: ["Compact"] },
      { ref: "File view", action: "setValue", args: ["Grid"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Saved the grid view." && root.querySelector("ui-preferences")!.getAttribute("data-density") === "compact",
  },
}

export default ui
