import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./F12-pay-button"

const { root, agent, person, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const payButton = () => root.querySelector<HTMLElement>("[data-pay] button")!
const kinds = (kind: string) => root.querySelectorAll(`[data-seats] [data-kind="${kind}"]`)

test("names: the bridge sees Tickets and the Pay button, and Pay asks the person", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const labels = live().map((entry) => entry.label)
  expect(labels).toContain("Tickets")
  expect(labels).toContain("Pay $105.00")
  expect(live().find((entry) => entry.label === "Pay $105.00")!.confirm).toBe("Charges $105.00 to Visa 4242")
  expect(status()).toBe("2 tickets: Row F, seats 7 and 8. Total $105.00. Not paid.")
  expect(ui.task!.done(root)).toBe(false)
})

test("visual: the seat block is hidden from the bridge and marks the chosen seats in row F", () => {
  const svg = root.querySelector("[data-seatmap]")!
  expect(svg.getAttribute("aria-hidden")).toBe("true")
  expect(root.querySelectorAll("[data-seats] rect")).toHaveLength(8 * 14)
  expect([...kinds("picked")].map((seat) => seat.getAttribute("data-seat"))).toEqual(["F7", "F8"])
  expect(kinds("taken").length).toBeGreaterThan(20)
  expect(root.querySelector("[data-admit]")!.textContent).toBe("Admit 2")
})

test("agent: the Pay step waits for the person; a Deny pays nothing and an Allow pays", async () => {
  const refused = await agent.act({ steps: ui.task!.steps })
  expect(refused.ok).toBe(false)
  expect(refused.error?.step).toBe(1)
  expect(person.asked).toEqual(["Charges $157.50 to Visa 4242"])
  expect(status()).toBe("3 tickets: Row F, seats 7, 8 and 9. Total $157.50. Not paid.")
  expect([...kinds("picked")].map((seat) => seat.getAttribute("data-seat"))).toEqual(["F7", "F8", "F9"])

  person.approves = true
  const done = await agent.act({ steps: ui.task!.steps })
  expect(done.ok, done.error?.message).toBe(true)
  expect(person.asked).toHaveLength(2)
  expect(status()).toBe("Paid $157.50 with Visa 4242 for 3 tickets: Row F, seats 7, 8 and 9.")
  expect(ui.task!.done(root)).toBe(true)
  person.approves = false
})

test("agent: the confirm text follows the count", async () => {
  const set = await agent.act({ steps: [{ ref: "Tickets", action: "setValue", args: ["1"] }] })
  expect(set.ok, set.error?.message).toBe(true)
  await settle()
  expect(live().find((entry) => entry.label === "Pay $52.50")!.confirm).toBe("Charges $52.50 to Visa 4242")
  expect(status()).toBe("1 ticket: Row F, seat 7. Total $52.50. Not paid.")
})

test("keyboard: Enter on Pay pays with no prompt, because the person pressed it", async () => {
  payButton().focus()
  await keys("Enter")
  expect(status()).toBe("Paid $52.50 with Visa 4242 for 1 ticket: Row F, seat 7.")
  expect(person.asked).toHaveLength(2)
})

test("keyboard: Space on Pay pays too", async () => {
  await agent.act({ steps: [{ ref: "Tickets", action: "setValue", args: ["4"] }] })
  payButton().focus()
  await keys("Space")
  expect(status()).toBe("Paid $210.00 with Visa 4242 for 4 tickets: Row F, seats 7, 8, 9 and 10.")
  expect(person.asked).toHaveLength(2)
})
