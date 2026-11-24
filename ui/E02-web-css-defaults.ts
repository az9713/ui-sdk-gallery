import type { UI } from "../src/ui"
import a01 from "./A01-project-settings"

// Set E changes only the look of A01: the markup, the mount function and the task are the same.
// web.css stays on, the gallery tokens are off, and the UI has no CSS of its own.
const ui: UI = {
  ...a01,
  id: "E02",
  request: "Show the project settings page of A01 with the web.css defaults only: the starter stylesheet with its own tokens and no CSS of its own.",
  css: undefined,
  look: { tokens: false },
}

export default ui
