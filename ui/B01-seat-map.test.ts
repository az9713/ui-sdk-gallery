import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { seatMap } from "./B01-seat-map"

// 2 rows of 4 seats. B2 is taken.
const id = (row: number, col: number) => `${String.fromCharCode(65 + row)}${col + 1}`
const cell = (row: number, col: number) => `<seat value="${id(row, col)}" row="${row}" col="${col}">${id(row, col)}</seat>`
const markup = `<root aria-label="Seat map"><row>${[0, 1, 2, 3].map((c) => cell(0, c)).join("")}</row><row>${[0, 1, 2, 3].map((c) => cell(1, c)).join("")}</row></root>`
const options = { rows: 2, cols: 4, taken: ["B2"] }
const seat = (view: ReturnType<typeof mount<typeof seatMap>>, id: string) =>
  [...view.root.querySelectorAll<HTMLElement>("[data-slot=seat-map-seat]")].find((el) => el.textContent === id)!

test("keyboard: arrow keys move in 2 dimensions and Home, End go to the row ends", async () => {
  const view = mount(seatMap, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(seat(view, "A1"))
    await view.keys("ArrowRight", "ArrowRight")
    expect(document.activeElement).toBe(seat(view, "A3"))
    await view.keys("ArrowDown")
    expect(document.activeElement).toBe(seat(view, "B3"))
    await view.keys("End")
    expect(document.activeElement).toBe(seat(view, "B4"))
    await view.keys("Home")
    expect(document.activeElement).toBe(seat(view, "B1"))
    await view.keys("ArrowUp")
    expect(document.activeElement).toBe(seat(view, "A1"))
  } finally {
    view.unmount()
  }
})

test("keyboard: the grid is 1 tab stop, and a taken seat does not get focus", async () => {
  const view = mount(seatMap, options, markup)
  try {
    await view.keys("Tab", "ArrowDown")
    expect(document.activeElement).toBe(seat(view, "B1"))
    await view.keys("ArrowRight")
    expect(document.activeElement).toBe(seat(view, "B3"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(seat(view, "B2").getAttribute("aria-disabled")).toBe("true")
    expect(seat(view, "B2").hasAttribute("aria-selected")).toBe(false)
    expect(seat(view, "B3").hasAttribute("aria-disabled")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: Space and Enter select a seat, and Space again clears it", async () => {
  const view = mount(seatMap, options, markup)
  try {
    await view.keys("Tab", "Space", "ArrowRight", "Enter")
    expect(view.state.value).toEqual(["A1", "A2"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
    expect(seat(view, "A2").getAttribute("aria-selected")).toBe("true")
    expect(seat(view, "A3").getAttribute("aria-selected")).toBe("false")
    await view.keys("Space")
    expect(view.state.value).toEqual(["A1"])
    expect(seat(view, "A2").hasAttribute("data-selected")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: Shift with an arrow key extends the selection", async () => {
  const view = mount(seatMap, options, markup)
  try {
    await view.keys("Tab", "Space", "Shift+ArrowRight", "Shift+ArrowRight")
    expect(view.state.value).toEqual(["A1", "A2", "A3"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "list-navigation" })
  } finally {
    view.unmount()
  }
})

test("keyboard: a click selects a free seat and does nothing on a taken seat", async () => {
  const view = mount(seatMap, options, markup)
  try {
    await view.click(seat(view, "A4"))
    await view.click(seat(view, "B2"))
    expect(view.state.value).toEqual(["A4"])
  } finally {
    view.unmount()
  }
})

test("server: the seat map renders with no DOM", () => {
  checkServer(seatMap, options, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(seatMap, options, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent

test("names: the page names the grid, each seat and the button", async () => {
  page = mountUI(ui)
  await settle()
  expect(page.root.querySelector("b01-seat-map")!.getAttribute("aria-label")).toBe("Seat map")
  expect(page.root.querySelector("b01-seat-map")!.getAttribute("role")).toBe("grid")
  expect(page.root.querySelectorAll("b01-seat").length).toBe(40)
  expect(page.root.querySelector("button")!.textContent).toBe("Book seats")
  expect(page.root.querySelectorAll("b01-seat[aria-disabled=true]").length).toBe(5)
})

test("keyboard: on the page, Space selects the focused seat and the status line reports it", async () => {
  page.root.querySelector<HTMLElement>("b01-seat")!.focus()
  await keys("ArrowRight", "Space")
  expect(status()).toBe("Selected: A2.")
  await keys("Space")
  expect(status()).toBe("No seat is selected.")
  page.root.querySelector<HTMLElement>("button")!.focus()
  await keys("Enter")
  expect(status()).toBe("Select a seat first.")
})

test("agent: an agent finds the grid, selects 2 seats and books them, and cannot select a taken seat", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const grid = page.live().find((entry) => entry.label === "Seat map")!
  expect(grid.actions).toEqual(["toggle", "clear"])
  const free = await page.agent.query({ within: "Seat map" })
  expect(JSON.stringify(free)).toContain("C4")
  expect(JSON.stringify(free)).not.toContain("C1")

  const result = await page.agent.act({
    steps: [
      { ref: "Seat map", action: "toggle", args: ["C4"] },
      { ref: "Seat map", action: "toggle", args: ["C1"] },
      { ref: "Seat map", action: "toggle", args: ["C5"] },
      { ref: "Book seats", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Booked: C4, C5.")
  expect(page.root.querySelectorAll("b01-seat[data-selected]").length).toBe(2)
})
