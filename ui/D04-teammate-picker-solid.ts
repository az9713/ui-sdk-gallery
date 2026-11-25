import { createParts } from "@ui-sdk/solid/primitive"
import { createComponent, Dynamic, type JSX, render } from "@solidjs/web"
import { createSignal, merge, onSettled, Show } from "solid-js"
import type { UI } from "../src/ui"
import { teammatePicker } from "./B20-teammate-picker"
import { TEAM, TEXT } from "./D01-teammate-picker-react"

const LABEL = TEXT.label("Solid")

// The primitive of B20, unchanged. Solid renders its slots as native elements.
const Picker = createParts(teammatePicker, { root: "div", input: "input", list: "div", person: "div", empty: "p" })

// There is no Solid compiler here, so the file calls createComponent where JSX would stand.
// A getter keeps a prop reactive, as the compiler does for an expression in JSX.
// merge keeps the getters; an object spread (`{ ...props }`) would read each one once and lose it.
// Dynamic and Show have overloads that createComponent cannot infer without JSX, so `make` is createComponent with no prop types.
const make = createComponent as (component: unknown, props: Record<string, unknown>) => JSX.Element
const el = (component: string, props: Record<string, unknown>) => make(Dynamic, merge({ component }, props))

function TeammatePicker() {
  const [chosen, setChosen] = createSignal<string | null>(null)
  const [ready, setReady] = createSignal(false)
  // An onSettled callback may return only a cleanup function, so the signal's return value is dropped.
  onSettled(() => void setReady(true))
  return el("div", {
    class: "d04-card",
    get children() {
      return [
        el("h2", { children: TEXT.heading }),
        createComponent(Picker.Root, {
          class: "d04-picker",
          role: "group",
          "aria-label": LABEL,
          onValueChange: (value: string | null) => setChosen(value),
          get children() {
            return [
              createComponent(Picker.Input, { class: "d04-input", "aria-label": TEXT.search, placeholder: TEXT.search }),
              createComponent(Picker.List, {
                class: "d04-list",
                "aria-label": TEXT.list,
                // The team does not change, so a plain map stands where JSX would use For.
                children: TEAM.map((name) => createComponent(Picker.Person, { value: name, class: "d04-person", children: name })),
              }),
              // The empty part waits until the names are on the page. Its present() calls listbox.count(), which counts
              // the names that registered through their bind. The Solid adapter binds an element only once it is in the
              // document, after this render: an empty part made in the same render counted 0, and no store write told it
              // about the names, so it showed "No teammate matches." under the full list.
              make(Show, {
                get when() {
                  return ready()
                },
                get children() {
                  return createComponent(Picker.Empty, { class: "d04-empty", children: TEXT.empty })
                },
              }),
            ]
          },
        }),
        el("p", {
          role: "status",
          "data-status": "",
          get children() {
            const name = chosen()
            return name ? TEXT.chosen(name) : TEXT.none
          },
        }),
      ]
    },
  })
}

// Renders the picker into an element and returns the function that removes it.
// Solid builds the part ids from createUniqueId, whose counter is shared by all Solid roots on the page.
function renderTeammatePicker(element: HTMLElement): () => void {
  // render flushes Solid's scheduled insert, so the markup is there when the call returns.
  return render(() => createComponent(TeammatePicker, {}), element)
}

const css = `
[data-stage] .d04-card { display: grid; gap: 16px; justify-items: start; }
[data-stage] .d04-card h2, [data-stage] .d04-card p { margin: 0; }
[data-stage] .d04-card h2 { font-size: 1rem; font-weight: 600; }
[data-stage] .d04-picker { display: grid; gap: 8px; width: 20rem; max-width: 100%; }
[data-stage] .d04-input {
  box-sizing: border-box; width: 100%; height: calc(var(--ui-spacing) * 9); padding: 0 12px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); font: inherit;
}
[data-stage] .d04-input::placeholder { color: var(--ui-muted-foreground); opacity: 1; }
[data-stage] .d04-input:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] .d04-list { display: grid; padding: 4px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] .d04-person { display: block; padding: 8px 12px; border-radius: var(--ui-radius); cursor: pointer; user-select: none; }
[data-stage] .d04-person[data-highlighted] { background: var(--ui-muted); }
[data-stage] .d04-person[data-selected] { font-weight: 600; }
[data-stage] .d04-person[data-selected]::after { content: " (chosen)"; font-weight: 400; color: var(--ui-muted-foreground); }
[data-stage] .d04-empty { padding: 8px 12px; color: var(--ui-muted-foreground); }
[data-stage] .d04-card [data-status] { color: var(--ui-muted-foreground); }
`

const ui: UI = {
  id: "D04",
  request:
    "Render the teammate picker primitive of B20 in Solid with the Solid adapter: the same search box, list, keys and agent actions, with Solid components in place of web components.",
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

export { renderTeammatePicker, TeammatePicker }
export default ui
