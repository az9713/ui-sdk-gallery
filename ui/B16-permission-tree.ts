import {
  type ChangeDetails,
  checkedAttrs,
  createChange,
  createRovingFocus,
  createTreeCollection,
  createTypeahead,
  definePrimitive,
  isRTL,
  isTypeaheadKey,
  labelOf,
  toggleTreeChecked,
  treeCheckedStates,
  treeDataNodes,
  treeFromPaths,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import type { UI } from "../src/ui"

type CheckedReason = "item-press" | "imperative"
type ExpandedReason = "trigger-press" | "list-navigation" | "imperative"
type Options = {
  paths: string[]
  locked?: string[]
  checked?: string[]
  defaultChecked?: string[]
  onCheckedChange?: (value: string[], details: ChangeDetails<CheckedReason>) => void
  expanded?: string[]
  defaultExpanded?: string[]
  onExpandedChange?: (value: string[], details: ChangeDetails<ExpandedReason>) => void
}
// paths and locked are options that an item renders from, so the state has a copy: a part must not read an option.
type State = { focused: string | null; checked: string[]; expanded: string[]; paths: string[]; locked: string[] }
type Tree = ReturnType<typeof createTreeCollection>

const permissionTree = definePrimitive({
  name: "permission-tree",
  options: {
    paths: "list",
    locked: "list",
    checked: "list",
    defaultChecked: "list",
    onCheckedChange: "callback",
    expanded: "list",
    defaultExpanded: "list",
    onExpandedChange: "callback",
  },
  controlled: ["checked", "expanded"],
  state: (options: Options): State => ({
    focused: null,
    checked: options.checked ?? options.defaultChecked ?? [],
    expanded: options.expanded ?? options.defaultExpanded ?? [],
    paths: options.paths ?? [],
    locked: options.locked ?? [],
  }),
  sync: (options) => ({
    paths: options.paths ?? [],
    locked: options.locked ?? [],
    ...(options.checked === undefined ? {} : { checked: options.checked }),
    ...(options.expanded === undefined ? {} : { expanded: options.expanded }),
  }),
  api: (context) => {
    const change = createChange(context)
    let built: { paths: string; tree: Tree } | undefined
    const tree = (state: State) => {
      const paths = state.paths.join("\n")
      if (built?.paths !== paths) built = { paths, tree: createTreeCollection(treeDataNodes(treeFromPaths(state.paths))) }
      return built.tree
    }
    let read: { tree: Tree; checked: string[]; state: (key: string) => boolean | "indeterminate" } | undefined
    const checkedOf = (state: State, key: string) => {
      const t = tree(state)
      if (read?.tree !== t || read.checked !== state.checked)
        read = { tree: t, checked: state.checked, state: treeCheckedStates(t, state.checked) }
      return read.state(key)
    }
    const shown = (state: State, key: string) => tree(state).ancestors(key).every((branch) => state.expanded.includes(branch))
    const setOpen = (key: string, open: boolean, details: { reason: ExpandedReason; event?: Event }) => {
      const state = context.store.get()
      if (!tree(state).isBranch(key) || state.expanded.includes(key) === open) return false
      return change("expanded", open ? [...state.expanded, key] : state.expanded.filter((k) => k !== key), details)
    }
    const roving = createRovingFocus(context, {
      slot: "item",
      key: "focused",
      move: (event, { from, rtl }) => {
        const state = context.store.get()
        const t = tree(state)
        const order = t.visible(state.expanded)
        const at = order.indexOf(from.key)
        if (event.key === "ArrowDown") return order[at + 1]
        if (event.key === "ArrowUp") return order[at - 1]
        if (event.key === "Home") return order[0]
        if (event.key === "End") return order.at(-1)
        if (event.key === (rtl ? "ArrowLeft" : "ArrowRight"))
          return state.expanded.includes(from.key) ? t.children(from.key)[0] : undefined
        if (event.key === (rtl ? "ArrowRight" : "ArrowLeft")) return t.parent(from.key) ?? undefined
        return undefined
      },
    })
    const typeahead = createTypeahead()
    const toggle = (key: string, event?: Event) => {
      const state = context.store.get()
      const t = tree(state)
      if (!t.has(key)) throw new Error(`No permission "${key}". Permissions: ${t.keys().join(", ")}.`)
      if (state.locked.includes(key)) {
        if (event) return false
        throw new Error(`"${key}" is locked. Only the owner can change it.`)
      }
      const next = toggleTreeChecked(t, state.checked, key, { checkable: (k) => !state.locked.includes(k) })
      return change("checked", next, event ? { reason: "item-press", event } : { reason: "imperative" })
    }
    return {
      roving,
      tree,
      checkedOf,
      shown,
      setOpen,
      toggle,
      permissions: () => tree(context.store.get()).keys(),
      keydown: (event: KeyboardEvent, el: HTMLElement, key: string) => {
        if (event.key === "Enter" || (event.key === " " && !typeahead.active())) {
          event.preventDefault()
          toggle(key, event)
          return
        }
        const state = context.store.get()
        const open = state.expanded.includes(key)
        const inward = isRTL(el) ? "ArrowLeft" : "ArrowRight"
        const outward = isRTL(el) ? "ArrowRight" : "ArrowLeft"
        if (tree(state).isBranch(key) && ((event.key === inward && !open) || (event.key === outward && open))) {
          event.preventDefault()
          setOpen(key, !open, { reason: "list-navigation", event })
          return
        }
        if (roving.keydown(event, el) || !isTypeaheadKey(event)) return
        if (event.key === " ") event.preventDefault()
        const items = roving.items()
        const index = typeahead(event.key, items.map((item) => labelOf(item.el)), items.findIndex((item) => item.el === el))
        if (index !== -1) roving.focus(items[index].key)
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "tree",
      keys: { none: "Each permission handles the arrow keys." },
    }),
    item: slot<{ value: string }>({
      role: "treeitem",
      focus: "roving",
      props: { value: "string" },
      present: (state, { key, api }) => api.shown(state, key),
      attrs: (state, { key, props, api }) => {
        const tree = api.tree(state)
        const checked = api.checkedOf(state, key)
        const { index, size } = tree.position(key)
        const locked = state.locked.includes(key)
        return {
          tabindex: api.roving.tabIndex(state, { key, props }),
          "aria-level": String(tree.level(key)),
          "aria-posinset": String(index),
          "aria-setsize": String(size),
          "aria-expanded": tree.isBranch(key) ? String(state.expanded.includes(key)) : undefined,
          "aria-checked": checked === "indeterminate" ? "mixed" : String(checked),
          "aria-disabled": locked ? "true" : undefined,
          "data-locked": locked ? "" : undefined,
          ...checkedAttrs(checked),
        }
      },
      // A click on the arrow opens or closes the branch. A click on the rest of the row checks it.
      press: ({ api, key, store }, event) => {
        if (event?.target instanceof Element && event.target.closest("[data-chevron]"))
          api.setOpen(key, !store.get().expanded.includes(key), { reason: "trigger-press", event })
        else api.toggle(key, event)
      },
      on: {
        keydown: (event, { el, api, key }) => api.keydown(event, el!, key),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
  agent: { actions: ["toggle"], items: (api) => api.permissions().map((key) => ({ value: key, label: key })) },
})

createParts(permissionTree, { root: "b16-permission-tree", item: "b16-permission" })

const PATHS = [
  "Projects/View",
  "Projects/Edit",
  "Projects/Delete",
  "Billing/Invoices/View",
  "Billing/Invoices/Refund",
  "Billing/Plan",
  "Members/Invite",
  "Members/Remove",
]
const LOCKED = ["Billing/Invoices/Refund"]
const CHECKED = ["Projects/View", "Projects/Edit", "Projects/Delete", "Billing/Invoices/View"]
const NODES = treeDataNodes(treeFromPaths(PATHS))
const BRANCHES = NODES.filter((node) => node.item.children).map((node) => node.key)
const count = (checked: string[]) => `${checked.length} of ${PATHS.length} permissions are on.`

const html = `
<h2>Support agent role</h2>
<p id="b16-help">Check a section to turn on all of its permissions. A dash shows a section with only some of them on. Refunds stay with the owner.</p>
<b16-permission-tree aria-label="Permissions" aria-describedby="b16-help" paths="${PATHS}" locked="${LOCKED}" default-checked="${CHECKED}" default-expanded="${BRANCHES}">
  ${NODES.map(
    ({ key, item }) =>
      `<b16-permission value="${key}">${item.children ? '<span data-chevron aria-hidden="true"></span>' : "<span data-spacer></span>"}<span data-box aria-hidden="true"></span><span>${item.label}</span>${LOCKED.includes(key) ? " <small>Owner only</small>" : ""}</b16-permission>`,
  ).join("")}
</b16-permission-tree>
<p role="status" data-status>${count(CHECKED)}</p>
<ui-button data-save><button>Save role</button></ui-button>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; max-width: 460px; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] #b16-help, [data-stage] [data-status] { max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
[data-stage] b16-permission-tree {
  display: grid; gap: 2px; width: 100%; padding: 6px;
  border: 1px solid var(--ui-border); border-radius: var(--ui-radius);
}
[data-stage] b16-permission {
  display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 4px 12px 4px 8px;
  border-radius: calc(var(--ui-radius) - 2px); cursor: pointer; user-select: none;
}
[data-stage] b16-permission[hidden] { display: none; }
[data-stage] b16-permission[aria-level="2"] { padding-inline-start: 32px; }
[data-stage] b16-permission[aria-level="3"] { padding-inline-start: 56px; }
[data-stage] b16-permission:hover { background: var(--ui-muted); }
[data-stage] b16-permission:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: -2px; }
[data-stage] b16-permission[aria-level="1"] { font-weight: 600; }
[data-stage] [data-chevron], [data-stage] [data-spacer] { flex: none; width: 16px; height: 16px; }
[data-stage] [data-chevron] {
  background: var(--ui-muted-foreground);
  mask: var(--ui-icon-chevron) center / 14px no-repeat;
  transition: transform 120ms;
}
[data-stage] b16-permission[aria-expanded="false"] [data-chevron] { transform: rotate(-90deg); }
[data-stage] b16-permission[aria-expanded="false"]:dir(rtl) [data-chevron] { transform: rotate(90deg); }
[data-stage] [data-box] {
  position: relative; flex: none; width: 16px; height: 16px;
  border: 1px solid var(--ui-input); border-radius: 4px; background: var(--ui-background);
}
[data-stage] b16-permission:is([data-checked], [data-indeterminate]) [data-box] { border-color: var(--ui-primary); background: var(--ui-primary); }
[data-stage] b16-permission:is([data-checked], [data-indeterminate]) [data-box]::after {
  content: ""; position: absolute; inset: 0; background: var(--ui-primary-foreground);
  mask: var(--ui-icon-check) center / 12px no-repeat;
}
[data-stage] b16-permission[data-indeterminate] [data-box]::after { mask-image: var(--ui-icon-minus); }
[data-stage] b16-permission[data-locked] { cursor: not-allowed; }
[data-stage] b16-permission[data-locked] [data-box] { border-style: dashed; background: var(--ui-muted); }
[data-stage] b16-permission small { color: var(--ui-muted-foreground); font-size: 0.75rem; font-weight: 400; }
[data-stage] [data-status] { min-height: 1.25rem; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  let checked = CHECKED
  root.querySelector("b16-permission-tree")!.addEventListener("checkedchange", (event) => {
    checked = (event as CustomEvent<{ value: string[] }>).detail.value
    status.textContent = count(checked)
  })
  root.querySelector("[data-save]")!.addEventListener("action", () => {
    status.textContent = `Saved: ${checked.length} of ${PATHS.length} permissions for Support agent.`
  })
}

const ui: UI = {
  id: "B16",
  request:
    "Build a permission tree from a list of permission paths: each box is checked, unchecked or mixed, checking a section checks all of it, and a locked permission keeps its state.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Permissions", action: "toggle", args: ["Members"] },
      { ref: "Permissions", action: "toggle", args: ["Members/Remove"] },
      { ref: "Save role", action: "press" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Saved: 5 of 8 permissions for Support agent." &&
      root.querySelector('b16-permission[value="Members"]')!.getAttribute("aria-checked") === "mixed",
  },
  breaks: [
    {
      broke: "A branch with only some permissions on no longer reads as mixed.",
      find: '"aria-checked": checked === "indeterminate" ? "mixed" : String(checked),',
      replace: '"aria-checked": String(checked === true),',
      caught: "keyboard: unchecking 1 permission makes each branch above it mixed",
    },
    {
      broke: "Checking a branch no longer checks the permissions in it.",
      find: "const next = toggleTreeChecked(t, state.checked, key, { checkable: (k) => !state.locked.includes(k) })",
      replace: "const next = state.checked.includes(key) ? state.checked.filter((k) => k !== key) : [...state.checked, key]",
      caught: "keyboard: Space on a branch checks all of it, Space again clears it, and Enter checks 1 permission",
    },
    {
      broke: "Checking a branch also checks its locked permission.",
      find: "{ checkable: (k) => !state.locked.includes(k) }",
      replace: "{}",
      caught: "keyboard: a locked permission keeps its state, and its branch stays mixed",
    },
    {
      broke: "Space and Enter no longer check a permission.",
      find: 'if (event.key === "Enter" || (event.key === " " && !typeahead.active())) {',
      replace: "if (false) {",
      caught: "keyboard: Space on a branch checks all of it, Space again clears it, and Enter checks 1 permission",
    },
    {
      broke: "Each permission is a tab stop.",
      find: "tabindex: api.roving.tabIndex(state, { key, props }),",
      replace: 'tabindex: "0",',
      caught: "keyboard: the tree is 1 tab stop, and each permission has its level and place",
    },
    {
      broke: "Right and Left no longer open and close a branch.",
      find: 'setOpen(key, !open, { reason: "list-navigation", event })',
      replace: "",
      caught: "keyboard: Right opens a branch and then enters it, Left goes to the parent and then closes it",
    },
    {
      broke: "Right always opens a branch, also in right-to-left text.",
      find: 'const inward = isRTL(el) ? "ArrowLeft" : "ArrowRight"',
      replace: 'const inward = "ArrowRight"',
      caught: "direction: Right and Left follow the text direction",
    },
    {
      broke: "A click on the arrow checks the branch instead of opening it.",
      find: 'event.target.closest("[data-chevron]")',
      replace: "false",
      caught: "pointer: a click on the arrow opens a branch, and a click on the row checks it",
    },
    {
      broke: "An agent can no longer check a permission.",
      find: 'actions: ["toggle"],',
      replace: "actions: [],",
      caught: "agent: an agent finds the tree, checks a section, unchecks 1 permission and saves, and cannot change a locked one",
    },
  ],
}

export { permissionTree }
export default ui
