import {
  announce,
  type ChangeDetails,
  createChange,
  createListbox,
  definePrimitive,
  elements,
  selects,
} from "@ui-sdk/core"
import { createParts, wrappedChild } from "@ui-sdk/web"
import type { UI } from "../src/ui"

type Reason = "item-press" | "imperative"
type Options = {
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null, details: ChangeDetails<Reason>) => void
}
type State = { query: string; highlighted: string | null; value: string | null }

const matches = (count: number) => (count === 0 ? "No teammate matches." : `${count} ${count === 1 ? "teammate matches" : "teammates match"}.`)

const teammatePicker = definePrimitive({
  name: "teammate-picker",
  options: { value: "value", defaultValue: "value", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({ query: "", highlighted: null, value: options.value ?? options.defaultValue ?? null }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    const listbox = createListbox(context, {
      key: "highlighted",
      focus: "virtual",
      query: () => context.store.get().query,
    })
    const people = () => elements<{ value: string }>(context, "person").map((part) => part.key)
    const choose = (name: string, event?: Event) => {
      if (!people().includes(name)) return false
      return change("value", name, { reason: event ? "item-press" : "imperative", event })
    }
    const search = (query: string) => {
      context.store.set({ query })
      listbox.move("first")
      announce(matches(listbox.count()))
    }
    return {
      listbox,
      people,
      choose,
      search,
      clear: () => search(""),
      keydown: (event: KeyboardEvent) => {
        const { highlighted, query } = context.store.get()
        if (event.key === "Enter" && highlighted) {
          event.preventDefault()
          choose(highlighted, event)
        } else if (event.key === "Escape" && query) {
          event.preventDefault()
          search("")
        } else listbox.keydown(event)
      },
    }
  },
  slots: (slot) => ({
    root: slot({}),
    // The slot is named like the native element it holds, so a test can write <input /> for it.
    input: slot({
      role: "combobox",
      focus: "native",
      keys: { none: "keydown goes to api.keydown, which owns Enter and Escape and passes the arrows on." },
      attrs: (state, { id, api }) => ({
        "aria-expanded": "true",
        "aria-autocomplete": "list",
        "aria-controls": `${id}-list`,
        "aria-activedescendant": api.listbox.activeId(state),
        // A string type makes mount render an <input>. A web part already holds one.
        type: "text",
        autocomplete: "off",
      }),
      on: {
        input: (event, { api }) => api.search((event.target as HTMLInputElement).value),
        keydown: (event, { api }) => api.keydown(event),
      },
      // api.search writes the query from an agent too, so the field follows the state.
      bind: (el, { store }) =>
        store.subscribe(() => {
          const { query } = store.get()
          if ((el as HTMLInputElement).value !== query) (el as HTMLInputElement).value = query
        }),
    }),
    list: slot({
      role: "listbox",
      keys: { none: "The search input handles the keys while focus stays in it." },
      attrs: (_state, { id }) => ({ id: `${id}-list` }),
    }),
    person: slot<{ value: string }>({
      role: "option",
      focus: "active-descendant",
      props: { value: "string" },
      selects: selects({ highlighted: ({ key }) => [key, null] }),
      present: (_state, part) => part.api.listbox.shows(part),
      attrs: (state, part) => ({
        ...part.api.listbox.attrs(state, part),
        "aria-selected": String(state.value === part.key),
        "data-selected": state.value === part.key ? "" : undefined,
      }),
      press: ({ api, key }, event) => void api.choose(key, event),
      on: {
        // A press on an option keeps focus in the search input.
        pointerdown: (event) => event.preventDefault(),
        pointermove: (event, { api, key }) => api.listbox.highlight(key, { event }),
      },
      bind: (el, part) => part.api.listbox.bind(el, part),
    }),
    empty: slot({
      present: (_state, part) => part.api.listbox.count() === 0,
    }),
  }),
  agent: { actions: ["search", "choose", "clear"], items: (api) => api.people().map((name) => ({ value: name, label: name })) },
})

createParts(teammatePicker, {
  root: { tag: "b20-picker", display: "block" },
  input: { tag: "b20-picker-input", target: wrappedChild("input"), display: "block" },
  list: { tag: "b20-picker-list", display: "block" },
  person: "b20-person",
  empty: "b20-picker-empty",
})

const TEAM = ["Ada Okafor", "Bao Tran", "Carla Mendes", "Dev Patel", "Elena Rossi", "Farid Haddad", "Grace Kim", "Hana Sato"]

const html = `
<h2>Add a teammate to Launch plan</h2>
<b20-picker aria-label="Teammate picker">
  <b20-picker-input><input aria-label="Search teammates" placeholder="Search teammates" /></b20-picker-input>
  <b20-picker-list aria-label="Teammates">
    ${TEAM.map((name) => `<b20-person value="${name}">${name}</b20-person>`).join("")}
  </b20-picker-list>
  <b20-picker-empty>No teammate matches.</b20-picker-empty>
</b20-picker>
<p role="status" data-status>No teammate is chosen.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] b20-picker { display: grid; gap: 8px; width: 20rem; max-width: 100%; }
[data-stage] b20-picker-input input {
  box-sizing: border-box; width: 100%; height: calc(var(--ui-spacing) * 9); padding: 0 12px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); font: inherit;
}
[data-stage] b20-picker-input input::placeholder { color: var(--ui-muted-foreground); opacity: 1; }
[data-stage] b20-picker-input input:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b20-picker-list {
  display: grid; padding: 4px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius);
}
[data-stage] b20-person {
  display: block; padding: 8px 12px; border-radius: var(--ui-radius); cursor: pointer; user-select: none;
}
[data-stage] b20-person[data-highlighted] { background: var(--ui-muted); }
[data-stage] b20-person[data-selected] { font-weight: 600; }
[data-stage] b20-person[data-selected]::after { content: " (chosen)"; font-weight: 400; color: var(--ui-muted-foreground); }
[data-stage] b20-picker-empty { padding: 8px 12px; color: var(--ui-muted-foreground); }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  root.querySelector("b20-picker")!.addEventListener("valuechange", (event) => {
    const { value } = (event as CustomEvent<{ value: string | null }>).detail
    status.textContent = value ? `Chosen: ${value}.` : "No teammate is chosen."
  })
}

const ui: UI = {
  id: "B20",
  request:
    "Build a teammate picker: a search box over a list of names, where typing narrows the list, the arrow keys highlight a name while focus stays in the box, and Enter or a click chooses it.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Teammate picker", action: "search", args: ["an"] },
      { ref: "Teammate picker", action: "choose", args: ["Hana Sato"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Chosen: Hana Sato.",
  },
  breaks: [
    {
      broke: "Enter no longer chooses the highlighted name.",
      find: "choose(highlighted, event)",
      replace: "void 0",
      caught: "keyboard: Enter chooses the highlighted name, and Enter with no highlight chooses nothing",
    },
    {
      broke: "Escape claims the key when there is no text to clear.",
      find: 'else if (event.key === "Escape" && query) {',
      replace: 'else if (event.key === "Escape") {',
      caught: "keyboard: Escape clears the search text, and with no text it leaves the key alone",
    },
    {
      broke: "Names that do not match the search stay on the list.",
      find: "present: (_state, part) => part.api.listbox.shows(part),",
      replace: "",
      caught: "keyboard: typing narrows the list to the matches, and ignores case and where the text sits",
    },
    {
      broke: "Typing no longer highlights the first match.",
      find: 'listbox.move("first")',
      replace: "",
      caught: "keyboard: typing highlights the first match, so Enter chooses it",
    },
    {
      broke: "A press on a name moves focus out of the search box.",
      find: "pointerdown: (event) => event.preventDefault(),",
      replace: "pointerdown: () => {},",
      caught: "keyboard: a click chooses a name, and a press on a name keeps focus in the search box",
    },
    {
      broke: "The search box no longer points at the highlighted name.",
      find: '"aria-activedescendant": api.listbox.activeId(state),',
      replace: "",
      caught: "keyboard: ArrowDown and ArrowUp move the highlight, and aria-activedescendant follows it",
    },
    {
      broke: "The chosen name is not marked selected.",
      find: '"aria-selected": String(state.value === part.key),',
      replace: '"aria-selected": "false",',
      caught: "keyboard: Enter chooses the highlighted name, and Enter with no highlight chooses nothing",
    },
    {
      broke: "The empty message never shows.",
      find: "present: (_state, part) => part.api.listbox.count() === 0,",
      replace: "present: () => false,",
      caught: "keyboard: the highlight stays on the visible names, and a name with no match shows the empty message",
    },
    {
      broke: "An agent can choose a name that is not on the list.",
      find: "if (!people().includes(name)) return false",
      replace: "",
      caught: "agent: search and choose run through the api, and a name that is not on the page is refused",
    },
    {
      broke: "The search box does not follow a search that an agent makes.",
      find: "if ((el as HTMLInputElement).value !== query) (el as HTMLInputElement).value = query",
      replace: "",
      caught: "agent: search and choose run through the api, and a name that is not on the page is refused",
    },
    {
      broke: "A search is not announced to screen readers.",
      find: "announce(matches(listbox.count()))",
      replace: "",
      caught: "agent: search and choose run through the api, and a name that is not on the page is refused",
    },
  ],
}

export { teammatePicker }
export default ui
