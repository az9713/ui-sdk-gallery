import type { UI } from "../src/ui"
import a01 from "./A01-project-settings"

// Set E changes only the look of A01: the markup, the mount function and the task are the same.
const ui: UI = {
  ...a01,
  id: "E01",
  request: "Show the project settings page of A01 with no stylesheet: no web.css and no CSS of its own.",
  css: undefined,
  look: { webCss: false },
}

export default ui
