import {
  bindScrollPicker,
  type ChangeDetails,
  createChange,
  createRovingFocus,
  definePrimitive,
  elements,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import type { UI } from "../src/ui"

type Reason = "item-press" | "list-navigation" | "scroll" | "imperative"
type Options = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string | null, details: ChangeDetails<Reason>) => void
}
type State = { active: string | null; value: string | null }

const timeWheel = definePrimitive({
  name: "time-wheel",
  options: { value: "string", defaultValue: "string", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({ active: null, value: options.value ?? options.defaultValue ?? null }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    // The tab stop is the picked option, so it follows a scroll as well as a key.
    const roving = createRovingFocus<State, { value: string }>(context, {
      slot: "option",
      key: "active",
      remember: false,
      preferred: (item) => item.key === context.store.get().value,
      claims: (state, item) => state.value === null || item.key === state.value,
    })
    const values = () => elements<{ value: string }>(context, "option").map((part) => part.key)
    const pick = (value: string, reason: Reason, event?: Event) => {
      if (!values().includes(value)) return false
      return change("value", value, { reason, event })
    }
    return {
      roving,
      values,
      pick: (value: string) => pick(value, "imperative"),
      choose: pick,
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "listbox",
      keys: { none: "Each option handles the arrow keys." },
      attrs: () => ({ "aria-orientation": "vertical" }),
      // The picker reports the option at the center as the list scrolls, and a scroll picks it like a key does.
      bind: (el, { api }) =>
        bindScrollPicker(el, {
          onSelect: (index, { event }) => {
            const value = api.values()[index]
            if (value !== undefined) api.choose(value, "scroll", event)
          },
        }),
    }),
    option: slot<{ value: string }>({
      role: "option",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, { key, props, api }) => ({
        tabindex: api.roving.tabIndex(state, { key, props }),
        "aria-selected": String(state.value === key),
        "data-selected": state.value === key ? "" : undefined,
      }),
      // The picker keeps a press from focusing the option, so the press does it: later keys then go to this wheel.
      press: ({ api, key }, event) => {
        api.choose(key, "item-press", event)
        api.roving.focus(key)
      },
      on: {
        // Selection follows focus, as in a single-select listbox.
        keydown: (event, { el, api }) => {
          const moved = api.roving.keydown(event, el!)
          if (moved && moved.key !== moved.from) api.choose(moved.key, "list-navigation", event)
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
  agent: { actions: ["pick"], items: (api) => api.values().map((value) => ({ value, label: value })) },
})

createParts(timeWheel, { root: { tag: "b14-wheel", display: "block" }, option: { tag: "b14-option", display: "block" } })

const pad = (n: number) => String(n).padStart(2, "0")
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i))
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5))
const options = (list: string[]) => list.map((v) => `<b14-option value="${v}">${v}</b14-option>`).join("")

const html = `
<h2>Alarm time</h2>
<div data-wheels>
  <b14-wheel aria-label="Hour wheel" default-value="06">${options(HOURS)}</b14-wheel>
  <span data-colon aria-hidden="true">:</span>
  <b14-wheel aria-label="Minute wheel" default-value="00">${options(MINUTES)}</b14-wheel>
</div>
<p role="status" data-status>Time: 06:00.</p>
<ui-button data-set><button>Set alarm</button></ui-button>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] [data-wheels] {
  display: flex; align-items: center; gap: 4px; padding: 0 20px;
  border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-background);
}
[data-stage] [data-colon] { font-size: 1.25rem; font-weight: 600; }
[data-stage] b14-wheel {
  box-sizing: border-box; width: 4.5rem; height: 180px; padding-block: 72px;
  overflow-y: auto; scroll-snap-type: y mandatory; overscroll-behavior: contain; scrollbar-width: none;
  mask-image: linear-gradient(transparent, #000 30%, #000 70%, transparent);
}
[data-stage] b14-option {
  height: 36px; line-height: 36px; text-align: center; scroll-snap-align: center;
  border-radius: var(--ui-radius); font-size: 1.125rem; font-variant-numeric: tabular-nums;
  cursor: pointer; user-select: none;
  opacity: clamp(0, calc(3 - abs(var(--picker-offset, 0))), 1);
}
[data-stage] b14-option[data-selected] { background: var(--ui-muted); font-weight: 600; }
[data-stage] b14-option:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: -2px; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const [hour, minute] = [...root.querySelectorAll("b14-wheel")]
  let current = { hour: "06", minute: "00" }
  const show = () => (status.textContent = `Time: ${current.hour}:${current.minute}.`)
  for (const [wheel, part] of [[hour, "hour"], [minute, "minute"]] as const)
    wheel.addEventListener("valuechange", (event) => {
      current = { ...current, [part]: (event as CustomEvent<{ value: string }>).detail.value }
      show()
    })
  root.querySelector("[data-set]")!.addEventListener("action", () => {
    status.textContent = `Alarm set for ${current.hour}:${current.minute}.`
  })
}

const ui: UI = {
  id: "B14",
  request:
    "Build a time wheel for an alarm: an hour wheel and a minute wheel that a person scrolls or drags, where the number at the center is the value, and the arrow keys and a click pick a number too.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Hour wheel", action: "pick", args: ["07"] },
      { ref: "Minute wheel", action: "pick", args: ["30"] },
      { ref: "Set alarm", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Alarm set for 07:30.",
  },
  breaks: [
    {
      broke: "A scroll no longer picks the option at the center.",
      find: 'if (value !== undefined) api.choose(value, "scroll", event)',
      replace: "",
      caught: "keyboard: scrolling the wheel picks the option at the center",
    },
    {
      broke: "An arrow key moves focus but no longer picks the option.",
      find: 'if (moved && moved.key !== moved.from) api.choose(moved.key, "list-navigation", event)',
      replace: "",
      caught: "keyboard: arrow keys, Home and End pick the option that gets focus",
    },
    {
      broke: "The tab stop no longer follows the picked option.",
      find: "preferred: (item) => item.key === context.store.get().value,",
      replace: "",
      caught: "keyboard: the wheel is 1 tab stop, and it is the picked option",
    },
    {
      broke: "The picked option is not marked selected.",
      find: '"aria-selected": String(state.value === key),',
      replace: '"aria-selected": "false",',
      caught: "keyboard: the wheel is 1 tab stop, and it is the picked option",
    },
    {
      broke: "A click no longer picks an option.",
      find: 'api.choose(key, "item-press", event)',
      replace: "void 0",
      caught: "keyboard: a click picks an option and focuses it",
    },
    {
      broke: "A click picks an option but leaves focus where it was.",
      find: "api.roving.focus(key)",
      replace: "void 0",
      caught: "keyboard: a click picks an option and focuses it",
    },
    {
      broke: "An agent can pick a number that is not on the wheel.",
      find: "if (!values().includes(value)) return false",
      replace: "",
      caught: "agent: an agent picks 07:30 and sets the alarm, and a number that is not on the wheel is refused",
    },
  ],
}

export { timeWheel }
export default ui
