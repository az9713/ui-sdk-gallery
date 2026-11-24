import "@ui-sdk/web/command"
import "@ui-sdk/web/dialog"
import type { UI } from "../src/ui"

const files = ["main.ts", "palette.ts", "README.md"]
const code = [
  `import { open } from "./palette"`,
  ``,
  `export function start(root: HTMLElement) {`,
  `  const editor = createEditor(root, { tabSize: 2 })`,
  `  editor.onSave((text) => console.log("saved", text.length))`,
  `  return editor`,
  `}`,
].join("\n")

const html = `
<div data-editor>
  <div data-toolbar>
    <span data-file>main.ts</span>
    <ui-dialog>
      <ui-dialog-trigger shortcut="mod+k">
        <button>Open palette <ui-dialog-shortcut></ui-dialog-shortcut></button>
      </ui-dialog-trigger>
      <ui-dialog-backdrop hidden></ui-dialog-backdrop>
      <ui-dialog-content hidden>
        <ui-dialog-title>Command palette</ui-dialog-title>
        <ui-command>
          <ui-command-input><input aria-label="Find a command" placeholder="Type a command…" /></ui-command-input>
          <ui-command-empty>No command matches.</ui-command-empty>
          <ui-command-list>
            <ui-command-group>
              <ui-command-group-label>File</ui-command-group-label>
              <ui-command-item value="new-file" keywords="create,add"><ui-command-item-text>New file</ui-command-item-text></ui-command-item>
              <ui-command-item value="save-file" shortcut="mod+s"><ui-command-item-text>Save file</ui-command-item-text><ui-command-shortcut></ui-command-shortcut></ui-command-item>
              <ui-command-item value="close-file" disabled><ui-command-item-text>Close all files</ui-command-item-text></ui-command-item>
            </ui-command-group>
            <ui-command-separator></ui-command-separator>
            <ui-command-group>
              <ui-command-group-label>View</ui-command-group-label>
              <ui-command-item value="toggle-wrap" keywords="wrap,lines"><ui-command-item-text>Toggle word wrap</ui-command-item-text></ui-command-item>
              <ui-command-item value="toggle-sidebar" keywords="files,explorer"><ui-command-item-text>Toggle sidebar</ui-command-item-text></ui-command-item>
              <ui-command-item value="format" keywords="prettier,indent"><ui-command-item-text>Format document</ui-command-item-text></ui-command-item>
            </ui-command-group>
          </ui-command-list>
        </ui-command>
      </ui-dialog-content>
    </ui-dialog>
  </div>
  <div data-body>
    <ul data-sidebar aria-label="Project files">${files.map((f) => `<li>${f}</li>`).join("")}</ul>
    <pre data-code tabindex="0" role="region" aria-label="Source of main.ts">${code.replaceAll("<", "&lt;")}</pre>
  </div>
</div>
<p role="status" data-status>No command has run.</p>
<p data-state>Word wrap off, sidebar shown, 1 file open, saved 0 times.</p>`

const css = `
[data-stage] { display: grid; gap: 12px; max-width: 760px; }
[data-stage] p { margin: 0; }
[data-stage] [data-editor] { border: 1px solid var(--ui-border); border-radius: var(--ui-radius); overflow: hidden; }
[data-stage] [data-toolbar] { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--ui-border); background: var(--ui-muted); }
[data-stage] [data-file] { font-family: var(--ui-font-mono); }
[data-stage] [data-body] { display: grid; grid-template-columns: auto 1fr; min-height: 160px; }
[data-stage] [data-editor][data-sidebar-hidden] [data-body] { grid-template-columns: 1fr; }
[data-stage] [data-editor][data-sidebar-hidden] [data-sidebar] { display: none; }
[data-stage] [data-sidebar] { list-style: none; margin: 0; padding: 12px 16px; border-right: 1px solid var(--ui-border); display: grid; align-content: start; gap: 4px; }
[data-stage] [data-code] { margin: 0; padding: 12px 16px; font-family: var(--ui-font-mono); font-size: 13px; line-height: 1.6; overflow-x: auto; white-space: pre; }
[data-stage] [data-editor][data-wrap] [data-code] { white-space: pre-wrap; overflow-wrap: anywhere; }
[data-stage] [data-status] { color: var(--ui-foreground); }
[data-stage] [data-state] { color: var(--ui-muted-foreground); }
[data-stage] ui-dialog-content { display: grid; gap: 12px; width: min(560px, calc(100vw - 32px)); }
`

type CommandEl = HTMLElement & { query: string; value: string | null }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const editor = root.querySelector<HTMLElement>("[data-editor]")!
  const status = root.querySelector("[data-status]")!
  const state = root.querySelector("[data-state]")!
  const dialog = root.querySelector("ui-dialog")! as HTMLElement & { open: boolean }
  const doc = { wrap: false, sidebar: true, files: 1, saves: 0, formatted: false }
  const labels: Record<string, string> = {
    "new-file": "New file",
    "save-file": "Save file",
    "toggle-wrap": "Toggle word wrap",
    "toggle-sidebar": "Toggle sidebar",
    format: "Format document",
  }
  const show = () => {
    editor.toggleAttribute("data-wrap", doc.wrap)
    editor.toggleAttribute("data-sidebar-hidden", !doc.sidebar)
    state.textContent = `Word wrap ${doc.wrap ? "on" : "off"}, sidebar ${doc.sidebar ? "shown" : "hidden"}, ${doc.files} ${doc.files === 1 ? "file" : "files"} open, saved ${doc.saves} ${doc.saves === 1 ? "time" : "times"}.`
  }
  const run: Record<string, () => void> = {
    "new-file": () => doc.files++,
    "save-file": () => doc.saves++,
    "toggle-wrap": () => (doc.wrap = !doc.wrap),
    "toggle-sidebar": () => (doc.sidebar = !doc.sidebar),
    format: () => (doc.formatted = true),
  }

  root.querySelector("ui-command")!.addEventListener("action", (event) => {
    const value = (event as CustomEvent<{ value: string }>).detail.value
    run[value]?.()
    status.textContent = `Ran: ${labels[value]}.`
    show()
    dialog.open = false
  })
  // The search text and the highlight of the last visit would stay on the next open.
  dialog.addEventListener("openchange", (event) => {
    if (!(event as CustomEvent<{ value: boolean }>).detail.value) {
      const command = root.querySelector("ui-command") as CommandEl
      command.query = ""
      command.value = "new-file"
    }
  })
}

const ui: UI = {
  id: "A06",
  request: "Build a command palette for a code editor: a shortcut opens a dialog where I search commands, run one with Enter, and the dialog closes.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Command palette", action: "press" },
      { ref: "Find a command", action: "setQuery", args: ["wrap"] },
      { ref: "Find a command", action: "run" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Ran: Toggle word wrap." && /Word wrap on/.test(root.querySelector("[data-state]")!.textContent!),
  },
}

export default ui
