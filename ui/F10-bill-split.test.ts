import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./F10-bill-split"

const { root, agent, live } = mountUI(ui)
type Api = HTMLElement & { value: string; api: { setValue(v: string): boolean } }
const select = () => root.querySelector("ui-select") as Api
const custom = () => root.querySelector("ui-input") as Api
const status = () => root.querySelector("[data-status]")!.textContent
const legend = () => [...root.querySelectorAll("[data-person]")].map((li) => li.textContent)
const pie = () => [...root.querySelectorAll("[data-pie] path")].map((p) => p.getAttribute("d"))

const reset = () => agent.act({ steps: [{ ref: "c2", action: "setValue", args: ["18"] }] })

const AT_18 = "Tip $19.26 (18%). Total $134.82: Ana $28.58, Ben $51.26, Chloe $24.80, Dev $30.18."
const AT_20 = "Tip $21.40 (20%). Total $136.96: Ana $29.11, Ben $51.79, Chloe $25.33, Dev $30.73."
const AT_15 = "Tip $16.05 (15%). Total $131.61: Ana $27.77, Ben $50.45, Chloe $23.99, Dev $29.40."
const CUSTOM_12 = "Tip $12.00 (custom). Total $127.56: Ana $26.76, Ben $49.44, Chloe $22.98, Dev $28.38."
const COLLISION = '"Tip" names 2 components: c2 Tip, c4 Custom tip. Use a ref.'

test("names: Tip and Custom tip are the 2 controls, with refs c2 and c4", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  expect(live().map((e) => [e.ref, e.component, e.label])).toEqual([
    ["c2", "select", "Tip"],
    ["c4", "input", "Custom tip"],
  ])
  expect(status()).toBe(AT_18)
  expect(legend()).toEqual(["Ana$28.5821%", "Ben$51.2638%", "Chloe$24.8018%", "Dev$30.1822%"])
  expect(pie()).toHaveLength(4)
  expect(ui.task!.done(root)).toBe(false)
})

test("keyboard: the receipt has 2 tab stops, the Tip trigger and the Custom tip field", () => {
  const stops = tabbable(root)
  expect(stops).toHaveLength(2)
  expect(stops[0]!.closest("ui-select-trigger")).not.toBeNull()
  expect(stops[1]!.closest("ui-input")).not.toBeNull()
})

test("keyboard: Enter opens the Tip list, ArrowDown and Enter choose 20%, and the pie and the status follow", async () => {
  const before = pie()
  root.querySelector<HTMLElement>("ui-select-trigger button")!.focus()
  await keys("Enter", "ArrowDown", "Enter")
  expect(select().value).toBe("20")
  expect(status()).toBe(AT_20)
  expect(root.querySelector("[data-tip]")!.textContent).toBe("$21.40 (20%)")
  expect(root.querySelector("[data-total]")!.textContent).toBe("$136.96")
  expect(pie()).not.toEqual(before)
  await reset()
  expect(status()).toBe(AT_18)
})

test("keyboard: a custom tip replaces the percent, a wrong amount is refused, and an empty field gives the percent back", async () => {
  custom().api.setValue("12")
  await settle()
  expect(status()).toBe(CUSTOM_12)
  expect(root.querySelector("[data-tip]")!.textContent).toBe("$12.00 (custom)")
  custom().api.setValue("lots")
  await settle()
  expect(status()).toBe("Write the custom tip as an amount, like 12.50.")
  custom().api.setValue("")
  await settle()
  expect(status()).toBe(AT_18)
})

test("agent: the label Tip names 2 components, and the error lists each match with its ref", async () => {
  const result = await agent.act({ steps: [{ ref: "Tip", action: "setValue", args: ["20%"] }] })
  expect(result.ok).toBe(false)
  expect(result.error?.step).toBe(0)
  expect(result.error?.message).toContain(COLLISION)
  expect(select().value).toBe("18")
  expect(status()).toBe(AT_18)
})

test("agent: a step by ref chooses 15% on the Tip select, and Custom tip by its label is not a collision", async () => {
  const result = await agent.act({
    steps: [
      { ref: "c2", action: "setValue", args: ["15%"] },
      { ref: "Custom tip", action: "setValue", args: [""] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(result.steps.map((s) => s.ref)).toEqual(["c2", "c4"])
  expect(status()).toBe(AT_15)
  await reset()
})

test("agent: the task sets the custom tip by ref c4, then stops at the refused Tip step, and done reads both", async () => {
  expect(ui.task!.person).toBe("deny")
  const result = await agent.act({ steps: ui.task!.steps })
  expect(result.ok).toBe(false)
  expect(result.error?.step).toBe(1)
  expect(result.error?.message).toContain(COLLISION)
  expect(result.steps.map((s) => s.ref)).toEqual(["c4"])
  expect(status()).toBe(CUSTOM_12)
  expect(select().value).toBe("18")
  expect(ui.task!.done(root)).toBe(false)
  // The shell writes the error of the task to its outcome line; done reads it there.
  const outcome = document.body.appendChild(Object.assign(document.createElement("span"), { className: "g-outcome" }))
  outcome.textContent = `Stopped: ${result.error?.message}`
  expect(ui.task!.done(root)).toBe(true)
  outcome.remove()
})
