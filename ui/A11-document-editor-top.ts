import "@ui-sdk/web/menu"
import "@ui-sdk/web/menubar"
import "@ui-sdk/web/separator"
import "@ui-sdk/web/toggle"
import "@ui-sdk/web/toolbar"
import "@ui-sdk/web/tooltip"
import type { UI } from "../src/ui"

const styles = [
  { value: "bold", label: "Bold", hint: "Make the selected text bold" },
  { value: "italic", label: "Italic", hint: "Slant the selected text" },
  { value: "underline", label: "Underline", hint: "Draw a line under the selected text" },
]
const aligns = [
  { value: "left", label: "Align left", hint: "Line the paragraph up on the left edge" },
  { value: "center", label: "Align center", hint: "Center the paragraph on the page" },
  { value: "right", label: "Align right", hint: "Line the paragraph up on the right edge" },
]

const tip = (hint: string, body: string) => `
<ui-tooltip>
  <ui-tooltip-trigger>${body}</ui-tooltip-trigger>
  <ui-tooltip-content>${hint}</ui-tooltip-content>
</ui-tooltip>`

const html = `
<div data-editor>
  <ui-menubar aria-label="Application menu">
    <ui-menu>
      <ui-menu-trigger><button>File</button></ui-menu-trigger>
      <ui-menu-content hidden>
        <ui-menu-item value="save">Save document</ui-menu-item>
        <ui-menu-item value="export">Export as PDF</ui-menu-item>
      </ui-menu-content>
    </ui-menu>
    <ui-menu>
      <ui-menu-trigger><button>Edit</button></ui-menu-trigger>
      <ui-menu-content hidden>
        <ui-menu-item value="copy">Copy text</ui-menu-item>
        <ui-menu-item value="paste">Paste text</ui-menu-item>
      </ui-menu-content>
    </ui-menu>
    <ui-menu>
      <ui-menu-trigger><button>View</button></ui-menu-trigger>
      <ui-menu-content hidden>
        <ui-menu-checkbox-item value="ruler"><ui-menu-item-indicator></ui-menu-item-indicator>Show ruler</ui-menu-checkbox-item>
      </ui-menu-content>
    </ui-menu>
  </ui-menubar>
  <ui-separator></ui-separator>
  <ui-toolbar aria-label="Formatting">
    <ui-toggle-group multiple aria-label="Text style" data-styles>
      ${styles.map((s) => tip(s.hint, `<ui-toggle value="${s.value}"><button>${s.label}</button></ui-toggle>`)).join("")}
    </ui-toggle-group>
    <ui-toolbar-separator></ui-toolbar-separator>
    <ui-toggle-group default-value="left" deselectable="false" aria-label="Alignment" data-aligns>
      ${aligns.map((a) => tip(a.hint, `<ui-toggle value="${a.value}"><button>${a.label}</button></ui-toggle>`)).join("")}
    </ui-toggle-group>
    <ui-toolbar-separator></ui-toolbar-separator>
    ${tip("Add a link to the selected text", `<ui-toolbar-button><button data-link>Insert link</button></ui-toolbar-button>`)}
  </ui-toolbar>
  <p data-page>The quarterly report starts here.</p>
</div>
<p role="status" data-status>No command has run.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 760px; }
[data-stage] p { margin: 0; }
[data-stage] [data-editor] { border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-background); }
[data-stage] ui-menubar, [data-stage] ui-toolbar { border: 0; border-radius: 0; }
[data-stage] ui-menubar { display: flex; gap: 4px; padding: 4px 8px; }
[data-stage] ui-toolbar { display: flex; align-items: center; gap: 8px; padding: 4px 8px; }
[data-stage] [data-page] { padding: 24px 16px; min-height: 80px; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const state = { styles: [] as string[], align: "left", ruler: false }
  const on = (selector: string, event: string, change: (detail: never) => void) =>
    root.querySelector(selector)!.addEventListener(event, (e) => change((e as CustomEvent).detail as never))

  on("[data-styles]", "valuechange", (d: { value: string[] }) => {
    state.styles = d.value
    status.textContent = `Text style: ${d.value.join(", ") || "plain"}.`
  })
  on("[data-aligns]", "valuechange", (d: { value: string[] }) => {
    state.align = d.value[0] ?? state.align
    status.textContent = `Alignment: ${state.align}.`
  })
  for (const menu of root.querySelectorAll("ui-menu"))
    menu.addEventListener("action", (e) => {
      const value = (e as CustomEvent).detail.value as string
      status.textContent = value === "save" ? `Saved: ${state.styles.join(", ") || "plain"}, ${state.align}.` : `Ran: ${value}.`
    })
  on("ui-menu-checkbox-item", "checkedchange", (d: { value: boolean }) => {
    state.ruler = d.value
    status.textContent = `Ruler: ${d.value ? "on" : "off"}.`
  })
  root.querySelector("[data-link]")!.addEventListener("click", () => (status.textContent = "Link dialog opened."))
}

const ui: UI = {
  id: "A11",
  request: "Build the top of a document editor: a File, Edit and View menu bar above a formatting toolbar with style and alignment toggles that show a hint on hover.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Bold", action: "setPressed", args: [true] },
      { ref: "Align center", action: "setPressed", args: [true] },
      { ref: "File", action: "press", args: ["Save document"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Saved: bold, center.",
  },
}

export default ui
