import type { UI } from "../src/ui"
import a01 from "./A01-project-settings"

// Set E changes only the look of A01: the markup, the mount function and the task are the same.
// web.css stays on. The first block adds motion; each @media block answers one operating-system display mode.
const css = `
[data-stage] { max-width: 520px; }

[data-stage] [data-slot="tabs-tab"],
[data-stage] [data-slot="switch"],
[data-stage] [data-slot="button"],
[data-stage] [data-slot="alert-dialog-trigger"] { transition: background-color 200ms ease, border-color 200ms ease, color 200ms ease; }
[data-stage] [data-slot="switch-thumb"] { transition: translate 200ms ease, background-color 200ms ease; }
[data-stage] [data-slot="tabs-panel"]:not([hidden]) { animation: e05-fade 240ms ease-out; }
[data-stage] [data-slot="alert-dialog-content"]:not([hidden]) { animation: e05-fade 240ms ease-out; }
@keyframes e05-fade { from { opacity: 0; } to { opacity: 1; } }

@media (prefers-contrast: more) {
  [data-stage] [data-slot="tabs-list"],
  [data-stage] [data-slot="input"],
  [data-stage] [data-slot="select-trigger"],
  [data-stage] [data-slot="switch"],
  [data-stage] [data-slot="button"],
  [data-stage] [data-slot="alert-dialog-trigger"],
  [data-stage] [data-slot="alert-dialog-close"],
  [data-stage] [data-slot="alert-dialog-content"],
  [data-stage] [data-status] { border: 2px solid var(--ui-foreground); }
  [data-stage] [data-slot="tabs-tab"][data-selected] { background: var(--ui-foreground); color: var(--ui-background); }
  [data-stage] [data-slot="switch"][data-checked] { background: var(--ui-foreground); }
  [data-stage] [data-slot="switch-thumb"] { background: var(--ui-foreground); }
  [data-stage] [data-slot="switch"][data-checked] [data-slot="switch-thumb"] { background: var(--ui-background); }
  [data-stage] [data-slot="field-label"],
  [data-stage] [data-slot="alert-dialog-description"],
  [data-stage] [data-status] { color: var(--ui-foreground); }
  [data-stage] :focus-visible { outline: 3px solid var(--ui-foreground); outline-offset: 3px; }
}

@media (forced-colors: active) {
  [data-stage] [data-slot="tabs-tab"][data-selected] { background: Highlight; color: HighlightText; forced-color-adjust: none; }
  [data-stage] [data-slot="switch"] { border: 2px solid ButtonText; }
  [data-stage] [data-slot="switch"][data-checked] { background: Highlight; border-color: Highlight; forced-color-adjust: none; }
  [data-stage] [data-slot="switch-thumb"] { background: ButtonText; forced-color-adjust: none; }
  [data-stage] [data-slot="switch"][data-checked] [data-slot="switch-thumb"] { background: HighlightText; }
  [data-stage] [data-slot="button"],
  [data-stage] [data-slot="alert-dialog-trigger"],
  [data-stage] [data-slot="alert-dialog-close"] { border: 2px solid ButtonText; }
  [data-stage] :focus-visible { outline: 3px solid Highlight; outline-offset: 3px; }
}

@media (prefers-reduced-motion: reduce) {
  [data-stage] *,
  [data-stage] *::before,
  [data-stage] *::after { transition: none !important; animation: none !important; }
}
`

const ui: UI = {
  ...a01,
  id: "E05",
  request: "Show the project settings page of A01 with a stylesheet for high contrast, forced colors and reduced motion.",
  css,
}

export default ui
