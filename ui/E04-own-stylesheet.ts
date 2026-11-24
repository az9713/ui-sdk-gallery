import type { UI } from "../src/ui"
import a01 from "./A01-project-settings"

// Set E changes only the look of A01: the markup, the mount function and the task are the same.
// The stylesheet selects only data-slot and state attributes (data-selected, data-checked, data-hidden, data-agent-confirm).
const css = `
[data-stage] { display: grid; gap: 24px; max-width: 520px; font-size: 0.9375rem; }
[data-stage] p { margin: 0; }

[data-stage] [data-slot="tabs"] { display: grid; gap: 24px; }
[data-stage] [data-slot="tabs-list"] { display: inline-flex; gap: 4px; justify-self: start; padding: 4px; border: 1px solid var(--ui-border); border-radius: 999px; background: var(--ui-muted); }
[data-stage] [data-slot="tabs-tab"] { padding: 6px 16px; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--ui-muted-foreground); font: inherit; font-weight: 500; cursor: pointer; }
[data-stage] [data-slot="tabs-tab"]:hover { color: var(--ui-foreground); }
[data-stage] [data-slot="tabs-tab"][data-selected] { background: var(--ui-primary); color: var(--ui-primary-foreground); }
[data-stage] [data-slot="tabs-tab"]:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] [data-slot="tabs-panel"]:not([hidden]) { display: grid; gap: 20px; justify-items: start; padding: 20px; border: 1px solid var(--ui-border); border-radius: 12px; background: var(--ui-muted); }

[data-stage] [data-slot="field"] { display: grid; gap: 6px; width: 100%; }
[data-stage] [data-slot="field"][data-row] { display: flex; align-items: center; gap: 12px; width: auto; }
[data-stage] [data-slot="field-label"] { color: var(--ui-foreground); font-weight: 600; }
[data-stage] [data-slot="field-error"] { color: var(--ui-destructive); }

[data-stage] [data-slot="input"],
[data-stage] [data-slot="select-trigger"] { width: 100%; padding: 8px 12px; border: 1px solid var(--ui-input); border-radius: 8px; background: var(--ui-background); color: var(--ui-foreground); font: inherit; text-align: start; }
[data-stage] [data-slot="input"]:focus-visible,
[data-stage] [data-slot="select-trigger"]:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 1px; }
[data-stage] [data-slot="input"][data-invalid] { border-color: var(--ui-destructive); }
[data-stage] [data-slot="select-trigger"] { display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
[data-stage] [data-slot="select"] { position: relative; }
[data-stage] [data-slot="select-content"] { position: absolute; inset-inline: 0; top: calc(100% + 4px); z-index: 5; display: grid; gap: 2px; padding: 4px; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-background); }
[data-stage] [data-slot="select-content"][hidden] { display: none; }
[data-stage] [data-slot="select-item"] { padding: 6px 10px; border-radius: 6px; cursor: default; }
[data-stage] [data-slot="select-item"][data-highlighted] { background: var(--ui-muted); }
[data-stage] [data-slot="select-item"][data-selected] { color: var(--ui-primary); font-weight: 600; }

[data-stage] [data-slot="switch"] { display: inline-flex; flex-shrink: 0; align-items: center; width: 44px; height: 24px; padding: 3px; border: 1px solid var(--ui-input); border-radius: 999px; background: var(--ui-background); cursor: pointer; }
[data-stage] [data-slot="switch"][data-checked] { border-color: var(--ui-primary); background: var(--ui-primary); }
[data-stage] [data-slot="switch"]:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] [data-slot="switch-thumb"] { width: 16px; height: 16px; border-radius: 50%; background: var(--ui-muted-foreground); }
[data-stage] [data-slot="switch-thumb"][data-checked] { margin-inline-start: auto; background: var(--ui-primary-foreground); }

[data-stage] [data-slot="button"],
[data-stage] [data-slot="alert-dialog-trigger"],
[data-stage] [data-slot="alert-dialog-close"] { padding: 8px 16px; border: 1px solid var(--ui-input); border-radius: 8px; background: var(--ui-background); color: var(--ui-foreground); font: inherit; font-weight: 600; cursor: pointer; }
[data-stage] [data-slot="button"] { border-color: var(--ui-primary); background: var(--ui-primary); color: var(--ui-primary-foreground); }
[data-stage] [data-slot="alert-dialog-trigger"] { border-color: var(--ui-destructive); color: var(--ui-destructive); }
[data-stage] [data-slot="button"]:focus-visible,
[data-stage] [data-slot="alert-dialog-trigger"]:focus-visible,
[data-stage] [data-slot="alert-dialog-close"]:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] [data-agent-confirm] [data-slot="alert-dialog-close"] { border-color: var(--ui-destructive); background: var(--ui-destructive); color: var(--ui-primary-foreground); }

[data-stage] [data-slot="alert-dialog-backdrop"] { position: fixed; inset: 0; z-index: 50; background: rgb(2 6 23 / 0.7); }
[data-stage] [data-slot="alert-dialog-content"] { position: fixed; inset: 0; z-index: 51; display: grid; gap: 12px; align-content: start; width: min(26rem, calc(100% - 2rem)); height: fit-content; margin: auto; padding: 24px; border: 1px solid var(--ui-border); border-radius: 12px; background: var(--ui-muted); color: var(--ui-foreground); }
[data-stage] [data-slot="alert-dialog-content"][hidden],
[data-stage] [data-slot="alert-dialog-backdrop"][hidden] { display: none; }
[data-stage] [data-slot="alert-dialog-title"] { font-size: 1.125rem; font-weight: 600; }
[data-stage] [data-slot="alert-dialog-description"] { color: var(--ui-muted-foreground); }
[data-stage] [data-answers] { display: flex; justify-content: flex-end; gap: 12px; padding-top: 8px; }

[data-stage] [data-status] { padding: 10px 14px; border: 1px solid var(--ui-border); border-radius: 8px; color: var(--ui-muted-foreground); }
`

const ui: UI = {
  ...a01,
  id: "E04",
  request: "Show the project settings page of A01 with no web.css and an own stylesheet that selects only data-slot and state attributes.",
  css,
  look: { webCss: false },
}

export default ui
