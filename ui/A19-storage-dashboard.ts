import "@ui-sdk/web/button"
import "@ui-sdk/web/meter"
import "@ui-sdk/web/progress"
import type { UI } from "../src/ui"

const folders = ["Documents", "Photos", "Projects", "Mail"]
const quota = 15
const start = { used: 10.2, trash: 4.2 }

const html = `
<h2>Storage</h2>
<ui-meter data-used value="${start.used}" max="${quota}">
  <ui-meter-label>Storage used</ui-meter-label>
  <ui-meter-value></ui-meter-value>
  <ui-meter-track><ui-meter-indicator></ui-meter-indicator></ui-meter-track>
</ui-meter>
<ui-meter data-trash value="${start.trash}" max="${quota}">
  <ui-meter-label>Trash size</ui-meter-label>
  <ui-meter-value></ui-meter-value>
  <ui-meter-track><ui-meter-indicator></ui-meter-indicator></ui-meter-track>
</ui-meter>
<ui-button data-empty><button>Empty trash</button></ui-button>
<h2>Backup</h2>
<ui-progress data-backup value="0" max="${folders.length}">
  <ui-progress-label>Backup progress</ui-progress-label>
  <ui-progress-value></ui-progress-value>
  <ui-progress-track><ui-progress-indicator></ui-progress-indicator></ui-progress-track>
</ui-progress>
<ui-button data-next><button>Back up next folder</button></ui-button>
<p role="status" data-status>Nothing changed yet.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 480px; justify-items: start; }
[data-stage] h2 { margin: 8px 0 0; font-size: 1.1rem; }
[data-stage] ui-meter, [data-stage] ui-progress { display: grid; gap: 6px; width: 100%; }
[data-stage] ui-meter-track, [data-stage] ui-progress-track { display: block; height: 10px; border-radius: 5px; background: var(--ui-muted); }
[data-stage] ui-meter-indicator, [data-stage] ui-progress-indicator { display: block; height: 100%; border-radius: 5px; background: var(--ui-primary); }
[data-stage] ui-meter-label, [data-stage] ui-progress-label { color: var(--ui-foreground); }
[data-stage] ui-meter-value, [data-stage] ui-progress-value { color: var(--ui-muted-foreground); }
[data-stage] [data-status] { margin: 0; color: var(--ui-muted-foreground); }
`

type Gauge = HTMLElement & { format?: unknown; getValueLabel?: unknown }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const used = root.querySelector<Gauge>("[data-used]")!
  const trash = root.querySelector<Gauge>("[data-trash]")!
  const backup = root.querySelector<Gauge>("[data-backup]")!
  const status = root.querySelector("[data-status]")!
  for (const meter of [used, trash]) meter.format = { style: "unit", unit: "gigabyte" }
  backup.format = (done: number) => `${done} of ${folders.length} folders`
  backup.getValueLabel = (done: number, d: { max: number }) => `${done} of ${d.max} folders backed up`

  let usedNow = start.used
  let trashNow = start.trash
  let done = 0
  const gb = (n: number) => Math.round(n * 10) / 10

  root.querySelector("[data-empty]")!.addEventListener("action", () => {
    if (trashNow === 0) return void (status.textContent = "Trash is already empty.")
    const freed = trashNow
    usedNow = gb(usedNow - trashNow)
    trashNow = 0
    used.setAttribute("value", String(usedNow))
    trash.setAttribute("value", "0")
    status.textContent = `Trash emptied: ${freed} GB freed, ${usedNow} GB used.`
  })
  root.querySelector("[data-next]")!.addEventListener("action", () => {
    if (done >= folders.length) return void (status.textContent = "Backup is already complete.")
    done++
    backup.setAttribute("value", String(done))
    status.textContent =
      done === folders.length
        ? `Backup complete: ${done} of ${folders.length} folders.`
        : `Backed up ${folders[done - 1]}: ${done} of ${folders.length} folders.`
  })
}

const ui: UI = {
  id: "A19",
  request:
    "Build a storage dashboard: meters for storage used and trash size out of 15 GB, a button that empties the trash, and a backup progress bar that advances one folder at a time.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Empty trash", action: "press" },
      { ref: "Back up next folder", action: "press" },
      { ref: "Back up next folder", action: "press" },
      { ref: "Back up next folder", action: "press" },
      { ref: "Back up next folder", action: "press" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Backup complete: 4 of 4 folders." &&
      root.querySelector("[data-trash]")!.getAttribute("aria-valuenow") === "0",
  },
}

export default ui
