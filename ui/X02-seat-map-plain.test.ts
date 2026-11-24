import { expect, test } from "vitest"
import type { Context } from "../src/ui"
import ui from "./X02-seat-map-plain"

const root = document.body.appendChild(document.createElement("section"))
ui.mount(root, { agent: undefined as never, ask: async () => false } satisfies Context)

const status = () => root.querySelector("[data-status]")!.textContent
const seat = (id: string) => root.querySelector<HTMLElement>(`[data-seat=${id}]`)!
const book = () => root.querySelector<HTMLElement>("[data-book]")!

// Presses 1 key on the focused element. jsdom does not move focus on Tab, so the test focuses each element itself.
function press(name: string) {
  const parts = name.split("+")
  const key = parts.pop()!
  const init = { key: key === "Space" ? " " : key, shiftKey: parts.includes("Shift"), bubbles: true, cancelable: true }
  const target = (document.activeElement as HTMLElement | null) ?? document.body
  target.dispatchEvent(new KeyboardEvent("keydown", init))
  target.dispatchEvent(new KeyboardEvent("keyup", init))
}

test("keyboard: arrow keys move in 2 dimensions and skip a taken seat, and Home and End go to the row ends", () => {
  seat("A1").focus()
  press("ArrowRight")
  expect(document.activeElement).toBe(seat("A2"))
  press("ArrowRight")
  expect(document.activeElement).toBe(seat("A3"))
  press("ArrowRight")
  expect(document.activeElement).toBe(seat("A6"))
  press("ArrowLeft")
  expect(document.activeElement).toBe(seat("A3"))
  press("ArrowDown")
  expect(document.activeElement).toBe(seat("B3"))
  press("End")
  expect(document.activeElement).toBe(seat("B8"))
  press("Home")
  expect(document.activeElement).toBe(seat("B1"))
  // C1 is taken, so Down from B1 skips it and lands on D1. Up skips it again.
  press("ArrowDown")
  expect(document.activeElement).toBe(seat("D1"))
  press("ArrowUp")
  expect(document.activeElement).toBe(seat("B1"))
  press("ArrowUp")
  expect(document.activeElement).toBe(seat("A1"))
  press("ArrowUp")
  expect(document.activeElement).toBe(seat("A1"))
})

test("keyboard: the grid is 1 tab stop, and a taken seat does not get focus", () => {
  expect(root.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
  expect(root.querySelector('[tabindex="0"]')).toBe(seat("A1"))
  const taken = root.querySelectorAll<HTMLElement>("[data-taken]")
  expect(taken).toHaveLength(5)
  for (const el of taken) {
    expect(el.getAttribute("aria-disabled")).toBe("true")
    expect(el.hasAttribute("aria-selected")).toBe(false)
    expect(el.hasAttribute("tabindex")).toBe(false)
  }
  expect(seat("A3").hasAttribute("aria-disabled")).toBe(false)
})

test("keyboard: Space and Enter select a seat, and Space again clears it", () => {
  seat("B1").focus()
  press("Space")
  press("ArrowRight")
  press("Enter")
  expect(status()).toBe("Selected: B1, B2.")
  expect(seat("B2").getAttribute("aria-selected")).toBe("true")
  expect(seat("B3").getAttribute("aria-selected")).toBe("false")
  press("Space")
  expect(status()).toBe("Selected: B1.")
  expect(seat("B2").hasAttribute("data-selected")).toBe(false)
  press("ArrowLeft")
  press("Space")
  expect(status()).toBe("No seat is selected.")
})

test("keyboard: Shift with an arrow key extends the selection", () => {
  seat("B1").focus()
  press("Space")
  press("Shift+ArrowRight")
  press("Shift+ArrowRight")
  expect(status()).toBe("Selected: B1, B2, B3.")
  press("Space")
  press("ArrowLeft")
  press("Space")
  press("ArrowLeft")
  press("Space")
  expect(status()).toBe("No seat is selected.")
})

test("keyboard: a click selects a free seat and does nothing on a taken seat", () => {
  seat("A7").click()
  seat("A4").click()
  expect(status()).toBe("Selected: A7.")
  expect(seat("A4").hasAttribute("data-selected")).toBe(false)
  expect(document.activeElement).toBe(seat("A7"))
  expect(root.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
  seat("A7").click()
})

test("keyboard: Left and Right follow the text direction", () => {
  document.documentElement.dir = "rtl"
  try {
    seat("B3").focus()
    press("ArrowRight")
    expect(document.activeElement).toBe(seat("B2"))
    press("ArrowLeft")
    expect(document.activeElement).toBe(seat("B3"))
  } finally {
    document.documentElement.dir = "ltr"
  }
  press("ArrowRight")
  expect(document.activeElement).toBe(seat("B4"))
})

test("keyboard: Book seats reports the selected seats, or asks for a seat first", () => {
  book().focus()
  book().click()
  expect(status()).toBe("Select a seat first.")
  seat("C4").click()
  seat("C5").click()
  book().click()
  expect(status()).toBe("Booked: C4, C5.")
  expect(root.querySelectorAll("[data-selected]")).toHaveLength(2)
})
