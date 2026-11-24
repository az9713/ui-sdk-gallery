import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A23-flight-search"

const { root, agent, live } = mountUI(ui)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const status = () => root.querySelector("[data-status]")!.textContent
const input = () => root.querySelector("input")!
const loadStatus = () => root.querySelector("ui-autocomplete-status")!.textContent
const options = () => [...root.querySelectorAll("ui-autocomplete-item")].map((item) => item.textContent)
const search = () => root.querySelector<HTMLElement>("[data-search] button")!

// Typing in the field, then the debounce (200 ms) and the load (300 ms) of the page.
async function type(text: string, pause = 800) {
  input().focus()
  input().value = text
  input().dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
  await wait(pause)
  await settle()
}

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  expect(labels).toEqual(["Destination airport", "Search flights"])
})

test("keyboard: the page has 2 tab stops, the field and the button", async () => {
  expect(tabbable(root)).toHaveLength(2)
  input().focus()
  await keys("Tab")
  expect(document.activeElement).toBe(search())
})

test("keyboard: typing shows a loading message, then the airports that load after the delay", async () => {
  input().focus()
  input().value = "lon"
  input().dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
  await wait(260)
  expect(loadStatus()).toBe("Searching airports…")
  expect(options()).toEqual([])
  await wait(500)
  await settle()
  expect(loadStatus()).toBe("2 airports")
  expect(options()).toEqual(["London Gatwick (LGW)", "London Heathrow (LHR)"])
  expect(input().getAttribute("aria-expanded")).toBe("true")
})

test("keyboard: ArrowDown and ArrowUp move the highlight, and Enter chooses the airport", async () => {
  await type("lon")
  await keys("ArrowDown")
  const first = input().getAttribute("aria-activedescendant")
  await keys("ArrowDown")
  const second = input().getAttribute("aria-activedescendant")
  expect(second).not.toBe(first)
  await keys("ArrowUp")
  expect(input().getAttribute("aria-activedescendant")).toBe(first)
  await keys("ArrowDown", "Enter")
  expect(input().value).toBe("London Heathrow (LHR)")
  expect(input().getAttribute("aria-expanded")).toBe("false")
  search().focus()
  await keys("Enter")
  expect(status()).toBe("Searching flights to London Heathrow (LHR).")
})

test("keyboard: a newer search replaces a request that is still loading", async () => {
  await type("lis", 260)
  expect(loadStatus()).toBe("Searching airports…")
  await type("ath", 800)
  expect(options()).toEqual(["Athens (ATH)"])
  expect(loadStatus()).toBe("1 airport")
})

test("keyboard: Escape closes the list, and a word with no airport shows the empty message", async () => {
  await type("zzz")
  expect(options()).toEqual([])
  expect(root.querySelector("ui-autocomplete-empty span")!.textContent).toBe("zzz")
  expect(root.querySelector("ui-autocomplete-empty")!.hasAttribute("hidden")).toBe(false)
  await keys("Escape")
  expect(input().getAttribute("aria-expanded")).toBe("false")
})

test("keyboard: Search flights with text that is no airport asks for a choice and searches nothing", async () => {
  await type("Lis")
  search().focus()
  await keys("Enter")
  expect(status()).toBe("Choose an airport from the list first.")
})

test("agent: an agent sets the destination, waits for no list, and searches", async () => {
  const result = await agent.act({
    steps: [
      { ref: "Destination airport", action: "setValue", args: ["Lisbon (LIS)"] },
      { ref: "Search flights", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(input().value).toBe("Lisbon (LIS)")
  expect(status()).toBe("Searching flights to Lisbon (LIS).")
})

test("agent: the agent snapshot shows the destination as an autocomplete with its value", async () => {
  const entry = live().find((item) => item.label === "Destination airport")!
  expect(entry.component).toBe("autocomplete")
  expect(entry.actions).toContain("setValue")
  expect(entry.value).toBe("Lisbon (LIS)")
})
