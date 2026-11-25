import { createParts } from "@ui-sdk/react/primitive"
import { useState } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import type { UI } from "../src/ui"
import { teammatePicker } from "./B20-teammate-picker"

// The data and the text of the picker. Rows D02 to D04 (Vue, Svelte, Solid) render the same ones.
const TEAM = ["Ada Okafor", "Bao Tran", "Carla Mendes", "Dev Patel", "Elena Rossi", "Farid Haddad", "Grace Kim", "Hana Sato"]
const TEXT = {
  heading: "Add a teammate to Launch plan",
  // The bridge label. Each adapter names its own framework, so 4 pickers on 1 page do not share a name.
  label: (framework: string) => `Teammate picker in ${framework}`,
  search: "Search teammates",
  list: "Teammates",
  empty: "No teammate matches.",
  none: "No teammate is chosen.",
  chosen: (name: string) => `Chosen: ${name}.`,
}
const LABEL = TEXT.label("React")

// The primitive of B20, unchanged. React renders its slots as native elements.
const Picker = createParts(teammatePicker, { root: "div", input: "input", list: "div", person: "div", empty: "p" })

function TeammatePicker({ label = LABEL, team = TEAM }: { label?: string; team?: readonly string[] }) {
  const [chosen, setChosen] = useState<string | null>(null)
  return (
    <div className="d01-card">
      <h2>{TEXT.heading}</h2>
      <Picker.Root className="d01-picker" role="group" aria-label={label} onValueChange={(value) => setChosen(value)}>
        <Picker.Input className="d01-input" aria-label={TEXT.search} placeholder={TEXT.search} />
        <Picker.List className="d01-list" aria-label={TEXT.list}>
          {team.map((name) => (
            <Picker.Person key={name} value={name} className="d01-person">
              {name}
            </Picker.Person>
          ))}
        </Picker.List>
        <Picker.Empty className="d01-empty">{TEXT.empty}</Picker.Empty>
      </Picker.Root>
      <p role="status" data-status>
        {chosen ? TEXT.chosen(chosen) : TEXT.none}
      </p>
    </div>
  )
}

// Renders the picker into an element and returns the function that removes it.
// Each React root gets its own id prefix: the adapter builds part ids from useId, which repeats across roots.
function renderTeammatePicker(element: HTMLElement): () => void {
  const root = createRoot(element, { identifierPrefix: `d01-${Math.random().toString(36).slice(2, 8)}-` })
  // flushSync writes the markup before the call returns, as the mount of a web component UI does.
  flushSync(() => root.render(<TeammatePicker />))
  return () => root.unmount()
}

const css = `
[data-stage] .d01-card { display: grid; gap: 16px; justify-items: start; }
[data-stage] .d01-card h2, [data-stage] .d01-card p { margin: 0; }
[data-stage] .d01-card h2 { font-size: 1rem; font-weight: 600; }
[data-stage] .d01-picker { display: grid; gap: 8px; width: 20rem; max-width: 100%; }
[data-stage] .d01-input {
  box-sizing: border-box; width: 100%; height: calc(var(--ui-spacing) * 9); padding: 0 12px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); font: inherit;
}
[data-stage] .d01-input::placeholder { color: var(--ui-muted-foreground); opacity: 1; }
[data-stage] .d01-input:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] .d01-list { display: grid; padding: 4px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] .d01-person { display: block; padding: 8px 12px; border-radius: var(--ui-radius); cursor: pointer; user-select: none; }
[data-stage] .d01-person[data-highlighted] { background: var(--ui-muted); }
[data-stage] .d01-person[data-selected] { font-weight: 600; }
[data-stage] .d01-person[data-selected]::after { content: " (chosen)"; font-weight: 400; color: var(--ui-muted-foreground); }
[data-stage] .d01-empty { padding: 8px 12px; color: var(--ui-muted-foreground); }
[data-stage] .d01-card [data-status] { color: var(--ui-muted-foreground); }
`

const ui: UI = {
  id: "D01",
  request:
    "Render the teammate picker primitive of B20 in React with the React adapter: the same search box, list, keys and agent actions, with React components in place of web components.",
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

export { renderTeammatePicker, TEAM, TeammatePicker, TEXT }
export default ui
