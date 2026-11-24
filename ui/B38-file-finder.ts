import { announce, type ChangeDetails, createChange, createListbox, definePrimitive, selects } from "@ui-sdk/core"
import { fuzzyScore, matchRanges, matchSegments } from "@ui-sdk/core/text-match"
import { createParts, wrappedChild } from "@ui-sdk/web"
import { hierarchy, treemap, treemapSquarify } from "d3"
import type { UI } from "../src/ui"

type Reason = "item-press" | "imperative"
type FileInfo = { path: string; size: number }
type Options = {
  files: FileInfo[]
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null, details: ChangeDetails<Reason>) => void
}
// files is an option that the treemap and each row render from, so the state has a copy: a part must not read an option.
type State = { files: FileInfo[]; query: string; highlighted: string | null; value: string | null }

const matches = (count: number) => (count === 0 ? "No file matches." : `${count} ${count === 1 ? "file matches" : "files match"}.`)
const kb = (size: number) => `${size.toFixed(1)} KB`

const fileFinder = definePrimitive({
  name: "file-finder",
  options: { files: "value", value: "value", defaultValue: "value", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    files: options.files,
    query: "",
    highlighted: null,
    value: options.value ?? options.defaultValue ?? null,
  }),
  sync: (options) => ({ files: options.files, ...(options.value === undefined ? {} : { value: options.value }) }),
  api: (context) => {
    const change = createChange(context)
    const listbox = createListbox(context, {
      key: "highlighted",
      focus: "virtual",
      items: () => context.store.get().files.map((file) => ({ value: file.path, label: file.path })),
      query: () => context.store.get().query,
      filter: () => (item, query) => fuzzyScore(item.label, query),
    })
    const known = (path: string) => context.store.get().files.some((file) => file.path === path)
    // The paths that match the query, best score first. Equal scores keep the order of the repository.
    const ranked = () => {
      const { files, query } = context.store.get()
      return files
        .map((file, index) => ({ path: file.path, index, score: fuzzyScore(file.path, query) }))
        .filter((file) => file.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((file) => file.path)
    }
    const open = (path: string, event?: Event) => {
      if (!known(path)) return false
      return change("value", path, { reason: event ? "item-press" : "imperative", event })
    }
    const search = (query: string) => {
      context.store.set({ query })
      listbox.move("first")
      announce(matches(listbox.count()))
    }
    return {
      listbox,
      ranked,
      open,
      search,
      clear: () => search(""),
      keydown: (event: KeyboardEvent) => {
        const { highlighted, query } = context.store.get()
        if (event.key === "Enter" && highlighted) {
          event.preventDefault()
          open(highlighted, event)
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
      // A custom element list is static markup, so the list puts the files in the order of their score.
      bind: (el, { api, store }) => {
        const place = () => {
          const items = [...el.children] as HTMLElement[]
          const byPath = new Map(items.map((item) => [item.getAttribute("value"), item]))
          const first = api.ranked().flatMap((path) => byPath.get(path) ?? [])
          const sorted = [...first, ...items.filter((item) => !first.includes(item))]
          if (sorted.every((item, i) => item === items[i])) return
          for (const item of sorted) el.append(item)
        }
        place()
        return store.subscribe(place)
      },
    }),
    file: slot<{ value: string; label: string }>({
      role: "option",
      focus: "active-descendant",
      props: { value: "string", label: "string" },
      selects: selects({ highlighted: ({ key }) => [key, null] }),
      present: (_state, part) => part.api.ranked().includes(part.key),
      attrs: (state, part) => ({
        ...part.api.listbox.attrs(state, part),
        "aria-selected": String(state.value === part.key),
        "data-selected": state.value === part.key ? "" : undefined,
      }),
      press: ({ api, key }, event) => void api.open(key, event),
      on: {
        // A press on a file keeps focus in the search input.
        pointerdown: (event) => event.preventDefault(),
        pointermove: (event, { api, key }) => api.listbox.highlight(key, { event }),
      },
      bind: (el, part) => {
        const path = part.props.label
        const write = () => {
          const { query, files } = part.store.get()
          const name = document.createElement("span")
          name.dataset.path = ""
          for (const piece of matchSegments(path, matchRanges(path, query, "fuzzy"))) {
            if (piece.match) name.append(Object.assign(document.createElement("mark"), { textContent: piece.text }))
            else name.append(piece.text)
          }
          const size = document.createElement("span")
          size.dataset.size = ""
          size.textContent = kb(files.find((file) => file.path === path)?.size ?? 0)
          el.replaceChildren(name, size)
        }
        write()
        const stop = part.api.listbox.bind(el, part)
        const unsubscribe = part.store.subscribe(write)
        return () => {
          stop?.()
          unsubscribe()
        }
      },
    }),
    empty: slot({
      present: (_state, part) => part.api.listbox.count() === 0,
    }),
  }),
  agent: { actions: ["search", "open", "clear"], items: (api) => api.ranked().map((path) => ({ value: path, label: path })) },
})

type Node = { name: string; size?: number; children?: Node[] }

const GREEN = "76, 255, 122"
const folderOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "(root)")

// A cell is lit by its score: the better the match, the brighter. With no query every cell is lit.
function paint(canvas: HTMLCanvasElement, state: State) {
  const { files, query, highlighted } = state
  const lit = files.map((file) => fuzzyScore(file.path, query))
  const count = lit.filter((score) => score > 0).length
  canvas.setAttribute(
    "aria-label",
    query
      ? `Treemap of ${files.length} files by size. ${count} ${count === 1 ? "file matches" : "files match"} ${query}.`
      : `Treemap of ${files.length} files by size.`,
  )
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const width = canvas.clientWidth || 420
  const height = canvas.clientHeight || 360
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.fillStyle = "#020c05"
  ctx.fillRect(0, 0, width, height)

  const groups = new Map<string, Node[]>()
  for (const file of files) {
    const folder = folderOf(file.path)
    groups.set(folder, [...(groups.get(folder) ?? []), { name: file.path, size: file.size }])
  }
  const root = hierarchy<Node>({
    name: "repository",
    children: [...groups].map(([name, children]) => ({ name, children })),
  })
    .sum((node) => node.size ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  treemap<Node>().size([width, height]).paddingInner(2).paddingOuter(3).tile(treemapSquarify)(root)

  ctx.font = "11px ui-monospace, Consolas, monospace"
  ctx.textBaseline = "top"
  for (const leaf of root.leaves()) {
    const path = leaf.data.name
    const score = fuzzyScore(path, query)
    const { x0, y0, x1, y1 } = leaf as unknown as { x0: number; y0: number; x1: number; y1: number }
    const w = Math.max(0, x1 - x0)
    const h = Math.max(0, y1 - y0)
    ctx.fillStyle = score > 0 ? `rgba(${GREEN}, ${(query ? 0.35 + score * 0.65 : 0.22).toFixed(2)})` : "#06170c"
    ctx.fillRect(x0, y0, w, h)
    ctx.strokeStyle = score > 0 ? `rgb(${GREEN})` : "#14532d"
    ctx.lineWidth = 1
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(0, w - 1), Math.max(0, h - 1))
    const name = path.slice(path.lastIndexOf("/") + 1)
    if (w > ctx.measureText(name).width + 10 && h > 18) {
      ctx.fillStyle = score > 0 && query ? "#021208" : score > 0 ? "#4cff7a" : "#2fbf5b"
      ctx.fillText(name, x0 + 5, y0 + 5)
    }
    if (path === highlighted) {
      ctx.strokeStyle = "#eaffef"
      ctx.lineWidth = 3
      ctx.strokeRect(x0 + 1.5, y0 + 1.5, Math.max(0, w - 3), Math.max(0, h - 3))
    }
  }
}

// Sizes in KB of a small API service. Written out here, so the picture is the same on each run.
const FILES: FileInfo[] = [
  { path: "src/index.ts", size: 3.1 },
  { path: "src/server.ts", size: 7.4 },
  { path: "src/routes/users.ts", size: 9.8 },
  { path: "src/routes/orders.ts", size: 14.2 },
  { path: "src/routes/health.ts", size: 1.2 },
  { path: "src/db/client.ts", size: 5.6 },
  { path: "src/db/schema.ts", size: 18.7 },
  { path: "src/db/migrate.ts", size: 4.3 },
  { path: "src/auth/session.ts", size: 6.9 },
  { path: "src/auth/tokens.ts", size: 8.1 },
  { path: "src/lib/logger.ts", size: 2.4 },
  { path: "src/lib/retry.ts", size: 1.9 },
  { path: "tests/orders.test.ts", size: 11.5 },
  { path: "tests/users.test.ts", size: 8.8 },
  { path: "package.json", size: 1.7 },
  { path: "README.md", size: 3.6 },
]

createParts(fileFinder, {
  root: {
    tag: "b38-finder",
    display: "block",
    options: () => ({ files: FILES }),
    render: (el, instance) => {
      const canvas = el.querySelector("canvas")
      if (!canvas) return
      const draw = () => paint(canvas, instance.get() as State)
      draw()
      const unsubscribe = instance.subscribe(draw)
      const observer = new ResizeObserver(draw)
      observer.observe(canvas)
      return () => {
        unsubscribe()
        observer.disconnect()
      }
    },
  },
  input: { tag: "b38-finder-input", target: wrappedChild("input"), display: "block" },
  list: { tag: "b38-finder-list", display: "block" },
  file: "b38-file",
  empty: "b38-finder-empty",
})

const html = `
<div data-term>
  <h2>nova-api: find a file</h2>
  <b38-finder aria-label="File finder">
    <div data-panes>
      <div data-left>
        <b38-finder-input><input aria-label="Find a file" placeholder="letters of a path, in order" /></b38-finder-input>
        <b38-finder-list aria-label="Files">
          ${FILES.map((file) => `<b38-file value="${file.path}" label="${file.path}">${file.path}</b38-file>`).join("")}
        </b38-finder-list>
        <b38-finder-empty>No file matches.</b38-finder-empty>
      </div>
      <div data-right>
        <canvas role="img" aria-label="Treemap of ${FILES.length} files by size."></canvas>
        <p data-legend>Cell area is file size. Lit cells match; brighter means a better match.</p>
      </div>
    </div>
  </b38-finder>
  <p role="status" data-status>No file is open.</p>
</div>`

const css = `
[data-stage] { display: grid; justify-items: start; }
[data-stage] [data-term] {
  display: grid; gap: 14px; box-sizing: border-box; width: 100%; max-width: 62rem; padding: 18px;
  border: 1px solid #14532d; border-radius: var(--ui-radius);
  background: #020c05; color: #4cff7a; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 0.875rem;
}
[data-stage] [data-term] h2, [data-stage] [data-term] p { margin: 0; }
[data-stage] [data-term] h2 { font-size: 1.125rem; font-weight: 700; color: #4cff7a; }
[data-stage] b38-finder { display: block; }
[data-stage] [data-panes] { display: grid; grid-template-columns: minmax(0, 24rem) minmax(0, 1fr); gap: 18px; align-items: start; }
[data-stage] [data-left] { display: grid; gap: 10px; }
[data-stage] [data-right] { display: grid; gap: 8px; }
[data-stage] b38-finder-input { display: flex; align-items: center; gap: 8px; }
[data-stage] b38-finder-input::before { content: ">"; font-weight: 700; }
[data-stage] b38-finder-input input {
  box-sizing: border-box; flex: 1; min-width: 0; height: 36px; padding: 0 10px;
  border: 1px solid #14532d; border-radius: 2px; background: #06170c; color: #4cff7a; caret-color: #4cff7a; font: inherit;
}
[data-stage] b38-finder-input input::placeholder { color: #2fbf5b; opacity: 1; }
[data-stage] b38-finder-input input:focus-visible { outline: 2px solid #4cff7a; outline-offset: 2px; }
[data-stage] b38-finder-list { display: grid; padding: 4px; border: 1px solid #14532d; border-radius: 2px; }
[data-stage] b38-file { display: flex; justify-content: space-between; gap: 12px; padding: 5px 8px; cursor: pointer; user-select: none; }
[data-stage] b38-file [data-size] { color: #2fbf5b; white-space: nowrap; }
[data-stage] b38-file[data-highlighted] { background: #4cff7a; color: #021208; }
[data-stage] b38-file[data-highlighted] [data-size] { color: #021208; }
[data-stage] b38-file[data-selected] [data-path] { font-weight: 700; text-decoration: underline; }
[data-stage] b38-file mark { background: #f5c518; color: #021208; padding: 0 1px; }
[data-stage] b38-finder-empty { padding: 5px 8px; color: #2fbf5b; }
[data-stage] [data-right] canvas {
  display: block; box-sizing: border-box; width: 100%; height: 22rem; border: 1px solid #14532d; border-radius: 2px;
}
[data-stage] [data-legend] { color: #2fbf5b; max-width: 60ch; }
[data-stage] [data-status] { color: #4cff7a; }
@media (max-width: 42rem) {
  [data-stage] [data-panes] { grid-template-columns: minmax(0, 1fr); }
  [data-stage] [data-right] canvas { height: 16rem; }
}
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  root.querySelector("b38-finder")!.addEventListener("valuechange", (event) => {
    const { value } = (event as CustomEvent<{ value: string | null }>).detail
    status.textContent = value ? `Opened: ${value}.` : "No file is open."
  })
}

const ui: UI = {
  id: "B38",
  request:
    "Build a file finder for a code repository: a search box that ranks the files by how well the letters of a path match, in order, marks the matched letters, and shows the file sizes as a treemap that lights the matches.",
  css,
  mount,
  task: {
    steps: [
      { ref: "File finder", action: "search", args: ["ordts"] },
      { ref: "File finder", action: "open", args: ["tests/orders.test.ts"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Opened: tests/orders.test.ts.",
  },
  breaks: [
    {
      broke: "Enter no longer opens the highlighted file.",
      find: "open(highlighted, event)",
      replace: "void 0",
      caught: "keyboard: Enter opens the highlighted file, and Enter with no highlight opens nothing",
    },
    {
      broke: "Escape claims the key when there is no text to clear.",
      find: 'else if (event.key === "Escape" && query) {',
      replace: 'else if (event.key === "Escape") {',
      caught: "keyboard: Escape clears the search text, and with no text it leaves the key alone",
    },
    {
      broke: "The files are not sorted by score.",
      find: ".sort((a, b) => b.score - a.score || a.index - b.index)",
      replace: ".sort((a, b) => a.index - b.index)",
      caught: "keyboard: the best match comes first, and equal scores keep the order of the repository",
    },
    {
      broke: "Letters must sit next to each other to match.",
      find: "score: fuzzyScore(file.path, query) }))",
      replace: "score: file.path.toLowerCase().includes(query.toLowerCase()) ? 1 : 0 }))",
      caught: "keyboard: letters in order find a file, with other letters between them",
    },
    {
      broke: "The matched letters are not marked.",
      find: "if (piece.match) name.append(",
      replace: "if (false) name.append(",
      caught: "keyboard: each matched letter is inside a mark, and the text keeps its case",
    },
    {
      broke: "The search box no longer points at the highlighted file.",
      find: '"aria-activedescendant": api.listbox.activeId(state),',
      replace: "",
      caught: "keyboard: ArrowDown and ArrowUp move the highlight, and aria-activedescendant follows it",
    },
    {
      broke: "A press on a file moves focus out of the search box.",
      find: "pointerdown: (event) => event.preventDefault(),",
      replace: "pointerdown: () => {},",
      caught: "keyboard: a click opens a file, and a press on a file keeps focus in the search box",
    },
    {
      broke: "An agent can open a file that is not in the repository.",
      find: "if (!known(path)) return false",
      replace: "",
      caught: "agent: search and open run through the api, and a path that is not in the repository is refused",
    },
    {
      broke: "The search box does not follow a search that an agent makes.",
      find: "if ((el as HTMLInputElement).value !== query) (el as HTMLInputElement).value = query",
      replace: "",
      caught: "agent: search and open run through the api, and a path that is not in the repository is refused",
    },
    {
      broke: "The treemap lights every cell, whether it matches or not.",
      find: "ctx.fillStyle = score > 0 ? `rgba(",
      replace: "ctx.fillStyle = true ? `rgba(",
      caught: "names: the treemap lights the files that match a search and dims the others",
    },
    {
      broke: "The treemap draws every cell border as a match.",
      find: "ctx.strokeStyle = score > 0 ? `rgb(",
      replace: "ctx.strokeStyle = true ? `rgb(",
      caught: "names: the treemap lights the files that match a search and dims the others",
    },
    {
      broke: "The treemap does not say how many files match.",
      find: "? `Treemap of ${files.length} files by size. ${count} ${count === 1 ? \"file matches\" : \"files match\"} ${query}.`",
      replace: "? `Treemap of ${files.length} files by size.`",
      caught: "names: the treemap says how many files match a search",
    },
  ],
}

export { fileFinder, FILES }
export default ui
