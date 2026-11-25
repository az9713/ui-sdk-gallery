import { flushSync, mount, unmount } from "svelte"
import type { UI } from "../src/ui"
import { TEXT } from "./D01-teammate-picker-react"
import TeammatePicker from "./D03-teammate-picker-svelte.svelte"

const LABEL = TEXT.label("Svelte")

// Renders the picker into an element and returns the function that removes it.
// Svelte makes each part id from $props.id(), a counter that is global to the page, so 2 renderings do not share an id.
function renderTeammatePicker(element: HTMLElement): () => void {
  const app = mount(TeammatePicker, { target: element })
  // flushSync runs the pending effects, so the markup and its attributes are there when the call returns.
  flushSync()
  return () => void unmount(app)
}

const css = `
[data-stage] .d03-card { display: grid; gap: 16px; justify-items: start; }
[data-stage] .d03-card h2, [data-stage] .d03-card p { margin: 0; }
[data-stage] .d03-card h2 { font-size: 1rem; font-weight: 600; }
[data-stage] .d03-picker { display: grid; gap: 8px; width: 20rem; max-width: 100%; }
[data-stage] .d03-input {
  box-sizing: border-box; width: 100%; height: calc(var(--ui-spacing) * 9); padding: 0 12px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); font: inherit;
}
[data-stage] .d03-input::placeholder { color: var(--ui-muted-foreground); opacity: 1; }
[data-stage] .d03-input:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] .d03-list { display: grid; padding: 4px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] .d03-person { display: block; padding: 8px 12px; border-radius: var(--ui-radius); cursor: pointer; user-select: none; }
[data-stage] .d03-person[data-highlighted] { background: var(--ui-muted); }
[data-stage] .d03-person[data-selected] { font-weight: 600; }
[data-stage] .d03-person[data-selected]::after { content: " (chosen)"; font-weight: 400; color: var(--ui-muted-foreground); }
[data-stage] .d03-empty { padding: 8px 12px; color: var(--ui-muted-foreground); }
[data-stage] .d03-card [data-status] { color: var(--ui-muted-foreground); }
`

const ui: UI = {
  id: "D03",
  request:
    "Render the teammate picker primitive of B20 in Svelte with the Svelte adapter: the same search box, list, keys and agent actions, with Svelte components in place of web components.",
  css,
  mount: (root) => void renderTeammatePicker(root),
  task: {
    steps: [
      { ref: LABEL, action: "search", args: ["an"] },
      { ref: LABEL, action: "choose", args: ["Hana Sato"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === TEXT.chosen("Hana Sato"),
  },
}

export { renderTeammatePicker }
export default ui
