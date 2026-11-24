import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { entry, logViewer } from "./B13-log-viewer"

// jsdom has no layout: the page's scroller is 10 rows tall, and scrollTo fires its scroll event a moment later, as a browser does.
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get(this: HTMLElement) {
    return this.localName === "b13-viewport" ? 320 : 0
  },
})
Element.prototype.scrollTo = function (this: Element, options?: ScrollToOptions | number) {
  this.scrollTop = typeof options === "number" ? 0 : (options?.top ?? 0)
  setTimeout(() => this.dispatchEvent(new Event("scroll")), 0)
} as Element["scrollTo"]

// 3 lines of 3 cells, rendered as static markup: mount does not run the page's row renderer.
const cell = (row: number, col: number) => `<cell value="${row}:${col}" row="${row}" col="${col}">${row}:${col}</cell>`
const line = (row: number) => `<row value="${row + 1}">${[0, 1, 2].map((col) => cell(row, col)).join("")}</row>`
const markup = `<root aria-label="Server log"><grid aria-label="Log lines"><columns><column value="time">Time</column><column value="level">Level</column><column value="message">Message</column></columns><viewport>${[0, 1, 2].map(line).join("")}</viewport></grid></root>`
const options = { count: 3 }
type View = ReturnType<typeof mount<typeof logViewer>>
// mount keeps a prop out of the element's attributes, so a cell is found by its text and a row by its place.
const at = (view: View, row: number, col: number) =>
  [...view.root.querySelectorAll<HTMLElement>("[data-slot=log-viewer-cell]")].find((el) => el.textContent === `${row}:${col}`)!
const rowOf = (view: View, n: number) => view.root.querySelectorAll<HTMLElement>("[data-slot=log-viewer-row]")[n - 1]

test("keyboard: arrow keys move in 2 dimensions, Home and End go to the row ends, Control+End to the last line", async () => {
  const view = mount(logViewer, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(at(view, 0, 0))
    await view.keys("ArrowRight", "ArrowDown")
    expect(document.activeElement).toBe(at(view, 1, 1))
    await view.keys("End")
    expect(document.activeElement).toBe(at(view, 1, 2))
    await view.keys("Home")
    expect(document.activeElement).toBe(at(view, 1, 0))
    await view.keys("ArrowUp")
    expect(document.activeElement).toBe(at(view, 0, 0))
    await view.keys("Control+End")
    expect(document.activeElement).toBe(at(view, 2, 2))
    await view.keys("Control+Home")
    expect(document.activeElement).toBe(at(view, 0, 0))
  } finally {
    view.unmount()
  }
})

test("keyboard: the grid is 1 tab stop", async () => {
  const view = mount(logViewer, options, markup)
  try {
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await view.keys("Tab", "ArrowDown", "ArrowRight")
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(at(view, 1, 1).getAttribute("tabindex")).toBe("0")
    expect(at(view, 0, 0).getAttribute("tabindex")).toBe("-1")
  } finally {
    view.unmount()
  }
})

test("keyboard: Space and Enter select the line of the focused cell, and a click selects too", async () => {
  const view = mount(logViewer, options, markup)
  try {
    await view.keys("Tab", "ArrowDown", "Space")
    expect(view.state.value).toBe(2)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
    expect(rowOf(view, 2).getAttribute("aria-selected")).toBe("true")
    expect(rowOf(view, 2).hasAttribute("data-selected")).toBe(true)
    expect(rowOf(view, 1).getAttribute("aria-selected")).toBe("false")
    await view.keys("ArrowDown", "Enter")
    expect(view.state.value).toBe(3)
    expect(rowOf(view, 2).hasAttribute("data-selected")).toBe(false)
    await view.click(at(view, 0, 2))
    expect(view.state.value).toBe(1)
  } finally {
    view.unmount()
  }
})

test("aria: the grid counts every line with its header row, and each row gives its place", () => {
  const view = mount(logViewer, { count: 100_000 }, markup)
  try {
    const grid = view.root.querySelector("[data-slot=log-viewer-grid]")!
    expect(grid.getAttribute("role")).toBe("grid")
    expect(grid.getAttribute("aria-rowcount")).toBe("100001")
    expect(grid.getAttribute("aria-colcount")).toBe("3")
    expect(view.root.querySelector("[data-slot=log-viewer-columns]")!.getAttribute("aria-rowindex")).toBe("1")
    expect(rowOf(view, 1).getAttribute("aria-rowindex")).toBe("2")
    expect(rowOf(view, 3).getAttribute("aria-rowindex")).toBe("4")
    expect(rowOf(view, 1).hasAttribute("aria-disabled")).toBe(false)
    expect(at(view, 0, 0).getAttribute("role")).toBe("gridcell")
  } finally {
    view.unmount()
  }
})

test("server: the log viewer renders with no DOM", () => {
  checkServer(logViewer, options, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(logViewer, options, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const rows = () => [...page.root.querySelectorAll("b13-row")].map((row) => row.getAttribute("value"))
const pageCell = (row: number, col: number) => page.root.querySelector<HTMLElement>(`b13-cell[value="${row}:${col}"]`)
const scroller = () => page.root.querySelector<HTMLElement>("b13-viewport")!

test("names: the page names the log, the grid and its 3 columns", async () => {
  page = mountUI(ui)
  await settle()
  expect(page.root.querySelector("b13-log-viewer")!.getAttribute("aria-label")).toBe("Server log")
  expect(page.root.querySelector("b13-grid")!.getAttribute("aria-label")).toBe("Log lines")
  expect([...page.root.querySelectorAll("[role=columnheader]")].map((el) => el.textContent)).toEqual(["Time", "Level", "Message"])
  expect(status()).toBe("No line is selected.")
})

test("keyboard: on the page, only the visible rows are in it, and Control+End brings in line 100,000", async () => {
  expect(rows().length).toBeLessThanOrEqual(20)
  expect(rows().slice(0, 2)).toEqual(["1", "2"])
  expect(page.root.querySelector("b13-rendered")!.textContent).toBe(`${rows().length} of 100,000 lines are in the page.`)
  pageCell(0, 0)!.focus()
  await keys("Control+End")
  expect(document.activeElement).toBe(pageCell(99_999, 2))
  expect(rows()).toContain("100000")
  expect(rows()).not.toContain("1")
  expect(rows().length).toBeLessThanOrEqual(20)
  expect(page.root.querySelector("b13-row[value='100000']")!.getAttribute("aria-rowindex")).toBe("100001")
  await keys("Control+Home")
  expect(document.activeElement).toBe(pageCell(0, 0))
  expect(rows()).not.toContain("100000")
})

test("keyboard: on the page, the focused row stays in the page when the list scrolls away", async () => {
  pageCell(0, 0)!.focus()
  scroller().scrollTop = 50_000 * 32
  scroller().dispatchEvent(new Event("scroll"))
  await settle()
  expect(rows()).toContain("50001")
  expect(rows()).toContain("1")
  expect(rows().length).toBeLessThanOrEqual(25)
  expect(document.activeElement).toBe(pageCell(0, 0))
})

test("keyboard: on the page, Page Down moves 10 lines, and Enter and Space select a line for the status line", async () => {
  pageCell(0, 0)!.focus()
  await keys("PageDown")
  expect(document.activeElement).toBe(pageCell(10, 0))
  await keys("Enter")
  const eleven = entry(10)
  expect(status()).toBe(`Line 11 selected: ${eleven.time} ${eleven.level} ${eleven.message}`)
  await keys("ArrowDown", "Space")
  expect(status()!.startsWith("Line 12 selected:")).toBe(true)
  expect(page.root.querySelector("b13-row[value='12']")!.getAttribute("aria-selected")).toBe("true")
})

test("agent: an agent selects line 87,412, which is not rendered, and a line outside the log is refused", async () => {
  for (const item of page.live()) expect(item.label, `${item.component} ${item.ref} has no name`).toBeTruthy()
  const log = page.live().find((item) => item.label === "Server log")!
  expect(log.actions).toEqual(["select"])
  expect(rows()).not.toContain("87412")

  const result = await page.agent.act({ steps: [{ ref: "Server log", action: "select", args: [87_412] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()!.startsWith("Line 87,412 selected:")).toBe(true)
  expect(ui.task!.done(page.root)).toBe(true)
  await settle()
  expect(page.root.querySelector("b13-row[value='87412']")!.getAttribute("aria-selected")).toBe("true")

  const refused = await page.agent.act({ steps: [{ ref: "Server log", action: "select", args: [100_001] }] })
  expect(refused.ok).toBe(false)
  expect(refused.error?.message).toContain("No line 100001")
  expect(page.live().find((item) => item.label === "Server log")!.value).toBe(87_412)
})
