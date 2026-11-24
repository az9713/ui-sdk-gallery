import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui, { spreadsheet } from "./B04-spreadsheet"

// jsdom has no ClipboardEvent, and the strict checks want one for the "paste" reason.
class ClipboardEvent extends Event {
  clipboardData: { setData: (type: string, text: string) => void; getData: (type: string) => string }
  constructor(type: "copy" | "paste", text = "") {
    super(type, { bubbles: true, cancelable: true })
    const data: Record<string, string> = text ? { "text/plain": text } : {}
    this.clipboardData = { setData: (kind, value) => void (data[kind] = value), getData: (kind) => data[kind] ?? "" }
  }
}
globalThis.ClipboardEvent ??= ClipboardEvent as unknown as typeof globalThis.ClipboardEvent

// 3 rows of 3 cells, A1 to C3.
const VALUE = [
  ["a", "b", "c"],
  ["1", "2", "3"],
  ["x", "y", "z"],
]
const id = (row: number, col: number) => `${String.fromCharCode(65 + col)}${row + 1}`
const cellMarkup = (row: number, col: number) =>
  `<cell value="${id(row, col)}" row="${row}" col="${col}"><span>${VALUE[row][col]}</span><editor value="${id(row, col)}"></editor></cell>`
const markup = `<root aria-label="Sheet"><row value="head"><colheader value="corner"></colheader>${["A", "B", "C"]
  .map((name) => `<colheader value="${name}">${name}</colheader>`)
  .join("")}</row>${[0, 1, 2]
  .map((row) => `<row value="${row + 1}"><rowheader value="${row + 1}">${row + 1}</rowheader>${[0, 1, 2].map((col) => cellMarkup(row, col)).join("")}</row>`)
  .join("")}</root>`
const options = { defaultValue: VALUE }

type View = ReturnType<typeof mount<typeof spreadsheet>>
const open = () => mount(spreadsheet, options, markup)
const at = (view: View, ref: string) => view.part("cell", ref)!
const editor = (view: View, ref: string) => view.part("editor", ref) as HTMLInputElement
// In mount, an editor that is not present is a detached node.
const shows = (el: HTMLElement | undefined) => !!el && el.isConnected && !el.hidden
const selected = (view: View) =>
  [...view.root.querySelectorAll<HTMLElement>("[data-slot=spreadsheet-cell]")]
    .filter((el) => el.getAttribute("aria-selected") === "true")
    .map((el) => el.querySelector("span")!.textContent)

test("keyboard: the grid is 1 tab stop, and the arrow keys, Home and End move the active cell", async () => {
  const view = open()
  try {
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await view.keys("Tab")
    expect(document.activeElement).toBe(at(view, "A1"))
    await view.keys("ArrowRight", "ArrowDown")
    expect(document.activeElement).toBe(at(view, "B2"))
    await view.keys("End")
    expect(document.activeElement).toBe(at(view, "C2"))
    await view.keys("Home")
    expect(document.activeElement).toBe(at(view, "A2"))
    await view.keys("Control+End")
    expect(document.activeElement).toBe(at(view, "C3"))
    await view.keys("ArrowUp", "ArrowLeft")
    expect(document.activeElement).toBe(at(view, "B2"))
    await view.keys("Control+Home", "ArrowUp", "ArrowLeft")
    expect(document.activeElement).toBe(at(view, "A1"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: a cell that gets focus another way, like from a screen reader, is where the keys start", async () => {
  const view = open()
  try {
    at(view, "B2").focus()
    await view.settle()
    await view.keys("Shift+ArrowRight")
    expect(view.api.range.bounds(view.state)).toEqual({ top: 1, left: 1, bottom: 1, right: 2 })
    expect(document.activeElement).toBe(at(view, "B2"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(at(view, "B2").getAttribute("tabindex")).toBe("0")
  } finally {
    view.unmount()
  }
})

test("keyboard: Tab leaves the grid when no cell is edited", async () => {
  const view = open()
  try {
    await view.keys("Tab")
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    at(view, "A1").dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: Shift with an arrow key selects a block, and a move without Shift drops it", async () => {
  const view = open()
  try {
    await view.keys("Tab", "Shift+ArrowRight", "Shift+ArrowDown")
    expect(view.state.range).toEqual({ anchor: { row: 0, col: 0 }, end: { row: 1, col: 1 } })
    expect(document.activeElement).toBe(at(view, "A1"))
    expect(selected(view)).toEqual(["a", "b", "1", "2"])
    expect(at(view, "A1").hasAttribute("data-selected")).toBe(true)
    expect(at(view, "A1").getAttribute("data-range-edge")).toBe("top left")
    expect(at(view, "B2").getAttribute("data-range-edge")).toBe("right bottom")
    expect(at(view, "C1").getAttribute("aria-selected")).toBe("false")
    expect(at(view, "C1").hasAttribute("data-selected")).toBe(false)
    expect(at(view, "C1").hasAttribute("data-range-edge")).toBe(false)
    await view.keys("ArrowRight")
    expect(view.state.range).toBe(null)
    expect(selected(view)).toEqual([])
    expect(document.activeElement).toBe(at(view, "B1"))
  } finally {
    view.unmount()
  }
})

test("keyboard: Shift+Space, Control+Space and Control+A select rows, columns and every cell, and Escape drops the block", async () => {
  const view = open()
  try {
    const bounds = () => view.api.range.bounds(view.state)
    await view.keys("Tab", "ArrowDown", "Shift+Space")
    expect(bounds()).toEqual({ top: 1, left: 0, bottom: 1, right: 2 })
    await view.keys("Escape")
    expect(view.state.range).toBe(null)
    await view.keys("Control+Space")
    expect(bounds()).toEqual({ top: 0, left: 0, bottom: 2, right: 0 })
    await view.keys("Control+a")
    expect(selected(view)).toEqual(VALUE.flat())
    expect(view.state.editing).toBe(null)
  } finally {
    view.unmount()
  }
})

test("pointer: a drag across cells selects the block", async () => {
  const view = open()
  const cells = [...view.root.querySelectorAll<HTMLElement>("[data-slot=spreadsheet-cell]")]
  // jsdom has no layout: each cell is 100 by 30 pixels, and the range finds the cell under the pointer.
  cells.forEach((el, i) => {
    const left = 200 + (i % 3) * 100
    const top = 200 + Math.floor(i / 3) * 30
    el.getBoundingClientRect = () => ({ x: left, y: top, left, top, right: left + 100, bottom: top + 30, width: 100, height: 30, toJSON: () => ({}) })
  })
  const before = document.elementsFromPoint
  document.elementsFromPoint = (x: number, y: number) =>
    cells.filter((el) => {
      const box = el.getBoundingClientRect()
      return x >= box.left && x < box.right && y >= box.top && y < box.bottom
    })
  try {
    await view.drag(at(view, "A1"), { to: at(view, "B3") })
    expect(view.state.range).toEqual({ anchor: { row: 0, col: 0 }, end: { row: 2, col: 1 } })
    expect(selected(view)).toEqual(["a", "b", "1", "2", "x", "y"])
  } finally {
    document.elementsFromPoint = before
    view.unmount()
  }
})

test("pointer: Shift with a click stretches the block from the active cell", async () => {
  const view = open()
  try {
    await view.click(at(view, "A1"))
    const target = at(view, "C3")
    const init = { bubbles: true, cancelable: true, shiftKey: true, button: 0, pointerId: 1, isPrimary: true, pointerType: "mouse" }
    target.dispatchEvent(new PointerEvent("pointerdown", init))
    target.dispatchEvent(new PointerEvent("pointerup", init))
    // The browser moves focus to the pressed cell after the press.
    target.focus()
    await view.settle()
    expect(view.api.range.bounds(view.state)).toEqual({ top: 0, left: 0, bottom: 2, right: 2 })
    expect(selected(view)).toEqual(VALUE.flat())
  } finally {
    view.unmount()
  }
})

test("keyboard: Enter edits a cell with its text, Enter saves, and focus goes back to the cell", async () => {
  const view = open()
  try {
    await view.keys("Tab", "ArrowRight", "Enter")
    const input = editor(view, "B1")
    expect(view.state.editing).toBe("B1")
    expect(shows(input)).toBe(true)
    expect(shows(editor(view, "A1"))).toBe(false)
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe("b")
    expect(input.getAttribute("aria-label")).toBe("Edit B1")
    await view.type("east")
    await view.keys("Enter")
    expect(view.state.value[0]).toEqual(["a", "east", "c"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "input-commit", source: "keyboard" })
    expect(view.state.editing).toBe(null)
    expect(shows(input)).toBe(false)
    expect(document.activeElement).toBe(at(view, "B1"))
    expect(at(view, "B1").querySelector("span")!.textContent).toBe("east")
  } finally {
    view.unmount()
  }
})

test("keyboard: F2, a typed character and a double-click start an edit, and Escape cancels it", async () => {
  const view = open()
  try {
    await view.keys("Tab", "F2")
    expect(view.state.editing).toBe("A1")
    expect(editor(view, "A1").value).toBe("a")
    await view.keys("Escape")
    expect(view.state.editing).toBe(null)
    expect(document.activeElement).toBe(at(view, "A1"))
    await view.keys("x")
    expect(view.state.editing).toBe("A1")
    expect(editor(view, "A1").value).toBe("x")
    await view.keys("Escape")
    expect(view.state.value[0][0]).toBe("a")
    at(view, "C3").dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }))
    await view.settle()
    expect(view.state.editing).toBe("C3")
    expect(editor(view, "C3").value).toBe("z")
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: Tab in the editor saves and moves to the next cell, and Shift+Tab saves and moves back", async () => {
  const view = open()
  try {
    await view.keys("Tab", "Enter")
    await view.type("one")
    await view.keys("Tab")
    expect(view.state.value[0][0]).toBe("one")
    expect(view.state.editing).toBe(null)
    expect(document.activeElement).toBe(at(view, "B1"))
    await view.keys("Enter")
    await view.type("two")
    await view.keys("Shift+Tab")
    expect(view.state.value[0]).toEqual(["one", "two", "c"])
    expect(document.activeElement).toBe(at(view, "A1"))
  } finally {
    view.unmount()
  }
})

test("keyboard: in the editor the arrow keys move the caret and leave the active cell alone", async () => {
  const view = open()
  try {
    await view.keys("Tab", "Enter", "ArrowRight", "ArrowDown", "Home")
    expect(view.state.editing).toBe("A1")
    expect(document.activeElement).toBe(editor(view, "A1"))
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: Control+C copies the selected block as tab-separated text", async () => {
  const view = open()
  try {
    await view.keys("Tab", "ArrowDown", "Shift+ArrowRight", "Shift+ArrowDown")
    const copy = new ClipboardEvent("copy")
    document.activeElement!.dispatchEvent(copy)
    expect(copy.defaultPrevented).toBe(true)
    expect(copy.clipboardData.getData("text/plain")).toBe("1\t2\nx\ty")
    await view.keys("Escape")
    const one = new ClipboardEvent("copy")
    document.activeElement!.dispatchEvent(one)
    expect(one.clipboardData.getData("text/plain")).toBe("1")
    // A copy in the editor is the browser's own.
    await view.keys("Enter")
    const native = new ClipboardEvent("copy")
    editor(view, "A2").dispatchEvent(native)
    expect(native.defaultPrevented).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: Control+V pastes from the top left cell of the block and drops what falls past the edges", async () => {
  const view = open()
  try {
    await view.keys("Tab", "ArrowDown", "ArrowRight", "Shift+ArrowDown")
    const paste = new ClipboardEvent("paste", "p\tq\tr\ns\tt\tu\nm\tn\to")
    document.activeElement!.dispatchEvent(paste)
    expect(paste.defaultPrevented).toBe(true)
    expect(view.state.value).toEqual([
      ["a", "b", "c"],
      ["1", "p", "q"],
      ["x", "s", "t"],
    ])
    expect(view.changes.length).toBe(1)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "paste" })
    expect(at(view, "C3").querySelector("span")!.textContent).toBe("t")
  } finally {
    view.unmount()
  }
})

test("keyboard: onValueChange can refuse an edit, and the editor stays open", async () => {
  const view = mount(spreadsheet, { ...options, onValueChange: (_value, details) => details.cancel() }, markup)
  try {
    await view.keys("Tab", "Enter")
    await view.type("no")
    await view.keys("Enter")
    expect(view.state.value[0][0]).toBe("a")
    expect(view.state.editing).toBe("A1")
    expect(document.activeElement).toBe(editor(view, "A1"))
  } finally {
    view.unmount()
  }
})

test("agent: setCell, paste and readSheet go through the api, and a cell that does not exist is refused", async () => {
  const view = open()
  try {
    expect(view.api.readSheet()).toBe("a\tb\tc\n1\t2\t3\nx\ty\tz")
    expect(() => view.api.setCell("D1", "no")).toThrow('No cell "D1". The cells are A1 to C3.')
    expect(() => view.api.setCell("A4", "no")).toThrow('No cell "A4". The cells are A1 to C3.')
    expect(() => view.api.paste("B0", "no")).toThrow('No cell "B0"')
    expect(view.changes).toEqual([])
    expect(view.api.setCell("b2", "two")).toBe(true)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "imperative" })
    expect(view.api.paste("C3", "k\tl\nm")).toBe(true)
    expect(view.state.value).toEqual([
      ["a", "b", "c"],
      ["1", "two", "3"],
      ["x", "y", "k"],
    ])
  } finally {
    view.unmount()
  }
})

test("server: the sheet renders with no DOM", () => {
  checkServer(spreadsheet, options, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(spreadsheet, options, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const cell = (ref: string) => page.root.querySelector<HTMLElement>(`b04-sheet-cell[value="${ref}"]`)!
const text = (ref: string) => cell(ref).querySelector("span")!.textContent

test("names: the page names the grid, its headers and its 20 cells", async () => {
  page = mountUI(ui)
  await settle()
  const sheet = page.root.querySelector("b04-sheet")!
  expect(sheet.getAttribute("role")).toBe("grid")
  expect(sheet.getAttribute("aria-label")).toBe("Q1 budget")
  expect(sheet.getAttribute("aria-multiselectable")).toBe("true")
  expect(page.root.querySelectorAll("[role=row]").length).toBe(6)
  expect([...page.root.querySelectorAll("[role=columnheader]")].map((el) => el.textContent)).toEqual(["", "A", "B", "C", "D"])
  expect([...page.root.querySelectorAll("[role=rowheader]")].map((el) => el.textContent)).toEqual(["1", "2", "3", "4", "5"])
  expect(page.root.querySelectorAll("[role=gridcell]").length).toBe(20)
  expect(text("A3")).toBe("Software")
  expect(tabbable(page.root)).toEqual([cell("A1")])
  expect(page.root.querySelectorAll("b04-sheet-editor input").length).toBe(20)
  for (const input of page.root.querySelectorAll("b04-sheet-editor input")) expect(input.closest("[hidden]")).not.toBe(null)
  expect(status()).toBe("No cell has changed.")
})

test("keyboard: on the page, Enter edits a cell, the cell shows the new text and the status line reports it", async () => {
  cell("B2").focus()
  await keys("Enter")
  const input = cell("B2").querySelector("input")!
  expect(document.activeElement).toBe(input)
  expect(input.closest("[hidden]")).toBe(null)
  expect(input.value).toBe("1200")
  input.value = "1250"
  await keys("Enter")
  expect(text("B2")).toBe("1250")
  expect(status()).toBe("B2 is now 1250.")
  expect(document.activeElement).toBe(cell("B2"))
  expect(input.closest("[hidden]")).not.toBe(null)
})

test("keyboard: on the page, Control+C reports how many cells it copied, and Control+V fills the cells", async () => {
  await keys("ArrowDown", "Shift+ArrowRight", "Shift+ArrowRight")
  const copy = new ClipboardEvent("copy")
  document.activeElement!.dispatchEvent(copy)
  expect(copy.clipboardData.getData("text/plain")).toBe("340\t340\t410")
  expect(status()).toBe("Copied 3 cells.")
  await keys("ArrowDown", "ArrowDown")
  expect(document.activeElement).toBe(cell("B5"))
  document.activeElement!.dispatchEvent(new ClipboardEvent("paste", "340\t340\t410"))
  expect([text("B5"), text("C5"), text("D5")]).toEqual(["340", "340", "410"])
  expect(status()).toBe("Changed 3 cells: B5, C5, D5.")
})

test("agent: an agent reads the sheet, sets a cell and pastes a row, and a cell that does not exist is refused", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const sheet = page.live().find((entry) => entry.label === "Q1 budget")!
  expect([...sheet.actions].sort()).toEqual(["paste", "readSheet", "setCell"])
  expect((sheet.value as string[][])[0]).toEqual(["Item", "Jan", "Feb", "Mar"])

  const read = await page.agent.act({ steps: [{ ref: "Q1 budget", action: "readSheet" }] })
  expect(read.ok, read.error?.message).toBe(true)
  expect(read.steps[0].result).toContain("Software\t340\t340\t410")

  const refused = await page.agent.act({ steps: [{ ref: "Q1 budget", action: "setCell", args: ["E1", "9"] }] })
  expect(refused.ok).toBe(false)
  expect(refused.error?.message).toContain('No cell "E1". The cells are A1 to D5.')

  expect(ui.task!.done(page.root)).toBe(false)
  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(text("B3")).toBe("360")
  expect([text("B5"), text("C5"), text("D5")]).toEqual(["150", "150", "200"])
  expect(ui.task!.done(page.root)).toBe(true)
})
