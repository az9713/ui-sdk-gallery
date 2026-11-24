import "@ui-sdk/web/resizable"
import "@ui-sdk/web/scroll-area"
import "@ui-sdk/web/tree"
import type { UI } from "../src/ui"

const files: Record<string, string> = {
  "src/index.ts": "1.2 KB",
  "src/app.tsx": "3.4 KB",
  "src/lib/format.ts": "0.8 KB",
  "src/lib/parse.ts": "2.1 KB",
  "src/lib/dates.ts": "1.6 KB",
  "src/routes/home.tsx": "2.7 KB",
  "src/routes/about.tsx": "1.1 KB",
  "src/routes/billing.tsx": "4.0 KB",
  "src/styles/theme.css": "5.3 KB",
  "src/styles/reset.css": "0.4 KB",
  "docs/overview.md": "6.2 KB",
  "docs/changelog.md": "9.8 KB",
  "tests/format.test.ts": "1.3 KB",
  "tests/parse.test.ts": "1.9 KB",
  "package.json": "1.0 KB",
  "tsconfig.json": "0.5 KB",
  "README.md": "2.2 KB",
}

type Node = { value: string; label: string; children?: Node[] }

function build(paths: string[], prefix = ""): Node[] {
  const folders = new Map<string, string[]>()
  const leaves: Node[] = []
  for (const path of paths) {
    const [head, ...rest] = path.split("/")
    if (rest.length) folders.set(head, [...(folders.get(head) ?? []), rest.join("/")])
    else leaves.push({ value: prefix + head, label: head })
  }
  const branches = [...folders].map(([name, inner]) => ({ value: prefix + name, label: name, children: build(inner, prefix + name + "/") }))
  return [...branches, ...leaves]
}

function markup(items: Node[]): string {
  return items
    .map(
      (item) => `
      <ui-tree-item value="${item.value}">
        <ui-tree-item-label>
          ${item.children ? "<ui-tree-item-indicator></ui-tree-item-indicator>" : ""}
          <span>${item.label}</span>
        </ui-tree-item-label>
        ${item.children ? `<ui-tree-group>${markup(item.children)}</ui-tree-group>` : ""}
      </ui-tree-item>`,
    )
    .join("")
}

const html = `
<ui-resizable data-pane>
  <ui-resizable-panel id="a12-list" default-size="40" min-size="25" max-size="70">
    <ui-scroll-area type="auto">
      <ui-scroll-area-viewport role="region" aria-label="Scrollable file view">
        <ui-scroll-area-content>
          <ui-tree aria-label="Project files" activation="automatic">${markup(build(Object.keys(files)))}</ui-tree>
        </ui-scroll-area-content>
      </ui-scroll-area-viewport>
      <ui-scroll-area-scrollbar orientation="vertical">
        <ui-scroll-area-thumb></ui-scroll-area-thumb>
      </ui-scroll-area-scrollbar>
    </ui-scroll-area>
  </ui-resizable-panel>
  <ui-resizable-handle aria-label="Resize file list"></ui-resizable-handle>
  <ui-resizable-panel id="a12-preview" min-size="30">
    <h2 data-name>No file open</h2>
    <p data-size>Choose a file in the list.</p>
    <p data-width></p>
  </ui-resizable-panel>
</ui-resizable>
<p role="status" data-status>No file is open.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 640px; }
[data-stage] [data-pane] { height: 240px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); overflow: hidden; }
[data-stage] ui-resizable-panel { padding: 0; min-width: 0; }
[data-stage] ui-resizable-panel[id="a12-preview"] { padding: calc(var(--ui-spacing) * 4); display: grid; align-content: start; gap: 8px; }
[data-stage] ui-resizable-handle { width: 4px; background: var(--ui-border); }
[data-stage] ui-resizable-handle:hover, [data-stage] ui-resizable-handle[data-dragging], [data-stage] ui-resizable-handle:focus-visible { background: var(--ui-ring); }
[data-stage] ui-scroll-area { display: block; height: 100%; position: relative; }
[data-stage] ui-scroll-area-viewport { height: 100%; width: 100%; }
[data-stage] ui-scroll-area-content { padding: 8px; }
[data-stage] ui-scroll-area-scrollbar[data-visible] { width: 8px; }
[data-stage] ui-scroll-area-thumb { background: var(--ui-input); border-radius: 4px; }
[data-stage] ui-tree-group { padding-left: 16px; }
[data-stage] ui-tree-item-label { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: var(--ui-radius); }
[data-stage] ui-tree-item-label[data-selected] { background: var(--ui-primary); color: var(--ui-primary-foreground); }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; overflow-wrap: anywhere; }
[data-stage] [data-size], [data-stage] [data-width], [data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const tree = root.querySelector("ui-tree")!
  tree.items = build(Object.keys(files))
  const status = root.querySelector("[data-status]")!
  tree.addEventListener("valuechange", (e) => {
    const path = (e as CustomEvent).detail.value as string | null
    if (!path || !(path in files)) return
    root.querySelector("[data-name]")!.textContent = path
    root.querySelector("[data-size]")!.textContent = `Size ${files[path]}`
    status.textContent = `Opened: ${path}`
    tree.api.reveal(path)
  })
  const group = root.querySelector("ui-resizable")!
  const width = root.querySelector("[data-width]")!
  group.addEventListener("layoutchange", (e) => {
    width.textContent = `File list is ${Math.round((e as CustomEvent).detail.value[0])}% wide.`
  })
}

const ui: UI = {
  id: "A12",
  request: "Build a file explorer: a folder tree in a scrollable pane that I can resize, and a preview that shows the file I open.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Resize file list", action: "setLayout", args: [[30, 70]] },
      { ref: "Project files", action: "setValue", args: ["src/lib/parse.ts"] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Opened: src/lib/parse.ts" &&
      root.querySelector("[data-width]")!.textContent === "File list is 30% wide.",
  },
}

export default ui
