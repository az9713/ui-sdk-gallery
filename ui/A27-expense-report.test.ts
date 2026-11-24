import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A27-expense-report"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const log = () => [...root.querySelectorAll("[data-log] li")].map((li) => li.textContent)
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!
const toggle = () => root.querySelector("ui-toggle") as HTMLElement & { pressed: boolean }

test("markup: the server markup is not upgraded before it is on the page, and its state carries over", async () => {
  await settle()
  expect(log()).toEqual([
    "Server markup: 8 ui-sdk elements, 0 upgraded.",
    "Before upgrade, the native form reads: Taxi to airport, 42.50.",
    "After upgrade: 8 of 8 run. Billable is on, as the markup says.",
  ])
  expect(toggle().pressed).toBe(true)
  expect(button("Billable").getAttribute("aria-pressed")).toBe("true")
  expect(root.querySelector<HTMLInputElement>("input[name=item]")!.value).toBe("Taxi to airport")
  expect(status()).toBe("The report is not submitted.")
})

test("names: each control has the name that the page shows", () => {
  expect(live().map((entry) => entry.label)).toEqual(["Expense item", "Amount in EUR", "Billable", "Submit report"])
  expect(live().find((entry) => entry.label === "Billable")).toMatchObject({ component: "toggle", pressed: true })
})

test("keyboard: Tab reaches the 4 controls in order, Space turns Billable off, and Enter submits", async () => {
  const stops = tabbable(root)
  expect(stops.map((el) => el.getAttribute("name") ?? el.textContent)).toEqual(["item", "amount", "Billable", "Submit report"])
  stops[1].focus()
  await keys("Tab")
  expect(document.activeElement).toBe(button("Billable"))
  await keys("Space")
  expect(button("Billable").getAttribute("aria-pressed")).toBe("false")
  await keys("Tab")
  expect(document.activeElement).toBe(button("Submit report"))
  await keys("Enter")
  expect(status()).toBe("Submitted: Taxi to airport, 42.50 EUR, not billable.")
  button("Billable").focus()
  await keys("Enter")
  expect(toggle().pressed).toBe(true)
})

test("agent: an agent fills the upgraded form, turns Billable off, and submits", async () => {
  const result = await agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(root.querySelector<HTMLInputElement>("input[name=amount]")!.value).toBe("96.00")
  expect(status()).toBe("Submitted: Hotel night, 96.00 EUR, not billable.")
  expect(ui.task!.done(root)).toBe(true)
})
