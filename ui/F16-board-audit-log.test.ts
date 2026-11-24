import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./F16-board-audit-log"

const { root, agent, person, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent ?? ""
const note = () => root.querySelector("[data-note]")!.textContent
const items = () => [...root.querySelectorAll("[data-entries] li")]
const item = (text: string) => items().find((li) => li.textContent!.includes(text))
const lanes = (lane: string) => [...root.querySelectorAll(`[data-mark][data-lane="${lane}"]`)].map((m) => m.getAttribute("data-state"))
const value = (label: string) => {
  const entry = live().find((e) => e.label === label)!
  return entry.component === "switch" ? entry.checked : entry.value
}
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("ui-button button")].find((b) => b.textContent === name)!
const press = async (name: string) => {
  button(name).focus()
  await keys("Enter")
}
// History restores and staging run through the bridge's act, which takes several timer turns in jsdom.
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 10))
  await settle()
}

test("names: the seeded session fills both lanes, and each control has its name", async () => {
  await until(() => status().includes("edits since"))
  expect(status()).toBe("5 edits since 14:00. No edit is undone.")
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  // src/setup.ts stubs checkVisibility, so jsdom also lists the hidden Keep and Discard buttons.
  expect(live().map((e) => e.label)).toEqual([
    "Note text",
    "Fill color",
    "Connector",
    "Snap to grid",
    "Undo last edit",
    "Undo agent edits",
    "Preview suggestion",
    "Keep suggestion",
    "Discard suggestion",
  ])
  expect(root.querySelector("[data-keep]")!.hasAttribute("hidden")).toBe(true)
  expect(items().map((li) => li.textContent)).toEqual([
    "14:11Mara set Fill color to Yellow",
    "14:09Agent set Snap to grid to on",
    "14:07Mara set Note text to Checkout flow",
    "14:04Agent set Connector to Elbow",
    "14:02Mara set Fill color to Blue",
  ])
  expect(lanes("person")).toEqual(["applied", "applied", "applied"])
  expect(lanes("agent")).toEqual(["applied", "applied"])
  expect(root.querySelector("[data-swimlane]")!.getAttribute("aria-hidden")).toBe("true")
  expect([...root.querySelectorAll("[data-ticks] span")].map((s) => s.textContent)).toEqual(["14:00", "14:05", "14:10", "14:15", "14:20"])
  expect(note()).toBe("Checkout flow")
  expect(root.querySelector("[data-connector]")!.getAttribute("d")).toBe("M134,58L276,58L276,140")
  expect(ui.task!.done(root)).toBe(false)
})

test("agent: the task's edits go on the Agent lane, and observe writes each one to the status line", async () => {
  const result = await agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  await settle()
  expect(ui.task!.done(root)).toBe(true)
  expect(status()).toBe("Agent set Fill color to Pink.")
  expect(item("Checkout v2")!.getAttribute("data-lane")).toBe("agent")
  expect(lanes("agent")).toEqual(["applied", "applied", "applied", "applied"])
  expect(note()).toBe("Checkout v2")
  expect(person.asked).toEqual([])
})

test("keyboard: Space on Snap to grid is Mara's edit, on the Mara lane", async () => {
  const snap = root.querySelector<HTMLElement>("ui-switch")!
  snap.focus()
  await keys("Space")
  expect(snap.getAttribute("aria-checked")).toBe("false")
  expect(status()).toBe("Mara set Snap to grid to off.")
  expect(items()[0]!.textContent).toBe("14:12Mara set Snap to grid to off")
  expect(items()[0]!.getAttribute("data-lane")).toBe("person")
  expect(lanes("person")).toHaveLength(4)
})

test("keyboard: Enter on Undo agent edits puts back each agent value and keeps Mara's later edits", async () => {
  await press("Undo agent edits")
  await until(() => status().startsWith("Undid"))
  expect(status()).toBe("Undid 4 agent edits. Mara's edits stay.")
  expect(value("Note text")).toBe("Checkout flow")
  expect(value("Fill color")).toBe("yellow")
  expect(value("Connector")).toBe("straight")
  expect(value("Snap to grid")).toBe(false)
  expect(note()).toBe("Checkout flow")
  expect(lanes("agent")).toEqual(["reverted", "reverted", "reverted", "reverted"])
  expect(lanes("person")).toEqual(["applied", "applied", "applied", "applied"])
  expect(item("Checkout v2")!.getAttribute("data-state")).toBe("reverted")
})

test("keyboard: Enter on Undo last edit steps back over Mara's last edit", async () => {
  await press("Undo last edit")
  await until(() => status().startsWith("Undid:"))
  expect(status()).toBe("Undid: Mara set Snap to grid to off.")
  expect(item("Snap to grid to off")!.getAttribute("data-state")).toBe("undone")
  expect(lanes("person").at(-1)).toBe("undone")
})

test("keyboard: Preview suggestion puts it on the board, and Discard suggestion takes it back", async () => {
  const before = { text: value("Note text"), fill: value("Fill color"), connector: value("Connector") }
  await press("Preview suggestion")
  await until(() => status().startsWith("Preview"))
  expect(status()).toBe("Preview: the agent's suggestion puts 3 edits on the board. Keep it or discard it.")
  expect(note()).toBe("Checkout: 3 steps")
  expect(value("Fill color")).toBe("green")
  expect(value("Connector")).toBe("curved")
  expect(root.querySelector("[data-board]")!.hasAttribute("data-staged")).toBe(true)
  expect(lanes("agent").filter((s) => s === "preview")).toHaveLength(3)
  expect(root.querySelector("[data-preview]")!.hasAttribute("hidden")).toBe(true)
  expect(root.querySelector("[data-keep]")!.hasAttribute("hidden")).toBe(false)

  await press("Discard suggestion")
  await until(() => status().startsWith("Discarded"))
  expect(status()).toBe("Discarded the agent's suggestion. The note is as it was before the preview.")
  expect({ text: value("Note text"), fill: value("Fill color"), connector: value("Connector") }).toEqual(before)
  expect(root.querySelector("[data-board]")!.hasAttribute("data-staged")).toBe(false)
  expect(lanes("agent")).toEqual(Array(7).fill("reverted"))
  expect(root.querySelector("[data-preview]")!.hasAttribute("hidden")).toBe(false)
})

test("agent: an agent can preview its suggestion, but Keep suggestion waits for Mara", async () => {
  const previewed = await agent.act({ steps: [{ ref: "Preview suggestion", action: "press" }] })
  expect(previewed.ok, previewed.error?.message).toBe(true)
  await until(() => status().startsWith("Preview"))
  expect(note()).toBe("Checkout: 3 steps")

  const keep = { steps: [{ ref: "Keep suggestion", action: "press" }] }
  const refused = await agent.act(keep)
  expect(refused.ok).toBe(false)
  expect(person.asked).toEqual(["Keeps 3 agent edits"])
  expect(status()).toBe("Preview: the agent's suggestion puts 3 edits on the board. Keep it or discard it.")

  person.approves = true
  const kept = await agent.act(keep)
  expect(kept.ok, kept.error?.message).toBe(true)
  await settle()
  expect(status()).toBe("Kept the agent's suggestion: 3 edits.")
  expect(lanes("agent").slice(-3)).toEqual(["applied", "applied", "applied"])
  expect(value("Fill color")).toBe("green")
  person.approves = false
})

test("agent: Undo agent edits turns Snap to grid off again after the agent turns it on", async () => {
  const on = await agent.act({ steps: [{ ref: "Snap to grid", action: "setChecked", args: [true] }] })
  expect(on.ok, on.error?.message).toBe(true)
  expect(value("Snap to grid")).toBe(true)
  await press("Undo agent edits")
  await until(() => status().startsWith("Undid"))
  expect(status()).toBe("Undid 4 agent edits. Mara's edits stay.")
  expect(value("Snap to grid")).toBe(false)
  expect(value("Fill color")).not.toBe("green")
  expect(lanes("agent").every((state) => state !== "applied")).toBe(true)
})

test("keyboard: an undo waits while a preview is on the board, because Discard would bring the values back", async () => {
  await press("Preview suggestion")
  await until(() => status().startsWith("Preview"))
  await press("Undo agent edits")
  expect(status()).toBe("Keep or discard the suggestion first.")
  await press("Undo last edit")
  expect(status()).toBe("Keep or discard the suggestion first.")
  expect(value("Fill color")).toBe("green")
  await press("Discard suggestion")
  await until(() => status().startsWith("Discarded"))
  expect(value("Fill color")).not.toBe("green")
})

test("keyboard: after a discard, Undo last edit skips the discarded preview and the hidden restores", async () => {
  expect(items().filter((li) => li.getAttribute("data-state") === "applied")).toHaveLength(0)
  await press("Undo last edit")
  await until(() => status().startsWith("Undid:"))
  expect(status()).toBe("Undid: Mara set Fill color to Yellow.")
  expect(value("Fill color")).toBe("blue")
  expect(value("Fill color")).not.toBe("green")
  expect(note()).not.toBe("Checkout: 3 steps")
})
