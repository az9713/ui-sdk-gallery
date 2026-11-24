import {
  byCell,
  byCellRange,
  type CellRange,
  cellsToText,
  type ChangeDetails,
  createCellRange,
  createChange,
  createGridFocus,
  createInlineEdit,
  definePrimitive,
  type GridCell,
  selects,
  textToCells,
} from "@ui-sdk/core"
import { createParts, wrappedChild } from "@ui-sdk/web"
import type { UI } from "../src/ui"

type Reason = "input-commit" | "paste" | "imperative"
type Options = {
  value?: string[][]
  defaultValue?: string[][]
  onValueChange?: (value: string[][], details: ChangeDetails<Reason>) => void
}
type State = { value: string[][]; active: GridCell | null; range: CellRange | null; editing: string | null }

const letter = (col: number) => String.fromCharCode(65 + col)
const address = ({ row, col }: GridCell) => `${letter(col)}${row + 1}`
// The editor is the only input in a cell. Its keys, presses and clipboard events bubble to the cell and the grid, which leave them to it.
const fromEditor = (event: Event) => event.target instanceof HTMLInputElement

const spreadsheet = definePrimitive({
  name: "spreadsheet",
  options: { value: "value", defaultValue: "value", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    value: options.value ?? options.defaultValue ?? [],
    active: null,
    range: null,
    editing: null,
  }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const rows = () => store.get().value.length
    const cols = () => store.get().value[0]?.length ?? 0
    const cellOf = (ref: string): GridCell => {
      const match = /^([A-Z])(\d+)$/i.exec(String(ref).trim())
      const cell = match ? { row: Number(match[2]) - 1, col: match[1].toUpperCase().charCodeAt(0) - 65 } : null
      if (!cell || cell.row < 0 || cell.row >= rows() || cell.col >= cols())
        throw new Error(`No cell "${ref}". The cells are A1 to ${address({ row: rows() - 1, col: cols() - 1 })}.`)
      return cell
    }
    // Writes a block of text from a cell to the right and down, and drops what falls past the grid's edges.
    const write = (at: GridCell, block: string[][], details: { reason: Reason; event?: Event }) => {
      const next = store.get().value.map((texts) => [...texts])
      block.slice(0, rows() - at.row).forEach((texts, r) =>
        texts.slice(0, cols() - at.col).forEach((text, c) => (next[at.row + r][at.col + c] = text)),
      )
      return change("value", next, details)
    }
    const grid = createGridFocus(context, { key: "active", rows, cols })
    const range = createCellRange(context, { key: "range", grid, rows, cols })
    const edit = createInlineEdit(context, {
      key: "editing",
      value: (id) => {
        const { row, col } = cellOf(id)
        return store.get().value[row][col]
      },
      commit: (id, text, { event }) => write(cellOf(id), [[text]], { reason: "input-commit", event }),
    })
    return {
      grid,
      range,
      edit,
      setCell: (ref: string, text: string) => write(cellOf(ref), [[String(text)]], { reason: "imperative" }),
      paste: (ref: string, text: string) => write(cellOf(ref), textToCells(String(text)), { reason: "imperative" }),
      readSheet: () => cellsToText(store.get().value),
      cellKeydown: (event: KeyboardEvent, key: string) => {
        if (fromEditor(event)) return
        if (!range.keydown(event)) edit.keydown(event, key)
      },
      // Enter and Escape go back to the cell, Tab to the next cell. The web renderer hides the editor and
      // keeps it in the page, so the helper does not see focus leave it: focus moves here.
      editorKeydown: (event: KeyboardEvent) => {
        const editing = store.get().editing
        if (!editing || !edit.inputKeydown(event)) return
        const { row, col } = cellOf(editing)
        const step = event.key === "Tab" ? (event.shiftKey ? -1 : 1) : 0
        if (step) event.preventDefault()
        grid.focus({ row, col: Math.min(Math.max(col + step, 0), cols() - 1) }, { reason: "list-navigation", event })
      },
      copyRange: (event: ClipboardEvent) => {
        const state = store.get()
        if (fromEditor(event) || !range.bounds(state)) return
        event.preventDefault()
        event.clipboardData?.setData("text/plain", range.text(state, ({ row, col }) => state.value[row][col]))
      },
      pasteRange: (event: ClipboardEvent) => {
        const bounds = range.bounds(store.get())
        if (fromEditor(event) || !bounds) return
        event.preventDefault()
        const block = textToCells(event.clipboardData?.getData("text/plain") ?? "")
        write({ row: bounds.top, col: bounds.left }, block, { reason: "paste", event })
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "grid",
      keys: { none: "Each cell handles the keys." },
      attrs: () => ({ "aria-multiselectable": "true" }),
      on: {
        copy: (event, { api }) => api.copyRange(event),
        paste: (event, { api }) => api.pasteRange(event),
      },
    }),
    row: slot<{ value: string }>({ role: "row", props: { value: "string" } }),
    colheader: slot<{ value: string }>({ role: "columnheader", props: { value: "string" } }),
    rowheader: slot<{ value: string }>({ role: "rowheader", props: { value: "string" } }),
    // Each cell has a value, like "B3": it is the key that tells the cells apart.
    cell: slot<GridCell & { value: string }>({
      role: "gridcell",
      focus: "roving",
      props: { value: "string", row: "number", col: "number" },
      keys: [
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "mod+Home", "mod+End", "PageUp", "PageDown",
        "shift+ArrowUp", "shift+ArrowDown", "shift+ArrowLeft", "shift+ArrowRight", "shift+Home", "shift+End",
        "shift+ ", "mod+ ", "mod+a", "Escape", "Enter", "F2",
      ],
      selects: selects({ active: byCell, range: byCellRange }),
      attrs: (state, { props, api }) => ({
        tabindex: api.grid.tabIndex(state, props),
        ...api.range.cellAttrs(state, props),
      }),
      on: {
        keydown: (event, { api, key }) => api.cellKeydown(event, key),
        pointerdown: (event, { api, props }) => void (fromEditor(event) || api.range.pointerdown(event, props)),
        dblclick: (event, { api, key }) => void (fromEditor(event) || api.edit.dblclick(event, key)),
        // Focus that comes another way, like from a screen reader, makes the cell active, so the keys start from it.
        focusin: (event, { api, props, store }) => {
          if (!fromEditor(event) && !api.grid.isActive(store.get(), props)) api.grid.focus(props, { reason: "imperative", event })
        },
      },
      // The web renderer keeps the written markup, so the cell writes its text from the state.
      bind: (el, part) => {
        const span = el.querySelector("span")
        const show = () => {
          const text = part.store.get().value[part.props.row]?.[part.props.col] ?? ""
          if (span && span.textContent !== text) span.textContent = text
        }
        show()
        const cleanups = [part.api.range.bind(el, part.props), part.store.subscribe(show)]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
    editor: slot<{ value: string }>({
      props: { value: "string" },
      present: (state, { key, api }) => api.edit.editing(state) === key,
      // A string type makes mount render an <input>. A web part already holds one.
      attrs: (_state, { key }) => ({ type: "text", "aria-label": `Edit ${key}` }),
      on: {
        keydown: (event, { api }) => api.editorKeydown(event),
        focusout: (event, { api }) => void api.edit.end("focus-out", event),
      },
      bind: (el, { api }) => api.edit.bindInput(el as HTMLInputElement),
    }),
  }),
  agent: { actions: ["setCell", "paste", "readSheet"] },
})

// The written cells are the default value: each cell's text, by its row and col.
const cellsIn = (el: HTMLElement) => {
  const value: string[][] = []
  for (const cell of el.querySelectorAll("b04-sheet-cell"))
    (value[Number(cell.getAttribute("row"))] ??= [])[Number(cell.getAttribute("col"))] = cell.querySelector("span")?.textContent ?? ""
  return value
}

createParts(spreadsheet, {
  root: { tag: "b04-sheet", display: "block", options: (el) => ({ defaultValue: cellsIn(el) }) },
  row: "b04-sheet-row",
  colheader: "b04-sheet-colheader",
  rowheader: "b04-sheet-rowheader",
  cell: "b04-sheet-cell",
  editor: { tag: "b04-sheet-editor", target: wrappedChild("input") },
})

const START = [
  ["Item", "Jan", "Feb", "Mar"],
  ["Rent", "1200", "1200", "1200"],
  ["Software", "340", "340", "410"],
  ["Travel", "0", "850", "0"],
  ["Training", "", "", ""],
]

const html = `
<h2>Q1 team budget</h2>
<p id="b04-help">Arrow keys move between cells, and Shift with an arrow key selects a block. Enter, F2 or a typed character edits a cell: Enter saves, Escape cancels, Tab saves and moves right. Control+C copies the block. Control+V pastes from its top left cell.</p>
<b04-sheet aria-label="Q1 budget" aria-describedby="b04-help">
  <b04-sheet-row value="head"><b04-sheet-colheader value="corner"></b04-sheet-colheader>${START[0]
    .map((_, col) => `<b04-sheet-colheader value="${letter(col)}">${letter(col)}</b04-sheet-colheader>`)
    .join("")}</b04-sheet-row>
  ${START.map(
    (texts, row) =>
      `<b04-sheet-row value="${row + 1}"><b04-sheet-rowheader value="${row + 1}">${row + 1}</b04-sheet-rowheader>${texts
        .map((text, col) => {
          const at = address({ row, col })
          return `<b04-sheet-cell value="${at}" row="${row}" col="${col}"><span>${text}</span><b04-sheet-editor value="${at}"><input /></b04-sheet-editor></b04-sheet-cell>`
        })
        .join("")}</b04-sheet-row>`,
  ).join("")}
</b04-sheet>
<p role="status" data-status>No cell has changed.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] #b04-help, [data-stage] [data-status] { max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
[data-stage] b04-sheet {
  border-top: 1px solid var(--ui-border); border-left: 1px solid var(--ui-border);
  font-size: 0.875rem; font-variant-numeric: tabular-nums; user-select: none;
}
[data-stage] b04-sheet-row { display: grid; grid-template-columns: 40px repeat(4, 112px); }
[data-stage] b04-sheet-colheader, [data-stage] b04-sheet-rowheader, [data-stage] b04-sheet-cell {
  position: relative; display: flex; align-items: center; min-width: 0; height: 36px;
  border-right: 1px solid var(--ui-border); border-bottom: 1px solid var(--ui-border);
}
[data-stage] b04-sheet-colheader, [data-stage] b04-sheet-rowheader {
  justify-content: center; background: var(--ui-muted); color: var(--ui-muted-foreground); font-size: 0.75rem; font-weight: 600;
}
[data-stage] b04-sheet-colheader { height: 28px; }
[data-stage] b04-sheet-cell {
  padding: 0 10px; cursor: cell;
  box-shadow: var(--b04-top, 0 0 transparent), var(--b04-bottom, 0 0 transparent), var(--b04-left, 0 0 transparent), var(--b04-right, 0 0 transparent);
}
[data-stage] b04-sheet-cell span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
[data-stage] b04-sheet-cell[data-selected] { background: var(--ui-muted); }
[data-stage] b04-sheet-cell[data-range-edge~="top"] { --b04-top: inset 0 2px var(--ui-primary); }
[data-stage] b04-sheet-cell[data-range-edge~="bottom"] { --b04-bottom: inset 0 -2px var(--ui-primary); }
[data-stage] b04-sheet-cell[data-range-edge~="left"] { --b04-left: inset 2px 0 var(--ui-primary); }
[data-stage] b04-sheet-cell[data-range-edge~="right"] { --b04-right: inset -2px 0 var(--ui-primary); }
[data-stage] b04-sheet-cell:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: -2px; }
[data-stage] b04-sheet-editor input {
  position: absolute; inset: 0; width: 100%; height: 100%; padding: 0 8px;
  border: 2px solid var(--ui-ring); border-radius: 0; outline: none;
  background: var(--ui-background); color: var(--ui-foreground); font: inherit;
}
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  let cells = START
  root.querySelector("b04-sheet")!.addEventListener("valuechange", (event) => {
    const next = (event as CustomEvent<{ value: string[][] }>).detail.value
    const changed = next.flatMap((texts, row) => texts.flatMap((text, col) => (text === cells[row]?.[col] ? [] : [{ row, col }])))
    cells = next
    const [one] = changed
    status.textContent =
      changed.length === 0
        ? "No cell has changed."
        : changed.length === 1
          ? `${address(one)} is now ${next[one.row][one.col] || "empty"}.`
          : `Changed ${changed.length} cells: ${changed.map(address).join(", ")}.`
  })
  // The grid's own copy handler runs first, so the clipboard already holds the block here.
  root.addEventListener("copy", (event) => {
    const text = (event as ClipboardEvent).clipboardData?.getData("text/plain")
    if (!event.defaultPrevented || !text) return
    const count = textToCells(text).flat().length
    status.textContent = `Copied ${count} ${count === 1 ? "cell" : "cells"}.`
  })
}

const ui: UI = {
  id: "B04",
  request:
    "Build a spreadsheet: a block of cells where the arrow keys move, Shift with an arrow key selects a block, Enter or typing edits a cell in place, and Control+C and Control+V copy and paste a block as tab-separated text.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Q1 budget", action: "setCell", args: ["B3", "360"] },
      { ref: "Q1 budget", action: "paste", args: ["B5", "150\t150\t200"] },
    ],
    done: (root) =>
      root.querySelector('b04-sheet-cell[value="B3"] span')!.textContent === "360" &&
      root.querySelector("[data-status]")!.textContent === "Changed 3 cells: B5, C5, D5.",
  },
  breaks: [
    {
      broke: "Every cell is a tab stop.",
      find: "tabindex: api.grid.tabIndex(state, props),",
      replace: 'tabindex: "0",',
      caught: "keyboard: the grid is 1 tab stop, and the arrow keys, Home and End move the active cell",
    },
    {
      broke: "Shift with an arrow key no longer selects a block.",
      find: "if (!range.keydown(event)) edit.keydown(event, key)",
      replace: "if (!grid.keydown(event)) edit.keydown(event, key)",
      caught: "keyboard: Shift with an arrow key selects a block, and a move without Shift drops it",
    },
    {
      broke: "The selected block is not marked.",
      find: "...api.range.cellAttrs(state, props),",
      replace: "",
      caught: "keyboard: Shift with an arrow key selects a block, and a move without Shift drops it",
    },
    {
      broke: "A drag across cells no longer selects a block.",
      find: "api.range.pointerdown(event, props)",
      replace: 'api.grid.focus(props, { reason: "item-press", event })',
      caught: "pointer: a drag across cells selects the block",
    },
    {
      broke: "A cell that gets focus from a screen reader or a script does not become the active cell.",
      find: 'api.grid.focus(props, { reason: "imperative", event })',
      replace: "void 0",
      caught: "keyboard: a cell that gets focus another way, like from a screen reader, is where the keys start",
    },
    {
      broke: "Enter, F2 and a typed character no longer start an edit.",
      find: "edit.keydown(event, key)",
      replace: "false",
      caught: "keyboard: F2, a typed character and a double-click start an edit, and Escape cancels it",
    },
    {
      broke: "The arrow keys in the editor move the active cell.",
      find: "if (fromEditor(event)) return",
      replace: "",
      caught: "keyboard: in the editor the arrow keys move the caret and leave the active cell alone",
    },
    {
      broke: "Tab in the editor no longer moves to the next cell.",
      find: 'event.key === "Tab" ? (event.shiftKey ? -1 : 1) : 0',
      replace: "0",
      caught: "keyboard: Tab in the editor saves and moves to the next cell, and Shift+Tab saves and moves back",
    },
    {
      broke: "After Enter, focus stays in the hidden editor on the page.",
      find: 'grid.focus({ row, col: Math.min(Math.max(col + step, 0), cols() - 1) }, { reason: "list-navigation", event })',
      replace: "void step",
      caught: "keyboard: on the page, Enter edits a cell, the cell shows the new text and the status line reports it",
    },
    {
      broke: "The cell does not show its new text on the page.",
      find: "span.textContent = text",
      replace: "void text",
      caught: "keyboard: on the page, Enter edits a cell, the cell shows the new text and the status line reports it",
    },
    {
      broke: "Copy no longer puts the block on the clipboard.",
      find: 'event.clipboardData?.setData("text/plain", range.text(state, ({ row, col }) => state.value[row][col]))',
      replace: "void state",
      caught: "keyboard: Control+C copies the selected block as tab-separated text",
    },
    {
      broke: "Paste starts at the first cell, not at the top left cell of the block.",
      find: "write({ row: bounds.top, col: bounds.left }",
      replace: "write({ row: 0, col: 0 }",
      caught: "keyboard: Control+V pastes from the top left cell of the block and drops what falls past the edges",
    },
    {
      broke: "Paste writes past the right edge of the grid.",
      find: "texts.slice(0, cols() - at.col)",
      replace: "texts",
      caught: "keyboard: Control+V pastes from the top left cell of the block and drops what falls past the edges",
    },
    {
      broke: "An agent can name a cell past the edge of the grid.",
      find: "cell.row >= rows() || cell.col >= cols()",
      replace: "false",
      caught: "agent: setCell, paste and readSheet go through the api, and a cell that does not exist is refused",
    },
    {
      broke: "An agent can no longer edit the sheet.",
      find: 'agent: { actions: ["setCell", "paste", "readSheet"] },',
      replace: 'agent: { actions: ["readSheet"] },',
      caught: "agent: an agent reads the sheet, sets a cell and pastes a row, and a cell that does not exist is refused",
    },
  ],
}

export { spreadsheet }
export default ui
