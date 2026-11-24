import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/file-input"
import "@ui-sdk/web/select"
import "@ui-sdk/web/token-input"
import "@ui-sdk/web/trigger-menu"
import type { UI } from "../src/ui"

const files = [
  { value: "src/app.tsx", label: "app.tsx", keywords: ["src"] },
  { value: "src/routes.ts", label: "routes.ts", keywords: ["src"] },
  { value: "README.md", label: "README.md" },
]
const models: Record<string, string> = { sonnet: "Sonnet", opus: "Opus", haiku: "Haiku" }
const draft = "Explain [@routes.ts](file:src/routes.ts) and compare it with [@app.tsx](file:src/app.tsx)."

const html = `
<form data-prompt>
  <ui-file-input multiple name="attachments">
    <ui-file-input-dropzone paste-target="[data-editor]">
      <ui-field>
        <ui-field-label>Prompt</ui-field-label>
        <ui-token-input name="prompt" value="${draft}">
          <ui-token-input-editor data-editor placeholder="Ask anything. Type @ to add a file."></ui-token-input-editor>
          <template>
            <ui-token-input-token>
              <span data-token-label></span>
              <ui-token-input-token-remove></ui-token-input-token-remove>
            </ui-token-input-token>
          </template>
          <ui-trigger-menu data-agent-hidden>
            <ui-trigger-menu-content>
              <ui-trigger-menu-empty>No file matches.</ui-trigger-menu-empty>
              <ui-trigger-menu-list></ui-trigger-menu-list>
            </ui-trigger-menu-content>
          </ui-trigger-menu>
        </ui-token-input>
      </ui-field>
      <ui-file-input-list aria-label="Attachments">
        <template>
          <ui-file-input-item>
            <span data-file="name"></span>
            <span data-file="size" data-hint></span>
            <ui-file-input-item-remove><button type="button"></button></ui-file-input-item-remove>
          </ui-file-input-item>
        </template>
      </ui-file-input-list>
      <div data-bar>
        <ui-file-input-trigger><button type="button">Attach files</button></ui-file-input-trigger>
        <div data-send-side>
          <ui-select name="model" default-value="sonnet">
            <ui-select-label>Model</ui-select-label>
            <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
            <ui-select-content>
              <ui-select-item value="sonnet">Sonnet</ui-select-item>
              <ui-select-item value="opus">Opus</ui-select-item>
              <ui-select-item value="haiku">Haiku</ui-select-item>
            </ui-select-content>
          </ui-select>
          <ui-button data-send><button type="button">Send</button></ui-button>
        </div>
      </div>
    </ui-file-input-dropzone>
  </ui-file-input>
</form>
<p role="status" data-status>Nothing is sent.</p>`

const css = `
[data-stage] { display: grid; gap: 12px; width: 560px; max-width: 100%; }
[data-stage] p { margin: 0; }
[data-stage] ui-file-input-dropzone { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--ui-input); border-radius: var(--ui-radius); text-align: start; color: var(--ui-foreground); }
[data-stage] ui-field { align-items: stretch; }
[data-stage] ui-token-input-editor { text-align: start; }
[data-stage] ui-file-input-dropzone[data-dragging] { outline: 2px solid var(--ui-ring); }
[data-stage] ui-token-input-editor { min-height: calc(var(--ui-spacing) * 20); }
[data-stage] ui-file-input-list { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: flex-start; gap: 8px; border: 0; padding: 0; }
[data-stage] ui-file-input-item { display: flex; align-items: center; gap: 8px; padding: 4px 4px 4px 12px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); flex: 0 0 auto; color: var(--ui-foreground); }
[data-stage] [data-hint] { color: var(--ui-muted-foreground); }
[data-stage] [data-bar] { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
[data-stage] [data-send-side] { display: flex; align-items: center; gap: 12px; }
[data-stage] ui-select { flex-direction: row; align-items: center; gap: 8px; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

type FileInputEl = HTMLElement & { api: { getValue(): File[]; setValue(files: File[]): boolean; clear(): boolean } }
type TokenInputEl = HTMLElement & { api: { getLabel(): string; clear(): boolean } }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const form = root.querySelector("form")!
  const status = root.querySelector("[data-status]")!
  const attachments = root.querySelector<FileInputEl>("ui-file-input")!
  const prompt = root.querySelector<TokenInputEl>("ui-token-input")!
  let model = "sonnet"

  root.querySelector("ui-trigger-menu")!.triggers = [{ char: "@", type: "file", items: files }]
  attachments.api.setValue([new File(["brief"], "design-brief.pdf", { type: "application/pdf" })])
  root.querySelector("ui-select")!.addEventListener("valuechange", (e) => {
    model = (e as CustomEvent).detail.value
  })

  const send = () => {
    const text = prompt.api.getLabel().trim()
    if (!text) {
      status.textContent = "Write a prompt before you send."
      return
    }
    const names = attachments.api.getValue().map((file) => file.name)
    status.textContent = `Sent to ${models[model]}: "${text}" with ${names.length} ${names.length === 1 ? "file" : "files"}${names.length ? `: ${names.join(", ")}` : ""}.`
    prompt.api.clear()
    attachments.api.clear()
  }
  root.querySelector("[data-send]")!.addEventListener("action", send)
  form.addEventListener("submit", (e) => {
    e.preventDefault()
    send()
  })
}

const ui: UI = {
  id: "A07",
  request:
    "Build a prompt box: text with file tokens, an @ menu that adds a file, an Attach files button with a list of the attachments, a model select, and a Send button.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Prompt", action: "setValue", args: [["Explain ", { type: "file", value: "src/routes.ts", label: "routes.ts" }, " and fix the typo"]] },
      { ref: "Attach files", action: "addFiles", args: [[new File(["mockup"], "mockup.png", { type: "image/png" })]] },
      { ref: "Model", action: "setValue", args: ["Opus"] },
      { ref: "Send", action: "press" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === 'Sent to Opus: "Explain routes.ts and fix the typo" with 2 files: design-brief.pdf, mockup.png.',
  },
}

export default ui
