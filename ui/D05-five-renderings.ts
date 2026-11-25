import { createParts, wrappedChild } from "@ui-sdk/web"
import type { UI } from "../src/ui"
import { teammatePicker } from "./B20-teammate-picker"
import react, { renderTeammatePicker as renderReact, TEAM, TEXT } from "./D01-teammate-picker-react"
import vue, { renderTeammatePicker as renderVue } from "./D02-teammate-picker-vue"
import svelte, { renderTeammatePicker as renderSvelte } from "./D03-teammate-picker-svelte"
import solid, { renderTeammatePicker as renderSolid } from "./D04-teammate-picker-solid"

// The primitive of B20, unchanged, with tags of this row. The tags of B20 itself (b20-) are B20's.
createParts(teammatePicker, {
  root: { tag: "d05-picker", display: "block" },
  input: { tag: "d05-picker-input", target: wrappedChild("input"), display: "block" },
  list: { tag: "d05-picker-list", display: "block" },
  person: "d05-person",
  empty: "d05-picker-empty",
})

// Renders the web component picker into an element and returns the function that removes it, as D01 to D04 do.
function renderWeb(element: HTMLElement): () => void {
  element.innerHTML = `
<div class="d05-card">
  <d05-picker aria-label="${TEXT.label("web components")}">
    <d05-picker-input><input aria-label="${TEXT.search}" placeholder="${TEXT.search}" /></d05-picker-input>
    <d05-picker-list aria-label="${TEXT.list}">
      ${TEAM.map((name) => `<d05-person value="${name}">${name}</d05-person>`).join("")}
    </d05-picker-list>
    <d05-picker-empty>${TEXT.empty}</d05-picker-empty>
  </d05-picker>
  <p role="status" data-status>${TEXT.none}</p>
</div>`
  const status = element.querySelector("[data-status]")!
  element.querySelector("d05-picker")!.addEventListener("valuechange", (event) => {
    const { value } = (event as CustomEvent<{ value: string | null }>).detail
    status.textContent = value ? TEXT.chosen(value) : TEXT.none
  })
  return () => void (element.innerHTML = "")
}

// 1 column for each rendering. The name is the framework word of the picker's bridge label.
const RENDERINGS = [
  { name: "web components", heading: "Web components", render: renderWeb },
  { name: "React", heading: "React", render: renderReact },
  { name: "Vue", heading: "Vue", render: renderVue },
  { name: "Svelte", heading: "Svelte", render: renderSvelte },
  { name: "Solid", heading: "Solid", render: renderSolid },
]
// The task chooses a different name in each picker, so each status line proves its own step.
const CHOICES = ["Ada Okafor", "Bao Tran", "Carla Mendes", "Dev Patel", "Elena Rossi"]

const own = `
[data-stage] .d05-page { display: grid; gap: 16px; width: 100%; }
[data-stage] .d05-page > h2, [data-stage] .d05-page > p { margin: 0; }
[data-stage] .d05-page > h2 { font-size: 1.25rem; font-weight: 600; }
[data-stage] .d05-page > p { color: var(--ui-muted-foreground); max-width: 60ch; }
[data-stage] .d05-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
[data-stage] .d05-col { display: grid; gap: 8px; align-content: start; min-width: 0; }
/* Each card is a grid with an auto track, which grows to the picker's 20rem. A 0-minimum track holds it in the column. */
[data-stage] .d05-col > div > * { grid-template-columns: minmax(0, 1fr); }
[data-stage] .d05-col h3 { margin: 0; font-size: 0.875rem; font-weight: 600; color: var(--ui-muted-foreground); }
/* Each rendering has the same heading. The page states it once, and each column names its framework. */
[data-stage] .d05-col .d01-card > h2, [data-stage] .d05-col .d02-card > h2,
[data-stage] .d05-col .d03-card > h2, [data-stage] .d05-col .d04-card > h2 { display: none; }
[data-stage] .d05-card { display: grid; gap: 16px; justify-items: start; }
[data-stage] .d05-card p { margin: 0; color: var(--ui-muted-foreground); }
[data-stage] d05-picker { display: grid; gap: 8px; width: 20rem; max-width: 100%; }
[data-stage] d05-picker-input input {
  box-sizing: border-box; width: 100%; height: calc(var(--ui-spacing) * 9); padding: 0 12px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); font: inherit;
}
[data-stage] d05-picker-input input::placeholder { color: var(--ui-muted-foreground); opacity: 1; }
[data-stage] d05-picker-input input:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] d05-picker-list { display: grid; padding: 4px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] d05-person { display: block; padding: 8px 12px; border-radius: var(--ui-radius); cursor: pointer; user-select: none; }
[data-stage] d05-person[data-highlighted] { background: var(--ui-muted); }
[data-stage] d05-person[data-selected] { font-weight: 600; }
[data-stage] d05-person[data-selected]::after { content: " (chosen)"; font-weight: 400; color: var(--ui-muted-foreground); }
[data-stage] d05-picker-empty { padding: 8px 12px; color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = `
<div class="d05-page">
  <h2>${TEXT.heading}</h2>
  <p>The same picker in 5 renderings. 1 bridge sees all 5.</p>
  <div class="d05-row">
    ${RENDERINGS.map((r, i) => `<section class="d05-col" aria-labelledby="d05-col-${i}"><h3 id="d05-col-${i}">${r.heading}</h3><div></div></section>`).join("")}
  </div>
</div>`
  const boxes = root.querySelectorAll<HTMLElement>(".d05-col > div")
  RENDERINGS.forEach((r, i) => r.render(boxes[i]))
}

const ui: UI = {
  id: "D05",
  request:
    "Put the teammate picker of B20 on 1 page 5 times, rendered with web components, React, Vue, Svelte and Solid, so that 1 bridge sees and drives all 5.",
  css: [react.css, vue.css, svelte.css, solid.css, own].join("\n"),
  mount,
  task: {
    steps: RENDERINGS.map((r, i) => ({ ref: TEXT.label(r.name), action: "choose", args: [CHOICES[i]] })),
    done: (root) => {
      const lines = [...root.querySelectorAll(".d05-col [data-status]")].map((el) => el.textContent)
      return lines.length === CHOICES.length && CHOICES.every((name, i) => lines[i] === TEXT.chosen(name))
    },
  },
}

export { CHOICES, RENDERINGS }
export default ui
