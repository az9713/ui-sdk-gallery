import "@ui-sdk/web/button"
import "@ui-sdk/web/label"
import "@ui-sdk/web/radio"
import type { UI } from "../src/ui"

const languages = [
  { value: "ar", name: "Arabic", native: "العربية" },
  { value: "he", name: "Hebrew", native: "עברית" },
  { value: "fa", name: "Persian", native: "فارسی" },
  { value: "ur", name: "Urdu", native: "اردو" },
]

const html = `
<ui-label for="interface-language">Interface language</ui-label>
<ui-radio-group id="interface-language" default-value="ar">
  ${languages
    .map(
      (language) => `
  <ui-label>
    <ui-radio value="${language.value}"><ui-radio-indicator></ui-radio-indicator></ui-radio>
    ${language.native}
  </ui-label>`,
    )
    .join("")}
</ui-radio-group>
<ui-button data-save><button>Save language</button></ui-button>
<p role="status" data-status>No language is saved</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 360px; justify-items: start; }
[data-stage] ui-radio-group { display: grid; gap: 10px; }
[data-stage] [data-status] { margin: 0; color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.setAttribute("dir", "rtl")
  root.innerHTML = html
  let chosen = "ar"
  const status = root.querySelector("[data-status]")!
  root.querySelector("ui-radio-group")!.addEventListener("valuechange", (e) => {
    chosen = (e as CustomEvent).detail.value
  })
  root.querySelector("[data-save]")!.addEventListener("action", () => {
    const language = languages.find((l) => l.value === chosen)!
    status.textContent = `Saved: ${language.name}`
  })
}

const ui: UI = {
  id: "A28",
  request: "Build a language picker for Arabic, Hebrew, Persian and Urdu as radios with a Save language button, laid out right to left.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Interface language", action: "setValue", args: ["he"] },
      { ref: "Save language", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Saved: Hebrew",
  },
}

export default ui
