import { afterAll, expect, test } from "vitest"
import type { Context } from "../src/ui"
import ui from "./X03-metro-line-map-plain"

const root = document.body.appendChild(document.createElement("section"))
ui.mount(root, { agent: undefined as never, ask: async () => false } satisfies Context)

const status = () => root.querySelector("[data-status]")!.textContent
const stations = () => [...root.querySelectorAll<HTMLElement>("[role=option]")]
const station = (name: string) => stations().find((s) => s.textContent === name)!
const plan = () => root.querySelector<HTMLElement>("[data-plan]")!
const focused = () => document.activeElement?.textContent
const selected = () => stations().filter((s) => s.getAttribute("aria-selected") === "true").map((s) => s.textContent)
const stops = () => stations().filter((s) => s.tabIndex === 0)

// Presses keys on the focused element. jsdom does not click on Space and Enter, so this does for a button.
function press(...names: string[]) {
  for (const name of names) {
    const init = { key: name === "Space" ? " " : name, bubbles: true, cancelable: true }
    const target = (document.activeElement as HTMLElement | null) ?? document.body
    const went = target.dispatchEvent(new KeyboardEvent("keydown", init))
    if (went && (name === "Space" || name === "Enter") && target.matches("button")) target.click()
    target.dispatchEvent(new KeyboardEvent("keyup", init))
  }
}

afterAll(() => {
  document.documentElement.removeAttribute("dir")
})

test("keyboard: the line is 1 tab stop, and Left and Right, Home and End move focus only", () => {
  const line = root.querySelector("[role=listbox]")!
  expect(line.getAttribute("aria-label")).toBe("Metro stations")
  expect(line.getAttribute("aria-orientation")).toBe("horizontal")
  expect(stations().map((s) => s.textContent)).toEqual(["Harbour", "Old Market", "Cathedral", "Museum", "Mill Park", "Stadium", "Airport"])
  expect(stops()).toEqual([station("Harbour")])
  station("Harbour").focus()
  press("ArrowRight", "ArrowRight")
  expect(focused()).toBe("Cathedral")
  expect(stops()).toEqual([station("Cathedral")])
  press("ArrowLeft")
  expect(focused()).toBe("Old Market")
  press("End")
  expect(focused()).toBe("Airport")
  press("ArrowRight")
  expect(focused()).toBe("Airport")
  press("Home")
  expect(focused()).toBe("Harbour")
  press("ArrowLeft")
  expect(focused()).toBe("Harbour")
  expect(stops()).toHaveLength(1)
  expect(selected()).toEqual([])
  expect(status()).toBe("Boarding at Harbour. Pick a destination.")
})

test("keyboard: typing a name moves focus to that station and picks nothing", () => {
  station("Harbour").focus()
  press("s")
  expect(focused()).toBe("Stadium")
  press("Home", "m")
  expect(focused()).toBe("Museum")
  // The same letter again steps to the next station that starts with it.
  press("m")
  expect(focused()).toBe("Mill Park")
  press("m")
  expect(focused()).toBe("Museum")
  expect(stops()).toEqual([station("Museum")])
  press("Home", "m", "i")
  expect(focused()).toBe("Mill Park")
  press("z")
  expect(focused()).toBe("Mill Park")
  expect(selected()).toEqual([])
  expect(status()).toBe("Boarding at Harbour. Pick a destination.")
})

test("keyboard: Space continues a name that is being typed, and picks the focused station when none is", () => {
  station("Harbour").focus()
  // Escape ends the query that the last test left.
  press("Escape")
  press("o", "l", "d", "Space", "m")
  expect(focused()).toBe("Old Market")
  expect(selected()).toEqual([])
  press("Escape", "Space")
  expect(selected()).toEqual(["Old Market"])
  expect(status()).toBe("Destination: Old Market.")
})

test("keyboard: Space and Enter pick the focused station, and the arrow keys do not", () => {
  station("Harbour").focus()
  press("ArrowRight", "ArrowRight")
  expect(selected()).toEqual(["Old Market"])
  press("Space")
  expect(selected()).toEqual(["Cathedral"])
  expect(status()).toBe("Destination: Cathedral.")
  press("ArrowRight", "Enter")
  expect(selected()).toEqual(["Museum"])
  expect(station("Cathedral").getAttribute("aria-selected")).toBe("false")
})

test("keyboard: a click picks a station and Plan trip reports the stops from Harbour", () => {
  station("Stadium").click()
  expect(selected()).toEqual(["Stadium"])
  expect(focused()).toBe("Stadium")
  expect(stops()).toEqual([station("Stadium")])
  plan().focus()
  press("Enter")
  expect(status()).toBe("Trip to Stadium: 5 stops from Harbour.")
  station("Old Market").click()
  plan().click()
  expect(status()).toBe("Trip to Old Market: 1 stop from Harbour.")
})

test("keyboard: Plan trip with no station picked asks for a destination", () => {
  const fresh = document.body.appendChild(document.createElement("section"))
  ui.mount(fresh, { agent: undefined as never, ask: async () => false } satisfies Context)
  fresh.querySelector<HTMLElement>("[data-plan]")!.click()
  expect(fresh.querySelector("[data-status]")!.textContent).toBe("Pick a destination first.")
  fresh.remove()
})

test("keyboard: Left and Right follow the text direction", () => {
  document.documentElement.dir = "ltr"
  station("Harbour").focus()
  press("ArrowRight")
  const ltr = focused()
  document.documentElement.dir = "rtl"
  station("Harbour").focus()
  press("ArrowRight")
  expect(ltr).toBe("Old Market")
  expect(focused()).toBe("Harbour")
  press("ArrowLeft")
  expect(focused()).toBe("Old Market")
})
