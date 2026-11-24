import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A03-checkout"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const radios = () => [...root.querySelectorAll<HTMLElement>("ui-radio")]
const checked = () => radios().map((r) => r.getAttribute("aria-checked"))
const input = () => root.querySelector("input")!
const order = () => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Place order")!

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Shipping speed", "Tip amount", "Place order"]) expect(labels).toContain(label)
})

test("keyboard: the radio group is 1 tab stop, and the arrow keys move and check", async () => {
  await settle()
  const stops = tabbable(root).filter((el) => el.closest("ui-radio"))
  expect(stops).toHaveLength(1)
  expect(stops[0]).toBe(radios()[0])
  radios()[0].focus()
  await keys("ArrowDown")
  expect(checked()).toEqual(["false", "true", "false"])
  await keys("ArrowDown", "ArrowDown")
  expect(checked()).toEqual(["true", "false", "false"])
  await keys("ArrowUp")
  expect(checked()).toEqual(["false", "false", "true"])
  await keys("ArrowLeft")
  expect(checked()).toEqual(["false", "true", "false"])
})

test("keyboard: Space checks the focused radio", async () => {
  radios()[2].focus()
  await keys("Space")
  expect(checked()).toEqual(["false", "false", "true"])
})

test("keyboard: the arrow keys step the money by 1 cent, and Shift steps by 1 dollar", async () => {
  const field = input()
  expect(field.value).toBe("$5.00")
  field.focus()
  await keys("ArrowUp")
  expect(field.value).toBe("$5.01")
  await keys("ArrowDown", "ArrowDown")
  expect(field.value).toBe("$4.99")
  await keys("Shift+ArrowUp")
  expect(field.value).toBe("$5.99")
})

test("keyboard: typed text commits as money, and a value above the maximum is lowered", async () => {
  const field = input()
  field.focus()
  field.value = "7.5"
  field.dispatchEvent(new Event("input", { bubbles: true }))
  await keys("Enter")
  expect(field.value).toBe("$7.50")
  field.value = "500"
  field.dispatchEvent(new Event("input", { bubbles: true }))
  await keys("Enter")
  expect(field.value).toBe("$100.00")
})

test("keyboard: Enter on the Place order button reports the choice", async () => {
  radios()[1].focus()
  await keys("Space")
  const field = input()
  field.focus()
  field.value = "2"
  field.dispatchEvent(new Event("input", { bubbles: true }))
  await keys("Enter")
  order().focus()
  await keys("Enter")
  expect(status()).toBe("Ordered: Express shipping, tip $2.00, total $11.00.")
})

test("agent: an agent chooses a speed and sets the money, and the page reports them", async () => {
  const result = await agent.act({
    steps: [
      { ref: "Shipping speed", action: "setValue", args: ["overnight"] },
      { ref: "Tip amount", action: "setValue", args: [3.45] },
      { ref: "Place order", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(checked()).toEqual(["false", "false", "true"])
  expect(input().value).toBe("$3.45")
  expect(status()).toBe("Ordered: Overnight shipping, tip $3.45, total $27.45.")
})

test("agent: an agent steps the money by 1 cent with increment", async () => {
  const result = await agent.act({ steps: [{ ref: "Tip amount", action: "increment" }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(input().value).toBe("$3.46")
})
