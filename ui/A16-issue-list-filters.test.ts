import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./A16-issue-list-filters"

const { root, agent, live } = mountUI(ui)
const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!
const status = () => q("[data-status]").textContent
const combobox = () => q<HTMLElement & { value: string[]; api: { setValue(value: string[]): boolean } }>("ui-combobox")
const input = () => q<HTMLInputElement>("ui-combobox-input input")
const content = () => q("ui-combobox-content")
const items = () => [...root.querySelectorAll<HTMLElement>("ui-combobox-item")]
const options = () => items().filter((item) => !item.hidden).map((item) => item.getAttribute("value"))
const highlighted = () => items().filter((item) => item.hasAttribute("data-highlighted")).map((item) => item.getAttribute("value"))
const chips = () => [...root.querySelectorAll("ui-combobox-chip")].map((chip) => chip.getAttribute("value"))
const issues = () => [...root.querySelectorAll<HTMLElement>("[data-issues] li")].filter((row) => !row.hidden).map((row) => row.firstElementChild!.textContent)

async function search(text: string) {
  input().value = text
  input().dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
}

test("names: each control has the name that the page shows", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  expect(live().map((entry) => entry.label)).toContain("Filter by label")
  expect(q("ui-combobox-label").textContent).toBe("Filter by label")
  expect(q("ui-combobox-trigger button").getAttribute("aria-label")).toBe("Show all labels")
  expect(input().getAttribute("aria-disabled")).toBeNull()
  expect(items()).toHaveLength(10)
})

test("keyboard: the filter is 1 tab stop, and typing opens the list with the labels that match", async () => {
  expect(issues()).toHaveLength(11)
  expect(status()).toBe("Showing all 11 issues.")
  const stops = [...root.querySelectorAll<HTMLElement>("input, button, [tabindex]")].filter((el) => el.tabIndex >= 0 && !el.closest("[hidden]"))
  expect(stops).toEqual([input()])
  input().focus()
  expect(input().getAttribute("role")).toBe("combobox")
  expect(input().getAttribute("aria-expanded")).toBe("false")
  await search("sec")
  expect(content().hidden).toBe(false)
  expect(input().getAttribute("aria-expanded")).toBe("true")
  expect(options()).toEqual(["Security"])
  await search("zzz")
  expect(options()).toEqual([])
  expect(q("ui-combobox-empty").hidden).toBe(false)
  await search("")
  await keys("Escape")
  expect(content().hidden).toBe(true)
})

test("keyboard: ArrowDown and ArrowUp move the highlight, and Enter chooses a label and keeps the list open", async () => {
  input().focus()
  await keys("ArrowDown")
  expect(content().hidden).toBe(false)
  const down: (string | null)[] = []
  for (let i = 0; i < 3; i++) {
    await keys("ArrowDown")
    down.push(highlighted()[0])
  }
  const up: (string | null)[] = []
  await keys("ArrowUp")
  up.push(highlighted()[0])
  expect(down).toHaveLength(3)
  expect(up[0]).toBe(down[1])
  expect(highlighted()).toHaveLength(1)
  await keys("Enter")
  expect(chips()).toEqual([up[0]])
  expect(content().hidden).toBe(false)
  expect(items().find((item) => item.getAttribute("value") === up[0])!.getAttribute("aria-selected")).toBe("true")
  expect(status()).toContain(`labeled ${up[0]}`)
  await keys("Escape")
  combobox().api.setValue([])
  await settle()
})

test("keyboard: choosing 2 labels narrows the list to the issues that have both, and Backspace removes the last chip", async () => {
  input().focus()
  await search("bug")
  await keys("ArrowDown", "Enter")
  expect(chips()).toEqual(["Bug"])
  expect(input().value).toBe("")
  expect(issues()).toHaveLength(5)
  await search("sec")
  await keys("ArrowDown", "Enter")
  expect(chips()).toEqual(["Bug", "Security"])
  expect(issues()).toEqual(["Login fails after a password reset", "An access token appears in the debug log"])
  expect(status()).toBe("Showing 2 of 11 issues labeled Bug and Security.")
  await keys("Escape")
  input().focus()
  await keys("Backspace")
  expect(chips()).toEqual(["Bug"])
  expect(issues()).toHaveLength(5)
  expect(status()).toBe("Showing 5 of 11 issues labeled Bug.")
  await keys("Backspace")
  expect(chips()).toEqual([])
  expect(status()).toBe("Showing all 11 issues.")
})

test("keyboard: a label that no issue shares with the others leaves an empty list and a status that says so", async () => {
  combobox().api.setValue(["Documentation", "Mobile"])
  await settle()
  expect(issues()).toEqual([])
  expect(status()).toBe("Showing 0 of 11 issues labeled Documentation and Mobile.")
  combobox().api.setValue([])
  await settle()
  expect(issues()).toHaveLength(11)
})

test("agent: an agent finds the labels, chooses 2 and gets the filtered list", async () => {
  const found = agent.snapshot().find((entry) => entry.label === "Filter by label")!
  expect(found.actions).toContain("setValue")
  const result = await agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(combobox().value).toEqual(["Bug", "Security"])
  expect(chips()).toEqual(["Bug", "Security"])
  expect(status()).toBe("Showing 2 of 11 issues labeled Bug and Security.")
  expect(ui.task!.done(root)).toBe(true)
  const cleared = await agent.act({ steps: [{ ref: "Filter by label", action: "setValue", args: [[]] }] })
  expect(cleared.ok, cleared.error?.message).toBe(true)
  expect(status()).toBe("Showing all 11 issues.")
})
