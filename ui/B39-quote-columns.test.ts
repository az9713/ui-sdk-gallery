import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { quoteTable } from "./B39-quote-columns"

const names = ["a", "b", "c", "d"]
const markup = `<root aria-label="Quotes"><bar aria-label="Columns">${names
  .map((n) => `<column value="${n}">${n.toUpperCase()}<grip value="${n}"></grip></column>`)
  .join("")}</bar></root>`
const options = { defaultValue: names, defaultWidths: names.map((n) => `${n}:100`) }
type View = ReturnType<typeof mount<typeof quoteTable>>
const column = (view: View, key: string) => view.part("column", key)!
const grip = (view: View, key: string) => view.part("grip", key)!
const width = (root: Element, key: string) => root.getAttribute("style")?.match(new RegExp(`--column-${key}: (\\d+)px`))?.[1]

// jsdom has no layout: each column is 100 px wide, side by side, at the place it has in the order now.
function layOut(view: View) {
  const rect = HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.localName !== "column") return rect.call(this)
    const left = view.api.order().indexOf(this.getAttribute("value")!) * 100
    return { x: left, y: 0, left, top: 0, right: left + 100, bottom: 40, width: 100, height: 40, toJSON: () => ({}) }
  }
  return () => (HTMLElement.prototype.getBoundingClientRect = rect)
}

const pointer = (el: Element, type: string, x: number, buttons = 1) =>
  el.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: 10, button: 0, buttons, pointerId: 3, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true }),
  )

test("keyboard: the column bar is 1 tab stop, and Left and Right move focus without a change of order", async () => {
  const view = mount(quoteTable, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(column(view, "a"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(column(view, "b").getAttribute("tabindex")).toBe("-1")
    await view.keys("ArrowRight", "ArrowRight")
    expect(document.activeElement).toBe(column(view, "c"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await view.keys("ArrowLeft")
    expect(document.activeElement).toBe(column(view, "b"))
    expect(view.state.value).toEqual(names)
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: Space picks up a column, Right moves it, and Space drops it", async () => {
  const view = mount(quoteTable, options, markup)
  try {
    await view.keys("Tab", "Space")
    expect(column(view, "a").getAttribute("aria-selected")).toBe("true")
    expect(column(view, "a").hasAttribute("data-grabbed")).toBe(true)
    expect(column(view, "b").getAttribute("aria-selected")).toBe("false")
    await view.keys("ArrowRight", "ArrowRight")
    expect(view.api.order()).toEqual(["b", "c", "a", "d"])
    expect(view.state.value).toEqual(names)
    await view.keys("Space")
    expect(view.state.value).toEqual(["b", "c", "a", "d"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "move-key", source: "keyboard" })
    expect(column(view, "a").getAttribute("aria-selected")).toBe("false")
    expect(column(view, "a").hasAttribute("data-grabbed")).toBe(false)
    expect(view.announced.at(-1)).toBe("Dropped A at position 3 of 4.")
  } finally {
    view.unmount()
  }
})

test("keyboard: Escape puts a picked-up column back, and Home and End send a column to either end", async () => {
  const view = mount(quoteTable, options, markup)
  try {
    await view.keys("Tab", "Space", "ArrowRight", "Escape")
    expect(view.state.value).toEqual(names)
    expect(view.state.moving).toBeNull()
    expect(view.changes).toEqual([])
    await view.keys("ArrowRight", "Enter", "End", "Enter")
    expect(view.state.value).toEqual(["a", "c", "d", "b"])
    await view.keys("Enter", "Home", "Enter")
    expect(view.state.value).toEqual(["b", "a", "c", "d"])
    expect(document.activeElement).toBe(column(view, "b"))
  } finally {
    view.unmount()
  }
})

test("keyboard: Shift with Right and Left resizes the focused column in steps of 8 px, from 64 to 320 px", async () => {
  const view = mount(quoteTable, options, markup)
  try {
    await view.keys("Tab", "ArrowRight", "Shift+ArrowRight")
    expect(document.activeElement).toBe(column(view, "b"))
    expect(view.state.widths).toContain("b:108")
    expect(width(view.root, "b")).toBe("108")
    expect(width(view.root, "a")).toBe("100")
    expect(view.root.getAttribute("style")).toContain("--columns-width: 408px")
    expect(view.changes.at(-1)).toMatchObject({ key: "widths", reason: "step-key", source: "keyboard" })
    await view.keys("Shift+ArrowLeft", "Shift+ArrowLeft")
    expect(width(view.root, "b")).toBe("92")
    view.api.resizeColumn("b", 316)
    await view.keys("Shift+ArrowRight")
    expect(width(view.root, "b")).toBe("320")
    await view.keys("Shift+ArrowRight")
    expect(width(view.root, "b")).toBe("320")
    view.api.resizeColumn("b", 68)
    await view.keys("Shift+ArrowLeft", "Shift+ArrowLeft")
    expect(width(view.root, "b")).toBe("64")
    expect(view.state.value).toEqual(names)
    expect(document.activeElement).toBe(column(view, "b"))
  } finally {
    view.unmount()
  }
})

test("pointer: a drag of a column's edge resizes it and does not move it, and Escape puts the width back", async () => {
  const view = mount(quoteTable, options, markup)
  const restore = layOut(view)
  try {
    await view.drag(grip(view, "a"), { by: { x: 140, y: 0 } })
    await view.settle()
    expect(view.state.value).toEqual(names)
    expect(view.state.moving).toBeNull()
    expect(view.changes.some((change) => change.key === "value")).toBe(false)
    expect(width(view.root, "a")).toBe("240")
    expect(view.changes.at(-1)).toMatchObject({ key: "widths", reason: "drag", source: "mouse" })
    expect(view.state.sizing).toBeNull()

    const changes = view.changes.length
    pointer(grip(view, "b"), "pointerdown", 150)
    pointer(grip(view, "b"), "pointermove", 170)
    pointer(grip(view, "b"), "pointermove", 190)
    await view.settle()
    expect(width(view.root, "b")).toBe("140")
    expect(column(view, "b").hasAttribute("data-resizing")).toBe(true)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
    pointer(grip(view, "b"), "pointerup", 190, 0)
    await view.settle()
    expect(width(view.root, "b")).toBe("100")
    expect(column(view, "b").hasAttribute("data-resizing")).toBe(false)
    expect(view.changes.length).toBe(changes)
  } finally {
    restore()
    view.unmount()
  }
})

test("pointer: a drag of a column title moves the column to the place where it is dropped", async () => {
  const view = mount(quoteTable, options, markup)
  const restore = layOut(view)
  try {
    await view.drag(column(view, "a"), { by: { x: 140, y: 0 } })
    await view.settle()
    expect(view.state.value).toEqual(["b", "a", "c", "d"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag", source: "mouse" })
    expect(view.state.widths).toEqual(options.defaultWidths)
  } finally {
    restore()
    view.unmount()
  }
})

test("agent: the primitive's actions refuse a column that does not exist and a width that is not a number", () => {
  const view = mount(quoteTable, options, markup)
  try {
    expect(() => view.api.moveColumn("z", 0)).toThrow('No column "z". Columns: a, b, c, d.')
    expect(() => view.api.moveColumn("a", 9)).toThrow("Index 9 is outside 0 to 3.")
    expect(() => view.api.resizeColumn("a", Number.NaN)).toThrow("is not a number of pixels")
    view.api.resizeColumn("c", 999)
    expect(width(view.root, "c")).toBe("320")
    expect(view.changes.at(-1)).toMatchObject({ key: "widths", reason: "imperative" })
  } finally {
    view.unmount()
  }
})

test("server: the quote table renders with no DOM", () => {
  checkServer(quoteTable, options, markup)
})

test("direction: right to left mirrors the arrows for focus and moves", async () => {
  await checkDirection(quoteTable, options, markup)
})

test("direction: right to left, Shift with Left widens a column and Shift with Right narrows it", async () => {
  document.documentElement.dir = "rtl"
  const view = mount(quoteTable, options, markup)
  try {
    await view.keys("Tab", "Shift+ArrowLeft", "Shift+ArrowLeft", "Shift+ArrowRight")
    expect(width(view.root, "a")).toBe("108")
  } finally {
    view.unmount()
    document.documentElement.removeAttribute("dir")
  }
})

test("controlled: a dropped width stays on screen until the owner writes it back a microtask later, then the draft clears", async () => {
  const host = document.body.appendChild(document.createElement("div"))
  host.innerHTML = `<b39-quote-table aria-label="Late table" value="a,b" widths="a:100,b:100"><b39-columns aria-label="Late columns"><b39-column value="a">A<b39-grip value="a"></b39-grip></b39-column><b39-column value="b">B<b39-grip value="b"></b39-grip></b39-column></b39-columns></b39-quote-table>`
  const table = host.querySelector("b39-quote-table")!
  const late = host.querySelector<HTMLElement>('b39-grip[value="a"]')!
  let echo = true
  table.addEventListener("widthschange", (event) => {
    const { value } = (event as CustomEvent<{ value: string[] }>).detail
    if (echo) queueMicrotask(() => table.setAttribute("widths", value.join(",")))
  })
  try {
    await settle()
    pointer(late, "pointerdown", 100)
    pointer(late, "pointermove", 130)
    pointer(late, "pointermove", 160)
    await settle()
    expect(width(table, "a")).toBe("160")
    pointer(late, "pointerup", 160, 0)
    expect(table.getAttribute("widths")).toBe("a:100,b:100")
    expect(width(table, "a")).toBe("160")
    await settle()
    expect(table.getAttribute("widths")).toBe("a:160,b:100")
    expect(width(table, "a")).toBe("160")
    expect(host.querySelector('b39-column[value="a"]')!.hasAttribute("data-resizing")).toBe(false)

    echo = false
    pointer(late, "pointerdown", 160)
    pointer(late, "pointermove", 200)
    pointer(late, "pointermove", 220)
    await settle()
    expect(width(table, "a")).toBe("220")
    pointer(late, "pointerup", 220, 0)
    await settle()
    expect(width(table, "a")).toBe("160")
  } finally {
    host.remove()
  }
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const heads = () => [...page.root.querySelectorAll<HTMLElement>("b39-column")]
const headOrder = () => heads().map((head) => head.getAttribute("value"))
const rowOrder = (n: number) =>
  [...page.root.querySelectorAll(`tbody tr:nth-child(${n}) td`)].map((cell) => cell.getAttribute("data-column"))
const first = ["symbol", "name", "last", "change", "volume", "pe", "trend"]

test("names: the page names the table and its columns, and describes the keys", async () => {
  page = mountUI(ui)
  await settle()
  const table = page.root.querySelector("b39-quote-table")!
  expect(table.getAttribute("role")).toBe("group")
  expect(table.getAttribute("aria-label")).toBe("Quote table")
  const bar = page.root.querySelector("b39-columns")!
  expect(bar.getAttribute("role")).toBe("listbox")
  expect(bar.getAttribute("aria-orientation")).toBe("horizontal")
  expect(headOrder()).toEqual(first)
  for (const head of heads()) {
    expect(head.getAttribute("role")).toBe("option")
    expect(page.root.querySelector(`#${head.getAttribute("aria-describedby")}`)!.textContent).toContain("Shift")
  }
  expect(heads().filter((head) => head.tabIndex === 0).length).toBe(1)
  expect(page.root.querySelectorAll("tbody tr").length).toBe(8)
  expect(page.root.querySelectorAll("tbody svg path[data-spark]").length).toBe(8)
  expect(width(table, "name")).toBe("196")
})

test("keyboard: on the page, the header and every row follow a moved column, focus stays on it, and the status line reports it", async () => {
  heads()[3].focus()
  await keys("Space", "ArrowLeft")
  expect(headOrder()).toEqual(["symbol", "name", "change", "last", "volume", "pe", "trend"])
  expect(rowOrder(1)).toEqual(headOrder())
  expect(document.activeElement).toBe(heads()[2])
  expect(status()).toBe("The columns are in their first order.")
  await keys("Space")
  expect(status()).toBe("Columns: Symbol, Company, Change, Last, Volume, P/E, 30-day trend.")
  expect(page.root.querySelector("b39-quote-table")!.getAttribute("value")).toBe("symbol,name,change,last,volume,pe,trend")
  expect(document.activeElement).toBe(heads()[2])
  for (let n = 1; n <= 8; n++) expect(rowOrder(n)).toEqual(headOrder())
  expect([...page.root.querySelectorAll("col")].map((col) => col.getAttribute("data-column"))).toEqual(headOrder())
  await keys("Shift+ArrowRight")
  expect(status()).toBe("Change column: 104 px wide.")
  expect(width(page.root.querySelector("b39-quote-table")!, "change")).toBe("104")
})

test("controlled: the page refuses an order that moves Symbol, and the table goes back to the order the page holds", async () => {
  const before = headOrder()
  heads()[1].focus()
  await keys("Space", "ArrowLeft")
  expect(headOrder()[0]).toBe("name")
  await keys("Space")
  expect(status()).toBe("Symbol stays the first column. The order did not change.")
  await settle()
  expect(headOrder()).toEqual(before)
  for (let n = 1; n <= 8; n++) expect(rowOrder(n)).toEqual(before)
  expect(page.root.querySelector("b39-quote-table")!.getAttribute("value")).toBe(before.join(","))
})

test("agent: an agent finds the table and its columns, moves Change and resizes Company", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const table = page.live().find((entry) => entry.label === "Quote table")!
  expect(table.actions).toEqual(["moveColumn", "resizeColumn"])
  const found = JSON.stringify(await page.agent.query({ within: "Quote table" }))
  for (const label of ["Symbol", "Company", "30-day trend"]) expect(found).toContain(label)

  // Put the page back in its first order: the task starts from there.
  const reset = await page.agent.act({ steps: [{ ref: "Quote table", action: "moveColumn", args: ["Last", 2] }] })
  expect(reset.ok, reset.error?.message).toBe(true)
  expect(headOrder()).toEqual(first)

  const result = await page.agent.act(ui.task!)
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Company column: 220 px wide.")
  expect(headOrder()).toEqual(["symbol", "name", "change", "last", "volume", "pe", "trend"])
  expect(ui.task!.done(page.root)).toBe(true)

  const refused = await page.agent.act({ steps: [{ ref: "Quote table", action: "moveColumn", args: ["Company", 0] }] })
  expect(refused.ok).toBe(true)
  expect(status()).toBe("Symbol stays the first column. The order did not change.")
  await settle()
  expect(headOrder()[0]).toBe("symbol")
})
