import { createParts } from "@ui-sdk/vue/primitive"
import { createApp, defineComponent, h, onMounted, ref } from "vue"
import type { UI } from "../src/ui"
import { teammatePicker } from "./B20-teammate-picker"
import { TEAM, TEXT } from "./D01-teammate-picker-react"

const LABEL = TEXT.label("Vue")

// The primitive of B20, unchanged. Vue renders its slots as native elements.
const Picker = createParts(teammatePicker, { root: "div", input: "input", list: "div", person: "div", empty: "p" })

// Render functions (h) in place of a template, so the page needs no .vue file and no template compiler.
const TeammatePicker = defineComponent(() => {
  const chosen = ref<string | null>(null)
  // The empty part is present when the list counts 0 names. On the first render the names are not on the page yet,
  // so the count is 0 and the adapter does not check it again until the state changes. Render it after mount.
  const mounted = ref(false)
  onMounted(() => (mounted.value = true))
  return () =>
    h("div", { class: "d02-card" }, [
      h("h2", TEXT.heading),
      h(
        Picker.Root,
        {
          class: "d02-picker",
          role: "group",
          "aria-label": LABEL,
          onValueChange: (value: string | null) => (chosen.value = value),
        },
        () => [
          h(Picker.Input, { class: "d02-input", "aria-label": TEXT.search, placeholder: TEXT.search }),
          h(Picker.List, { class: "d02-list", "aria-label": TEXT.list }, () =>
            TEAM.map((name) => h(Picker.Person, { key: name, value: name, class: "d02-person" }, () => name)),
          ),
          mounted.value ? h(Picker.Empty, { class: "d02-empty" }, () => TEXT.empty) : null,
        ],
      ),
      h("p", { role: "status", "data-status": "" }, chosen.value ? TEXT.chosen(chosen.value) : TEXT.none),
    ])
})

// Renders the picker into an element and returns the function that removes it.
// Each Vue app gets its own id prefix: the adapter builds part ids from useId, which repeats across apps.
function renderTeammatePicker(element: HTMLElement): () => void {
  const app = createApp(TeammatePicker)
  app.config.idPrefix = `d02-${Math.random().toString(36).slice(2, 8)}`
  // A Vue mount renders at once, so the markup is there when the call returns.
  app.mount(element)
  return () => app.unmount()
}

const css = `
[data-stage] .d02-card { display: grid; gap: 16px; justify-items: start; }
[data-stage] .d02-card h2, [data-stage] .d02-card p { margin: 0; }
[data-stage] .d02-card h2 { font-size: 1rem; font-weight: 600; }
[data-stage] .d02-picker { display: grid; gap: 8px; width: 20rem; max-width: 100%; }
[data-stage] .d02-input {
  box-sizing: border-box; width: 100%; height: calc(var(--ui-spacing) * 9); padding: 0 12px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); font: inherit;
}
[data-stage] .d02-input::placeholder { color: var(--ui-muted-foreground); opacity: 1; }
[data-stage] .d02-input:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] .d02-list { display: grid; padding: 4px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] .d02-person { display: block; padding: 8px 12px; border-radius: var(--ui-radius); cursor: pointer; user-select: none; }
[data-stage] .d02-person[data-highlighted] { background: var(--ui-muted); }
[data-stage] .d02-person[data-selected] { font-weight: 600; }
[data-stage] .d02-person[data-selected]::after { content: " (chosen)"; font-weight: 400; color: var(--ui-muted-foreground); }
[data-stage] .d02-empty { padding: 8px 12px; color: var(--ui-muted-foreground); }
[data-stage] .d02-card [data-status] { color: var(--ui-muted-foreground); }
`

const ui: UI = {
  id: "D02",
  request:
    "Render the teammate picker primitive of B20 in Vue with the Vue adapter: the same search box, list, keys and agent actions, with Vue components in place of web components.",
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
