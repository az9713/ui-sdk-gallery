import type { UI } from "../src/ui"
import a01 from "./A01-project-settings"

// Set E changes only the look of A01: the markup, the mount function and the task are the same.
// The css has one selector. It sets --ui-* tokens and color-scheme, plus background and color from tokens.
// Those 2 properties are there because the stage has no background (src/shell.css:78): the dark page shows through.
const css = `
[data-ui="E03"] {
  color-scheme: light;
  background: var(--ui-background);
  color: var(--ui-foreground);
  --ui-background: #ffffff;
  --ui-foreground: #1c1917;
  --ui-muted: #f1efe9;
  --ui-muted-foreground: #57534e;
  --ui-border: #d6d3cb;
  --ui-input: #78716c;
  --ui-primary: #0f766e;
  --ui-primary-foreground: #ffffff;
  --ui-destructive: #b91c1c;
  --ui-ring: #0f766e;
  --ui-ring-border: #0f766e;
  --ui-radius: 4px;
  --ui-spacing: 0.2rem;
  --ui-font-size: 13px;
  --ui-line-height: 1.4;
}
`

const ui: UI = {
  ...a01,
  id: "E03",
  request: "Show the project settings page of A01 in a second, light and compact theme that sets only --ui-* tokens and color-scheme.",
  css,
}

export default ui
