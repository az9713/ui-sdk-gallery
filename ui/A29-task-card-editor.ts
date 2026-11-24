import { createConfirm } from "@ui-sdk/web/alert-dialog"
import "@ui-sdk/web/button"
import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/dialog"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/overlays"
import "@ui-sdk/web/popover"
import { createOverlays } from "@ui-sdk/core/overlays"
import type { UI } from "../src/ui"

const labels = ["Bug", "Docs", "Urgent"]

const html = `
<article data-card>
  <h2 data-card-title>Write release notes</h2>
  <ul data-chips aria-label="Labels on the card"></ul>
  <ui-dialog>
    <ui-dialog-trigger><button>Edit card</button></ui-dialog-trigger>
    <ui-dialog-backdrop hidden></ui-dialog-backdrop>
    <ui-dialog-content hidden>
      <ui-dialog-title>Edit task card</ui-dialog-title>
      <ui-dialog-description>Save to update the board.</ui-dialog-description>
      <ui-field>
        <ui-field-label>Card title</ui-field-label>
        <ui-input><input required /></ui-input>
      </ui-field>
      <ui-popover>
        <ui-popover-trigger><button>Labels</button></ui-popover-trigger>
        <ui-popover-content data-layer="labels">
          <ui-popover-title>Card labels</ui-popover-title>
          ${labels
            .map(
              (label) => `
          <ui-field data-row>
            <ui-checkbox name="${label}"><ui-checkbox-indicator></ui-checkbox-indicator></ui-checkbox>
            <ui-field-label>${label}</ui-field-label>
          </ui-field>`,
            )
            .join("")}
          <ui-popover>
            <ui-popover-trigger><button>Manage labels</button></ui-popover-trigger>
            <ui-popover-content data-layer="manage" side="right" align="start" side-offset="8">
              <ui-popover-title>Manage labels</ui-popover-title>
              <ui-popover-description>A label belongs to the whole board.</ui-popover-description>
              <ui-button data-clear><button>Clear board labels</button></ui-button>
              <div data-host data-agent-confirm="Removes each label from every card on the board"></div>
            </ui-popover-content>
          </ui-popover>
        </ui-popover-content>
      </ui-popover>
      <div data-answers>
        <ui-dialog-close><button>Cancel</button></ui-dialog-close>
        <ui-button data-save><button>Save card</button></ui-button>
      </div>
    </ui-dialog-content>
  </ui-dialog>
</article>
<p role="status" data-status>No change is saved.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 420px; }
[data-stage] p { margin: 0; }
[data-stage] [data-card] { display: grid; gap: 12px; justify-items: start; padding: 16px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] [data-card-title] { margin: 0; font-size: 18px; }
[data-stage] [data-chips] { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
[data-stage] [data-chips] li { padding: 2px 10px; border: 1px solid var(--ui-input); border-radius: 999px; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
[data-stage] ui-dialog-content { display: grid; gap: 16px; width: min(440px, calc(100vw - 32px)); }
[data-stage] ui-popover-content { display: grid; gap: 12px; padding: 16px; width: 240px; }
[data-stage] [data-row] { flex-direction: row; align-items: center; gap: 12px; }
[data-stage] [data-answers], [data-stage] [data-host] ui-alert-dialog-content > div { display: flex; justify-content: flex-end; gap: 12px; }
`

type Checkbox = HTMLElement & { checked: boolean }
type Opens = HTMLElement & { open: boolean }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const saved = { title: "Write release notes", labels: new Set(["Bug"]) }
  const draft = { title: saved.title, labels: new Set(saved.labels) }
  const status = root.querySelector("[data-status]")!
  const dialog = root.querySelector<Opens>("ui-dialog")!
  const input = root.querySelector("input")!
  const field = root.querySelector("ui-input") as HTMLElement & { api: { setValue: (value: string) => void } }
  const boxes = [...root.querySelectorAll<Checkbox>("ui-checkbox")]

  const overlays = createOverlays()
  const confirm = createConfirm({ overlays })
  root.querySelector("[data-host]")!.append(Object.assign(document.createElement("ui-overlay-host"), { overlays }))

  const show = () => {
    root.querySelector("[data-card-title]")!.textContent = saved.title
    root.querySelector("[data-chips]")!.innerHTML = [...saved.labels].map((label) => `<li>${label}</li>`).join("")
  }
  const fill = () => {
    field.api.setValue((draft.title = saved.title))
    draft.labels = new Set(saved.labels)
    for (const box of boxes) box.checked = draft.labels.has(box.getAttribute("name")!)
  }
  show()
  fill()

  field.addEventListener("valuechange", (e) => (draft.title = (e as CustomEvent).detail.value))
  for (const box of boxes)
    box.addEventListener("checkedchange", (e) => {
      const label = box.getAttribute("name")!
      if ((e as CustomEvent).detail.value) draft.labels.add(label)
      else draft.labels.delete(label)
    })
  dialog.addEventListener("openchange", (e) => {
    if ((e as CustomEvent).detail.value) fill()
  })
  root.querySelector("[data-save]")!.addEventListener("action", () => {
    if (!input.value.trim()) {
      status.textContent = "Not saved: the card needs a title."
      input.focus()
      return
    }
    saved.title = input.value.trim()
    saved.labels = new Set(labels.filter((label) => draft.labels.has(label)))
    show()
    status.textContent = `Saved: ${saved.title}, labels ${[...saved.labels].join(", ") || "none"}.`
    dialog.open = false
  })
  const popovers = [...root.querySelectorAll("ui-popover")]
  // The press returns before the answer: an agent's next step answers the question.
  // The bridge's Allow prompt takes focus, and focus leaving closes a popover with the confirm in it.
  root.querySelector("[data-clear]")!.addEventListener("action", () => {
    for (const popover of popovers) popover.setAttribute("dismissible", "false")
    void confirm({
      title: "Remove each label from the board?",
      description: "Every card on the board loses its labels.",
      confirmLabel: "Remove labels",
      cancelLabel: "Keep labels",
    }).then((yes) => {
      for (const popover of popovers) popover.removeAttribute("dismissible")
      if (!yes) return
      saved.labels.clear()
      draft.labels.clear()
      for (const box of boxes) box.checked = false
      show()
      status.textContent = "Removed each label from the board."
    })
  })
}

const ui: UI = {
  id: "A29",
  request: "Build a task card editor in a dialog, with a labels popover, a nested popover to manage labels, and a confirm on top, where Escape closes 1 layer each time.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Edit task card", action: "press" },
      { ref: "Card labels", action: "press" },
      { ref: "Manage labels", action: "press" },
      { ref: "Clear board labels", action: "press" },
      { ref: "Remove each label from the board?", action: "press", args: ["Remove labels"] },
      { ref: "Docs", action: "setChecked", args: [true] },
      { ref: "Card title", action: "setValue", args: ["Write the 2.0 release notes"] },
      { ref: "Save card", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Saved: Write the 2.0 release notes, labels Docs.",
  },
}

export default ui
