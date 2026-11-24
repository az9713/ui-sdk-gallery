import "@ui-sdk/web/combobox"
import type { UI } from "../src/ui"

const labels = ["Accessibility", "Billing", "Bug", "Design", "Documentation", "Feature", "Mobile", "Performance", "Security", "Testing"]

const issues = [
  { title: "Login fails after a password reset", labels: ["Bug", "Security"] },
  { title: "Dark mode for the settings page", labels: ["Feature", "Design"] },
  { title: "Document the webhook retry rules", labels: ["Documentation"] },
  { title: "Search is slow on large projects", labels: ["Bug", "Performance"] },
  { title: "Add tests for the billing export", labels: ["Testing", "Billing"] },
  { title: "An access token appears in the debug log", labels: ["Bug", "Security"] },
  { title: "Redesign the empty inbox", labels: ["Design"] },
  { title: "Cache the project list", labels: ["Feature", "Performance"] },
  { title: "A screen reader skips the filter chips", labels: ["Bug", "Accessibility"] },
  { title: "Invoice totals round the wrong way", labels: ["Bug", "Billing"] },
  { title: "Swipe to close the sheet on small screens", labels: ["Feature", "Mobile"] },
]

const html = `
<ui-combobox multiple name="labels">
  <div data-field>
    <ui-combobox-label>Filter by label</ui-combobox-label>
    <div data-row>
      <ui-combobox-chips>
        <ui-combobox-input><input placeholder="Search labels" /></ui-combobox-input>
      </ui-combobox-chips>
      <ui-combobox-trigger><button aria-label="Show all labels"></button></ui-combobox-trigger>
    </div>
  </div>
  <ui-combobox-content hidden>
    <ui-combobox-empty>No label matches.</ui-combobox-empty>
    <ui-combobox-list>
      ${labels
        .map(
          (label) => `<ui-combobox-item value="${label}" label="${label}">${label}<ui-combobox-item-indicator></ui-combobox-item-indicator></ui-combobox-item>`,
        )
        .join("")}
    </ui-combobox-list>
  </ui-combobox-content>
  <template>
    <ui-combobox-chip>
      <ui-combobox-chip-remove><button type="button">×</button></ui-combobox-chip-remove>
    </ui-combobox-chip>
  </template>
</ui-combobox>
<ul data-issues aria-label="Issues">
  ${issues
    .map(
      (issue) =>
        `<li data-labels="${issue.labels.join(",")}"><span>${issue.title}</span><span data-tags>${issue.labels.map((label) => `<span data-tag>${label}</span>`).join("")}</span></li>`,
    )
    .join("")}
</ul>
<p role="status" data-status>Showing all ${issues.length} issues.</p>`

const css = `
[data-stage] { display: grid; gap: 20px; max-width: 560px; }
[data-stage] [data-field] { display: grid; gap: 8px; }
[data-stage] [data-row] { display: flex; gap: 8px; align-items: flex-start; }
[data-stage] ui-combobox-chips { flex: 1; min-width: 0; }
[data-stage] [data-issues] { list-style: none; margin: 0; padding: 0; display: grid; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] [data-issues] li { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 16px; }
[data-stage] [data-issues] li + li { border-top: 1px solid var(--ui-border); }
[data-stage] [data-issues] li[hidden] { display: none; }
[data-stage] [data-tags] { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; flex-shrink: 0; }
[data-stage] [data-tag] { padding: 2px 8px; border-radius: 999px; background: var(--ui-muted); color: var(--ui-foreground); font-size: 0.8125rem; }
[data-stage] [data-status] { margin: 0; color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const combobox = root.querySelector("ui-combobox")!
  const rows = [...root.querySelectorAll<HTMLElement>("[data-issues] li")]
  const status = root.querySelector("[data-status]")!
  const list = new Intl.ListFormat("en", { type: "conjunction" })

  const show = (chosen: string[]) => {
    let shown = 0
    for (const row of rows) {
      const own = row.dataset.labels!.split(",")
      const match = chosen.every((label) => own.includes(label))
      row.hidden = !match
      if (match) shown++
    }
    status.textContent = chosen.length
      ? `Showing ${shown} of ${rows.length} issues labeled ${list.format(chosen)}.`
      : `Showing all ${rows.length} issues.`
  }

  combobox.addEventListener("valuechange", (event) => show((event as CustomEvent).detail.value as string[]))
}

const ui: UI = {
  id: "A16",
  request: "Build an issue list with a label filter: I search the labels, choose several, and the list shows only the issues that have all of them.",
  css,
  mount,
  task: {
    steps: [{ ref: "Filter by label", action: "setValue", args: [["Bug", "Security"]] }],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Showing 2 of 11 issues labeled Bug and Security.",
  },
}

export default ui
