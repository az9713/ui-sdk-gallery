import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A17-request-trace-viewer"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const detail = () => root.querySelector("[data-detail]")!.textContent
const row = (value: string) => root.querySelector<HTMLElement>(`ui-waterfall-row[value="${value}"]`)!
const focused = () => (document.activeElement as HTMLElement).getAttribute("value")
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!

test("names: each control has the name that the page shows, and each bar tells its times", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const labels = live().map((entry) => entry.label)
  for (const label of ["Checkout trace", "Expand all spans", "Collapse all spans"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(root.querySelector("ui-waterfall")!.getAttribute("role")).toBe("treegrid")
  expect(row("checkout").querySelector("ui-waterfall-bar")!.getAttribute("aria-label")).toBe("4 kB, starts at 0ms, takes 920ms")
  expect(button("Expand all spans").getAttribute("aria-disabled")).toBeNull()
})

test("keyboard: the trace is 1 tab stop, and only the top span shows at first", async () => {
  expect(row("checkout").getAttribute("aria-expanded")).toBe("true")
  expect(row("auth").hidden).toBe(false)
  expect(row("cart").getAttribute("aria-expanded")).toBe("false")
  expect(row("cart-db").hidden).toBe(true)
  const stops = tabbable(root.querySelector("ui-waterfall")!)
  expect(stops).toEqual([row("checkout")])
  row("checkout").focus()
  await keys("Tab")
  expect(document.activeElement).not.toBe(row("auth"))
})

test("keyboard: ArrowDown and ArrowUp move through the shown spans, and Home and End go to the ends", async () => {
  row("checkout").focus()
  await keys("ArrowDown")
  expect(focused()).toBe("auth")
  await keys("ArrowDown", "ArrowDown")
  expect(focused()).toBe("payment")
  await keys("ArrowUp")
  expect(focused()).toBe("cart")
  await keys("End")
  expect(focused()).toBe("email")
  await keys("Home")
  expect(focused()).toBe("checkout")
})

test("keyboard: ArrowRight opens a span, ArrowLeft closes it and then goes to the parent", async () => {
  row("cart").focus()
  await keys("ArrowRight")
  expect(row("cart").getAttribute("aria-expanded")).toBe("true")
  expect(row("cart-db").hidden).toBe(false)
  await keys("ArrowDown")
  expect(focused()).toBe("cart-db")
  await keys("ArrowLeft")
  expect(focused()).toBe("cart")
  await keys("ArrowLeft")
  expect(row("cart").getAttribute("aria-expanded")).toBe("false")
  expect(row("cart-db").hidden).toBe(true)
  expect(focused()).toBe("cart")
})

test("keyboard: Enter and Space select a span, and the line tells when it starts and how long it takes", async () => {
  row("auth").focus()
  await keys("Enter")
  expect(row("auth").getAttribute("aria-selected")).toBe("true")
  expect(status()).toBe("Selected: auth.verify")
  expect(detail()).toBe("auth.verify starts at 12 ms and takes 64 ms, 1 kB.")
  row("email").focus()
  await keys("Space")
  expect(row("email").getAttribute("aria-selected")).toBe("true")
  expect(row("auth").getAttribute("aria-selected")).toBeNull()
  expect(detail()).toBe("email.enqueue starts at 880 ms and takes 30 ms, 1 kB.")
})

test("keyboard: Enter on Expand all spans opens each span, and Collapse all spans closes them", async () => {
  button("Expand all spans").focus()
  await keys("Enter")
  for (const value of ["checkout", "cart", "payment"]) expect(row(value).getAttribute("aria-expanded"), value).toBe("true")
  expect(row("gateway").hidden).toBe(false)
  button("Collapse all spans").focus()
  await keys("Enter")
  for (const value of ["checkout", "cart", "payment"]) expect(row(value).getAttribute("aria-expanded"), value).toBe("false")
  expect(row("auth").hidden).toBe(true)
})

test("agent: an agent expands the spans and selects a span that was hidden", async () => {
  await settle()
  const result = await agent.act({
    steps: [
      { ref: "Collapse all spans", action: "press" },
      { ref: "Checkout trace", action: "setValue", args: ["gateway.capture"] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Selected: gateway.capture")
  expect(detail()).toBe("gateway.capture starts at 540 ms and takes 310 ms, 2 kB.")
  expect(row("payment").getAttribute("aria-expanded")).toBe("true")
  expect(row("gateway").hidden).toBe(false)
  expect(row("gateway").getAttribute("aria-selected")).toBe("true")
})

test("agent: a span that is not in the trace changes nothing on the page", async () => {
  const result = await agent.act({ steps: [{ ref: "Checkout trace", action: "setValue", args: ["nope.span"] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(detail()).toBe("gateway.capture starts at 540 ms and takes 310 ms, 2 kB.")
  expect(status()).toBe("Selected: gateway.capture")
})
