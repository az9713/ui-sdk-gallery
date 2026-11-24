import {
  type ChangeDetails,
  createChange,
  createRovingFocus,
  createTreeCollection,
  createTreeReorder,
  createTypeahead,
  definePrimitive,
  isTypeaheadKey,
  keepFocus,
  labelOf,
  type TreeReorderDraft,
  type TreeReorderReason,
  type TreeReorderRow,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import type { UI } from "../src/ui"

type Rows = TreeReorderRow[]
type Options = {
  value?: Rows
  defaultValue?: Rows
  onValueChange?: (value: Rows, details: ChangeDetails<TreeReorderReason>) => void
}
type State = { active: string | null; value: Rows; moving: TreeReorderDraft | null; collapsed: string[] }

const MAX_DEPTH = 2

// An attribute lists the rows with commas, and each leading "-" is 1 level: "Goals,-Grow signups".
const parseRows = (attribute: unknown): Rows | undefined =>
  Array.isArray(attribute)
    ? attribute
    : typeof attribute === "string"
      ? attribute.split(",").map((entry) => {
          const key = entry.trim().replace(/^-+/, "")
          return { key, depth: entry.trim().length - key.length }
        })
      : undefined

const shapes = new WeakMap<Rows, ReturnType<typeof createTreeCollection>>()
function shape(rows: Rows) {
  let collection = shapes.get(rows)
  if (!collection) {
    const path: string[] = []
    collection = createTreeCollection(
      rows.map(({ key, depth }) => {
        path.length = depth
        const parent = path[depth - 1] ?? null
        path[depth] = key
        return { key, parent }
      }),
    )
    shapes.set(rows, collection)
  }
  return collection
}

const outline = definePrimitive({
  name: "outline",
  options: { value: parseRows, defaultValue: parseRows, onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    active: null,
    value: options.value ?? options.defaultValue ?? [],
    moving: null,
    collapsed: [],
  }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    const tree = createTreeReorder(context, {
      key: "value",
      draft: "moving",
      set: (value, details) => {
        const done = change("value", value, details)
        const { collapsed } = context.store.get()
        const ancestors = shape(value).ancestors(details.key)
        if (done) context.store.set({ collapsed: collapsed.filter((key) => !ancestors.includes(key)) })
        return done
      },
      indent: () => 28,
      maxDepth: () => MAX_DEPTH,
    })
    // A row under a closed branch is hidden, except while it moves.
    const shown = (state: State, key: string) =>
      tree.moving(state, key) || !shape(tree.rows(state)).ancestors(key).some((a) => state.collapsed.includes(a))
    const rows = () => tree.rows(context.store.get())
    const roving = createRovingFocus(context, {
      slot: "row",
      key: "active",
      focusable: (item) => shown(context.store.get(), item.key),
      move: (event, { from, items }) => {
        const keys = items.map((item) => item.key)
        const at = keys.indexOf(from.key)
        if (event.key === "ArrowDown") return keys[Math.min(at + 1, keys.length - 1)]
        if (event.key === "ArrowUp") return keys[Math.max(at - 1, 0)]
        if (event.key === "Home") return keys[0]
        if (event.key === "End") return keys.at(-1)
        return undefined
      },
    })
    const typeahead = createTypeahead()
    const setOpen = (key: string, open: boolean) => {
      const { collapsed } = context.store.get()
      context.store.set({ collapsed: open ? collapsed.filter((k) => k !== key) : [...collapsed, key] })
    }
    // APG tree: Right opens a closed branch, then goes to its first child. Left closes an open branch, then goes to the parent.
    const branchKey = (event: KeyboardEvent, key: string, el: HTMLElement) => {
      const rtl = getComputedStyle(el).direction === "rtl"
      const inward = rtl ? "ArrowLeft" : "ArrowRight"
      const outward = rtl ? "ArrowRight" : "ArrowLeft"
      if (event.key !== inward && event.key !== outward) return false
      event.preventDefault()
      const here = shape(rows())
      const open = !context.store.get().collapsed.includes(key)
      if (event.key === inward && here.isBranch(key)) {
        if (open) roving.focus(here.children(key)[0])
        else setOpen(key, true)
      }
      if (event.key === outward) {
        if (here.isBranch(key) && open) setOpen(key, false)
        else if (here.parent(key)) roving.focus(here.parent(key)!)
      }
      return true
    }
    const find = (event: KeyboardEvent, el: HTMLElement) => {
      if (!isTypeaheadKey(event)) return
      const items = roving.items()
      const index = typeahead(event.key, items.map((item) => labelOf(item.el)), items.findIndex((item) => item.el === el))
      if (index !== -1) roving.focus(items[index].key)
    }
    return {
      tree,
      roving,
      rows,
      shown,
      keydown: (event: KeyboardEvent, key: string, el: HTMLElement) =>
        tree.keydown(event, key) || branchKey(event, key, el) || roving.keydown(event, el) || find(event, el),
      toggle: (key: string) => {
        if (!shape(rows()).isBranch(key)) return
        setOpen(key, context.store.get().collapsed.includes(key))
        roving.focus(key)
      },
      move: (key: string, before: string | null, depth: number) => {
        const keys = rows().map((row) => row.key)
        for (const name of [key, before]) {
          if (name !== null && !keys.includes(name)) throw new Error(`No row "${name}". Rows: ${keys.join(", ")}.`)
        }
        return tree.move(key, before, depth)
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "tree",
      keys: { none: "Each row handles the arrow keys." },
      // Custom element rows are static markup, so the root puts them in the order that the state shows.
      bind: (el, { api, store }) => {
        const place = () => {
          const items = [...el.children] as HTMLElement[]
          const sorted = api.rows().map(({ key }) => items.find((item) => item.getAttribute("value") === key)!)
          if (sorted.every((item, i) => item === items[i])) return
          const focused = sorted.find((item) => item === document.activeElement)
          for (const item of sorted) el.append(item)
          if (focused) keepFocus(() => focused)
        }
        return store.subscribe(place)
      },
    }),
    row: slot<{ value: string }>({
      role: "treeitem",
      focus: "roving",
      props: { value: "string" },
      present: (state, { key, api }) => api.shown(state, key),
      attrs: (state, { key, props, api }) => {
        const here = shape(api.tree.rows(state))
        const { index, size } = here.position(key)
        return {
          tabindex: api.roving.tabIndex(state, { key, props }),
          "aria-level": String(here.level(key)),
          "aria-posinset": String(index),
          "aria-setsize": String(size),
          "aria-expanded": here.isBranch(key) ? String(!state.collapsed.includes(key)) : undefined,
          "aria-selected": String(api.tree.moving(state, key)),
          "data-grabbed": api.tree.moving(state, key) ? "" : undefined,
          "data-dragging": api.tree.dragging(state, key) ? "" : undefined,
        }
      },
      press: { none: "A row is picked up with Space or Enter, and the keydown handler does it." },
      on: {
        keydown: (event, { el, api, key }) => void api.keydown(event, key, el!),
        pointerdown: (event, { api, key }) => {
          if (!(event.target as Element).closest("[data-toggle]")) api.tree.pointerdown(event, key)
        },
        click: (event, { api, key }) => {
          if ((event.target as Element).closest("[data-toggle]")) api.toggle(key)
        },
      },
      bind: (el, part) => {
        const cleanups = [part.api.roving.bind(el, part), part.api.tree.bind(el, part.key)]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
  }),
  agent: { actions: ["move"], items: (api) => api.rows().map(({ key }) => ({ value: key, label: key })) },
})

createParts(outline, { root: "b15-outline", row: "b15-row" })

const ROWS: [string, number][] = [
  ["Goals", 0],
  ["Grow signups", 1],
  ["Cut churn", 1],
  ["Timeline", 0],
  ["Beta in March", 1],
  ["Launch in May", 1],
  ["Risks", 0],
  ["Late hiring", 1],
]

const html = `
<h2>Launch plan</h2>
<p id="b15-help">Drag a row up or down to move it, and sideways to nest it. With the keyboard, press Space to pick a row up, Up and Down to move it, Left and Right to change its level, then Space to drop it. Escape puts it back.</p>
<b15-outline aria-label="Outline" aria-describedby="b15-help" default-value="${ROWS.map(([key, depth]) => "-".repeat(depth) + key)}">
  ${ROWS.map(([key]) => `<b15-row value="${key}" aria-describedby="b15-help"><span data-toggle aria-hidden="true"></span>${key}</b15-row>`).join("")}
</b15-outline>
<p role="status" data-status>The outline has not changed.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 440px; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] #b15-help, [data-stage] [data-status] { color: var(--ui-muted-foreground); font-size: 0.875rem; max-width: 60ch; }
[data-stage] b15-outline { display: grid; gap: 6px; }
[data-stage] b15-row {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); cursor: grab; user-select: none; touch-action: none;
}
[data-stage] b15-row[hidden] { display: none; }
[data-stage] b15-row [data-toggle] { width: 16px; height: 16px; flex: none; color: var(--ui-muted-foreground); cursor: pointer; }
[data-stage] b15-row[aria-expanded] [data-toggle]::before { content: "\\25BE" / ""; }
[data-stage] b15-row[aria-expanded="false"] [data-toggle]::before { content: "\\25B8" / ""; }
[data-stage] b15-row[aria-level="1"] { font-weight: 600; }
[data-stage] b15-row[aria-level="2"] { margin-inline-start: 28px; }
[data-stage] b15-row[aria-level="3"] { margin-inline-start: 56px; }
[data-stage] b15-row:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b15-row[data-grabbed] { border-color: var(--ui-primary); box-shadow: 0 0 0 2px var(--ui-primary); }
[data-stage] b15-row[data-dragging] { cursor: grabbing; box-shadow: 0 4px 12px var(--ui-shadow), 0 0 0 2px var(--ui-primary); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  root.querySelector("b15-outline")!.addEventListener("valuechange", (event) => {
    const { value, key } = (event as CustomEvent<{ value: Rows; key: string }>).detail
    const here = shape(value)
    const parent = here.parent(key)
    const { index, size } = here.position(key)
    status.textContent = `Moved ${key} ${parent ? `under ${parent}` : "to the top level"}, place ${index} of ${size}.`
  })
}

const ui: UI = {
  id: "B15",
  request:
    "Build an outline editor where a person drags a row up or down to reorder it and sideways to nest it, with the same moves on the keyboard.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Outline", action: "move", args: ["Cut churn", null, 1] },
      { ref: "Outline", action: "move", args: ["Risks", "Timeline", 0] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Moved Risks to the top level, place 2 of 3." &&
      [...root.querySelectorAll("b15-row")].map((row) => row.textContent).join(",") ===
        "Goals,Grow signups,Risks,Late hiring,Cut churn,Timeline,Beta in March,Launch in May",
  },
  breaks: [
    {
      broke: "Every row is a tab stop.",
      find: "tabindex: api.roving.tabIndex(state, { key, props }),",
      replace: 'tabindex: "0",',
      caught: "keyboard: the tree is 1 tab stop, and Up, Down, Home and End move focus without a change",
    },
    {
      broke: "Space and Enter no longer pick a row up.",
      find: "tree.keydown(event, key) || ",
      replace: "",
      caught: "keyboard: Space picks up a row, Right nests it under the row above, and Space drops it",
    },
    {
      broke: "Dropping a row does not commit the new outline.",
      find: 'const done = change("value", value, details)',
      replace: "const done = false",
      caught: "keyboard: Space picks up a row, Right nests it under the row above, and Space drops it",
    },
    {
      broke: "A row shows level 1 at every depth.",
      find: '"aria-level": String(here.level(key)),',
      replace: '"aria-level": "1",',
      caught: "keyboard: Space picks up a row, Right nests it under the row above, and Space drops it",
    },
    {
      broke: "A row nests deeper than level 3.",
      find: "maxDepth: () => MAX_DEPTH,",
      replace: "",
      caught: "keyboard: the first row cannot nest, and a row goes no deeper than level 3",
    },
    {
      broke: "Left and Right no longer move into, out of, close or open a branch.",
      find: "branchKey(event, key, el) || ",
      replace: "",
      caught: "keyboard: Right goes into a branch and Left back out, then Left closes the branch and Right opens it",
    },
    {
      broke: "A closed branch still shows its rows.",
      find: "present: (state, { key, api }) => api.shown(state, key),",
      replace: "",
      caught: "keyboard: Right goes into a branch and Left back out, then Left closes the branch and Right opens it",
    },
    {
      broke: "A row dropped into a closed branch stays hidden.",
      find: "if (done) context.store.set({ collapsed: collapsed.filter((key) => !ancestors.includes(key)) })",
      replace: "",
      caught: "keyboard: a closed branch moves with its hidden rows, and a row dropped into a closed branch opens it",
    },
    {
      broke: "Typing a letter no longer moves focus.",
      find: " || find(event, el),",
      replace: ",",
      caught: "keyboard: the tree passes the APG tree view checks, typing a letter included",
    },
    {
      broke: "A pointer press no longer starts a drag.",
      find: 'if (!(event.target as Element).closest("[data-toggle]")) api.tree.pointerdown(event, key)',
      replace: "",
      caught: "pointer: a drag sideways nests a row under the row above and reports the drag",
    },
    {
      broke: "The page does not show the rows in the new order.",
      find: "for (const item of sorted) el.append(item)",
      replace: "",
      caught: "keyboard: on the page, the rows follow the new order, focus stays on the moved row and the status line reports it",
    },
    {
      broke: "An agent can no longer move a row.",
      find: 'actions: ["move"],',
      replace: "actions: [],",
      caught: "agent: an agent finds the outline and its rows, nests 1 row and moves a branch",
    },
  ],
}

export { outline }
export default ui
