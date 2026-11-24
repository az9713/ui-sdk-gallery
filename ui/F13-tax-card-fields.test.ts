import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./F13-tax-card-fields"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const entry = (label: string) => live().find((e) => e.label === label)!
const side = () => root.querySelector("[data-card]")!.getAttribute("data-side")
const face = (name: string) => root.querySelector(`[data-face-${name}]`)!.textContent
const button = (name: string) => root.querySelector<HTMLElement>(`[data-${name}] button`)!
const native = (name: string) => root.querySelector<HTMLInputElement>(`input[name=${name}]`)!

test("names: the bridge sees each field and both buttons by name", async () => {
  await settle()
  for (const e of live()) expect(e.label, `${e.component} ${e.ref} has no name`).toBeTruthy()
  expect(live().map((e) => e.label)).toEqual([
    "Business name",
    "Tax ID",
    "Card number",
    "Expiry",
    "Security code",
    "Save payment details",
    "Turn over",
  ])
  expect(root.querySelector("[data-taxid]")!.hasAttribute("data-agent-secret")).toBe(true)
  expect(status()).toBe("Nothing is saved.")
  expect(ui.task!.done(root)).toBe(false)
})

test("visual: the card picture is hidden from the bridge and starts on its front with placeholders", () => {
  expect(root.querySelector(".f13-scene")!.getAttribute("aria-hidden")).toBe("true")
  expect(side()).toBe("front")
  expect(face("number")).toBe("•••• •••• •••• ••••")
  expect(face("name")).toBe("Okafor Studio LLC")
  expect(face("expiry")).toBe("MM/YY")
  expect(face("cvc")).toBe("•••")
})

test("agent: a Save with empty fields lists what is missing and saves nothing", async () => {
  const result = await agent.act({ steps: [{ ref: "Save payment details", action: "press" }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe(
    "Not saved. Enter a 9-digit tax ID, a 16-digit card number, an expiry as MM/YY, a 3-digit security code.",
  )
})

test("agent: the agent fills the Tax ID and the card, and reads each value back as [redacted]", async () => {
  const result = await agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  for (const step of result.steps.slice(0, 4)) expect(step.changes?.[0].value).toBe("[redacted]")
  expect(result.values).toEqual({
    "c2 Business name": "Okafor Studio LLC",
    "c4 Tax ID": "[redacted]",
    "c6 Card number": "[redacted]",
    "c8 Expiry": "[redacted]",
    "c10 Security code": "[redacted]",
  })
  await settle()
  expect(entry("Business name").value).toBe("Okafor Studio LLC")
  for (const label of ["Tax ID", "Card number", "Expiry", "Security code"]) expect(entry(label).value).toBe("[redacted]")
  expect(JSON.stringify(agent.snapshot())).not.toMatch(/3456789|4242|09\/29|314/)
  expect(native("taxid").value).toBe("12-3456789")
  expect(status()).toBe("Saved for Okafor Studio LLC: tax ID on file, card ending 4242, expires 09/29.")
  expect(ui.task!.done(root)).toBe(true)
})

test("visual: the person's card picture shows what the agent filled", () => {
  expect(face("number")).toBe("4242 4242 4242 4242")
  expect(face("expiry")).toBe("09/29")
  expect(face("cvc")).toBe("314")
})

test("agent: the Business name has no mark, so its new value reaches the agent", async () => {
  const result = await agent.act({ steps: [{ ref: "Business name", action: "setValue", args: ["Okafor Design"] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(result.steps[0].changes?.[0].value).toBe("Okafor Design")
  expect(face("name")).toBe("Okafor Design")
})

test("agent: a Tax ID the bridge has seen as secret stays redacted after the mark is removed", async () => {
  root.querySelector("[data-taxid]")!.removeAttribute("data-agent-secret")
  const result = await agent.act({ steps: [{ ref: "Tax ID", action: "setValue", args: ["98-7654321"] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(result.steps[0].changes?.[0].value).toBe("[redacted]")
  expect(native("taxid").value).toBe("98-7654321")
  root.querySelector("[data-taxid]")!.setAttribute("data-agent-secret", "")
  await agent.act({ steps: [{ ref: "Tax ID", action: "setValue", args: ["12-3456789"] }] })
})

test("keyboard: Tab goes through the 5 fields, then Save and Turn over, 1 stop each", async () => {
  const stops = tabbable(root)
  expect(stops.map((el) => el.getAttribute("name") ?? el.textContent)).toEqual([
    "business",
    "taxid",
    "card",
    "expiry",
    "cvc",
    "Save payment details",
    "Turn over",
  ])
  native("business").focus()
  await keys("Tab", "Tab", "Tab", "Tab")
  expect(document.activeElement).toBe(native("cvc"))
})

test("keyboard: focus on the Security code turns the card to its back, and leaving turns it to the front", async () => {
  native("expiry").focus()
  await settle()
  expect(side()).toBe("front")
  await keys("Tab")
  expect(document.activeElement).toBe(native("cvc"))
  expect(side()).toBe("back")
  await keys("Shift+Tab")
  expect(side()).toBe("front")
})

test("keyboard: Enter and Space on Turn over turn the card over and back", async () => {
  button("flip").focus()
  await keys("Enter")
  expect(side()).toBe("back")
  await keys("Space")
  expect(side()).toBe("front")
})

test("keyboard: Enter on Save checks the fields again", async () => {
  native("cvc").value = "31"
  button("save").focus()
  await keys("Enter")
  expect(status()).toBe("Not saved. Enter a 3-digit security code.")
  native("cvc").value = "314"
  await keys("Space")
  expect(status()).toBe("Saved for Okafor Design: tax ID on file, card ending 4242, expires 09/29.")
})
