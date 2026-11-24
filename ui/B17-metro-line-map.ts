import {
  type ChangeDetails,
  createChange,
  createRovingFocus,
  createTypeahead,
  definePrimitive,
  elements,
  isTypeaheadKey,
  labelOf,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import type { UI } from "../src/ui"

type Reason = "item-press" | "imperative"
type Options = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string | null, details: ChangeDetails<Reason>) => void
}
type State = { focused: string | null; value: string | null }

// A line of stations: 1 tab stop, Left and Right move focus only, typing finds a station, and Space or Enter picks it.
const metroLine = definePrimitive({
  name: "metro-line",
  options: { value: "string", defaultValue: "string", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({ focused: null, value: options.value ?? options.defaultValue ?? null }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus<State, { value: string }>(context, {
      slot: "station",
      key: "focused",
      orientation: () => "horizontal",
    })
    const typeahead = createTypeahead()
    const names = () => elements<{ value: string }>(context, "station").map((part) => part.key)
    const pick = (value: string, reason: Reason, event?: Event) => {
      if (!names().includes(value)) return false
      return change("value", value, { reason, event })
    }
    return {
      roving,
      names,
      pick: (value: string) => pick(value, "imperative"),
      press: (value: string, event?: Event) => void pick(value, "item-press", event),
      keydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (event.defaultPrevented) return
        if (roving.keydown(event, el)) return typeahead.reset()
        if (event.key === "Escape") return typeahead.reset()
        // Space continues a query that is in progress, and picks the station when none is.
        if ((event.key === " " && !typeahead.active()) || event.key === "Enter") {
          event.preventDefault()
          typeahead.reset()
          return void pick(key, "item-press", event)
        }
        if (!isTypeaheadKey(event)) return
        if (event.key === " ") event.preventDefault()
        const items = roving.items()
        const index = typeahead(
          event.key,
          items.map((item) => labelOf(item.el)),
          items.findIndex((item) => item.el === el),
        )
        if (index !== -1) roving.focus(items[index].key)
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "listbox",
      keys: { none: "Each station handles the arrow keys." },
      attrs: () => ({ "aria-orientation": "horizontal" }),
    }),
    station: slot<{ value: string }>({
      role: "option",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, { key, props, api }) => ({
        tabindex: api.roving.tabIndex(state, { key, props }),
        "aria-selected": String(state.value === key),
        "data-selected": state.value === key ? "" : undefined,
      }),
      press: ({ api, key }, event) => api.press(key, event),
      on: {
        // An option is not a button, so press hears only its clicks.
        keydown: (event, { el, api, key }) => api.keydown(event, el!, key),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
  agent: { actions: ["pick"], items: (api) => api.names().map((value) => ({ value, label: value })) },
})

createParts(metroLine, {
  root: { tag: "b17-line", display: "block" },
  station: { tag: "b17-station", display: "block" },
})

const STATIONS = ["Harbour", "Old Market", "Cathedral", "Museum", "Mill Park", "Stadium", "Airport"]

const html = `
<h2>Line 4</h2>
<b17-line aria-label="Metro stations">
  ${STATIONS.map((name) => `<b17-station value="${name}">${name}</b17-station>`).join("")}
</b17-line>
<p role="status" data-status>Boarding at Harbour. Pick a destination.</p>
<ui-button data-plan><button>Plan trip</button></ui-button>`

const css = `
[data-stage] { display: grid; gap: 20px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] b17-line { display: flex; width: 100%; max-width: 640px; }
[data-stage] b17-station {
  position: relative; display: flex; flex: 1 1 0; min-width: 0; box-sizing: border-box; flex-direction: column; align-items: center; gap: 10px;
  padding: 4px 2px 8px; border-radius: var(--ui-radius);
  font-size: 0.8125rem; line-height: 1.25; text-align: center; overflow-wrap: anywhere; cursor: pointer; user-select: none;
}
[data-stage] b17-station::after { content: ""; position: absolute; top: 8px; left: 0; right: 0; height: 6px; background: var(--ui-primary); }
[data-stage] b17-station:first-child::after { left: 50%; }
[data-stage] b17-station:last-child::after { right: 50%; }
[data-stage] b17-station::before {
  content: ""; position: relative; z-index: 1; width: 14px; height: 14px; flex: none; box-sizing: border-box;
  border: 3px solid var(--ui-primary); border-radius: 50%; background: var(--ui-background);
}
[data-stage] b17-station[data-selected]::before { background: var(--ui-primary); outline: 3px solid var(--ui-background); box-shadow: 0 0 0 5px var(--ui-primary); }
[data-stage] b17-station[data-selected] { font-weight: 600; }
[data-stage] b17-station:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  let destination: string | null = null
  root.querySelector("b17-line")!.addEventListener("valuechange", (event) => {
    destination = (event as CustomEvent<{ value: string }>).detail.value
    status.textContent = `Destination: ${destination}.`
  })
  root.querySelector("[data-plan]")!.addEventListener("action", () => {
    if (destination === null) status.textContent = "Pick a destination first."
    else {
      const stops = STATIONS.indexOf(destination)
      status.textContent = `Trip to ${destination}: ${stops} ${stops === 1 ? "stop" : "stops"} from Harbour.`
    }
  })
}

const ui: UI = {
  id: "B17",
  request:
    "Build a metro line map: a row of stations that is 1 tab stop, where Left and Right move between stations, typing a station's name jumps to it, and Space or Enter picks it.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Metro stations", action: "pick", args: ["Museum"] },
      { ref: "Plan trip", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Trip to Museum: 3 stops from Harbour.",
  },
  breaks: [
    {
      broke: "Typing no longer moves focus to a station.",
      find: "if (index !== -1) roving.focus(items[index].key)",
      replace: "",
      caught: "keyboard: typing a name moves focus to that station and picks nothing",
    },
    {
      broke: "Space during a query no longer continues it.",
      find: '(event.key === " " && !typeahead.active())',
      replace: '(event.key === " ")',
      caught: "keyboard: Space continues a name that is being typed, and picks the focused station when none is",
    },
    {
      broke: "Space and Enter no longer pick a station.",
      find: "return void pick(key, \"item-press\", event)",
      replace: "return",
      caught: "keyboard: Space and Enter pick the focused station, and the arrow keys do not",
    },
    {
      broke: "An agent can pick a station that is not on the line.",
      find: "if (!names().includes(value)) return false",
      replace: "",
      caught: "agent: an agent picks Museum and plans the trip, and a station that is not on the line is refused",
    },
    {
      broke: "The line has 1 tab stop for each station.",
      find: 'tabindex: api.roving.tabIndex(state, { key, props }),',
      replace: 'tabindex: "0",',
      caught: "keyboard: the line is 1 tab stop, and Left and Right, Home and End move focus only",
    },
    {
      broke: "The picked station is not marked selected.",
      find: '"aria-selected": String(state.value === key),',
      replace: '"aria-selected": "false",',
      caught: "keyboard: Space and Enter pick the focused station, and the arrow keys do not",
    },
  ],
}

export { metroLine }
export default ui
