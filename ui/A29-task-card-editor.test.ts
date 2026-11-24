import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./A29-task-card-editor"

const { root, agent, person, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const chips = () => [...root.querySelectorAll("[data-chips] li")].map((li) => li.textContent)
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!
const title = () => root.querySelector("ui-input") as HTMLElement & { api: { setValue: (value: string) => void } }
const box = (name: string) => root.querySelector<HTMLElement>(`ui-checkbox[name=${name}]`)!
const shown = (selector: string) => {
  const el = root.querySelector(selector)
  return !!el && el.isConnected && !el.hasAttribute("hidden")
}
// The 4 layers, from the bottom: the dialog, the labels popover, the nested popover, the confirm.
const layers = () => ({
  dialog: shown("ui-dialog-content"),
  labels: shown("[data-layer=labels]"),
  manage: shown("[data-layer=manage]"),
  confirm: shown("[data-host] ui-alert-dialog-content"),
})
const press = async (name: string) => {
  button(name).focus()
  await keys("Enter")
  await settle()
}
const openAll = async () => {
  await press("Edit card")
  await press("Labels")
  await press("Manage labels")
  await press("Clear board labels")
}

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Edit task card", "Card title", "Card labels", "Bug", "Docs", "Urgent", "Manage labels", "Clear board labels", "Save card"])
    expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(root.querySelector("[data-card-title]")!.textContent).toBe("Write release notes")
  expect(chips()).toEqual(["Bug"])
  expect(layers()).toEqual({ dialog: false, labels: false, manage: false, confirm: false })
  expect(button("Save card").getAttribute("aria-disabled")).toBeNull()
})

test("keyboard: Enter opens the 4 layers in order, and focus goes into each new layer", async () => {
  await press("Edit card")
  expect(layers()).toEqual({ dialog: true, labels: false, manage: false, confirm: false })
  expect(document.activeElement).toBe(root.querySelector("input"))
  await press("Labels")
  expect(layers()).toEqual({ dialog: true, labels: true, manage: false, confirm: false })
  expect(document.activeElement).toBe(box("Bug"))
  await press("Manage labels")
  expect(layers()).toEqual({ dialog: true, labels: true, manage: true, confirm: false })
  expect(document.activeElement).toBe(button("Clear board labels"))
  await press("Clear board labels")
  expect(layers()).toEqual({ dialog: true, labels: true, manage: true, confirm: true })
  expect(document.activeElement).toBe(button("Keep labels"))
  expect(root.querySelector("[data-host] ui-alert-dialog-content")!.getAttribute("role")).toBe("alertdialog")
  await keys("Escape", "Escape", "Escape", "Escape")
})

test("keyboard: Escape closes 1 layer each time, from the top, and focus goes back to the trigger of that layer", async () => {
  await openAll()
  await keys("Escape")
  expect(layers()).toEqual({ dialog: true, labels: true, manage: true, confirm: false })
  expect(document.activeElement).toBe(button("Clear board labels"))
  await keys("Escape")
  expect(layers()).toEqual({ dialog: true, labels: true, manage: false, confirm: false })
  expect(document.activeElement).toBe(button("Manage labels"))
  await keys("Escape")
  expect(layers()).toEqual({ dialog: true, labels: false, manage: false, confirm: false })
  expect(document.activeElement).toBe(button("Labels"))
  await keys("Escape")
  expect(layers()).toEqual({ dialog: false, labels: false, manage: false, confirm: false })
  expect(document.activeElement).toBe(button("Edit card"))
  expect(chips()).toEqual(["Bug"])
  expect(status()).toBe("No change is saved.")
})

test("keyboard: Keep labels closes only the confirm and removes nothing", async () => {
  await openAll()
  await press("Keep labels")
  expect(layers()).toEqual({ dialog: true, labels: true, manage: true, confirm: false })
  expect(document.activeElement).toBe(button("Clear board labels"))
  expect(box("Bug").getAttribute("aria-checked")).toBe("true")
  expect(chips()).toEqual(["Bug"])
  await keys("Escape", "Escape", "Escape")
  expect(layers().dialog).toBe(false)
})

test("keyboard: Space changes each label, and Save card shows the title and the labels on the card", async () => {
  await press("Edit card")
  await press("Labels")
  for (const name of ["Bug", "Docs", "Urgent"]) {
    box(name).focus()
    await keys("Space")
  }
  expect(box("Bug").getAttribute("aria-checked")).toBe("false")
  expect(box("Docs").getAttribute("aria-checked")).toBe("true")
  expect(box("Urgent").getAttribute("aria-checked")).toBe("true")
  await keys("Escape")
  title().api.setValue("Ship release notes")
  await press("Save card")
  expect(layers()).toEqual({ dialog: false, labels: false, manage: false, confirm: false })
  expect(status()).toBe("Saved: Ship release notes, labels Docs, Urgent.")
  expect(root.querySelector("[data-card-title]")!.textContent).toBe("Ship release notes")
  expect(chips()).toEqual(["Docs", "Urgent"])
})

test("keyboard: Cancel closes the dialog without a save, and the next open shows the saved card", async () => {
  await press("Edit card")
  await press("Labels")
  box("Bug").focus()
  await keys("Space")
  expect(box("Bug").getAttribute("aria-checked")).toBe("true")
  await keys("Escape")
  title().api.setValue("A draft title")
  await press("Cancel")
  expect(layers().dialog).toBe(false)
  expect(document.activeElement).toBe(button("Edit card"))
  expect(chips()).toEqual(["Docs", "Urgent"])
  expect(root.querySelector("[data-card-title]")!.textContent).toBe("Ship release notes")
  await press("Edit card")
  expect(root.querySelector("input")!.value).toBe("Ship release notes")
  expect(live().find((entry) => entry.label === "Card title")!.value).toBe("Ship release notes")
  expect(box("Bug").getAttribute("aria-checked")).toBe("false")
  await keys("Escape")
})

test("keyboard: Save card with an empty title saves nothing, keeps the dialog open and puts focus on the title", async () => {
  await press("Edit card")
  title().api.setValue("")
  await press("Save card")
  expect(status()).toBe("Not saved: the card needs a title.")
  expect(layers().dialog).toBe(true)
  expect(document.activeElement).toBe(root.querySelector("input"))
  expect(root.querySelector("input")!.validity.valueMissing).toBe(true)
  expect(root.querySelector("[data-card-title]")!.textContent).toBe("Ship release notes")
  await keys("Escape")
})

test("keyboard: Remove labels in the confirm removes each label from the card and the board", async () => {
  await openAll()
  await press("Remove labels")
  expect(layers()).toEqual({ dialog: true, labels: true, manage: true, confirm: false })
  expect(status()).toBe("Removed each label from the board.")
  expect(chips()).toEqual([])
  for (const name of ["Bug", "Docs", "Urgent"]) expect(box(name).getAttribute("aria-checked")).toBe("false")
  await keys("Escape", "Escape", "Escape")
  expect(layers().dialog).toBe(false)
})

test("agent: an agent goes through the 4 layers, and the confirm waits for the person", async () => {
  const steps = ui.task!.steps
  const cut = steps.findIndex((s) => s.ref === "Remove each label from the board?")
  const before = await agent.act({ steps: steps.slice(0, cut) })
  expect(before.ok, before.error?.message).toBe(true)
  expect(layers()).toEqual({ dialog: true, labels: true, manage: true, confirm: true })

  const refused = await agent.act({ steps: [steps[cut]] })
  expect(refused.ok).toBe(false)
  expect(person.asked).toEqual(["Removes each label from every card on the board"])
  expect(layers().confirm).toBe(true)
  // The mark is on a wrapper of the host, so it also covers the Keep labels answer.
  const keep = await agent.act({ steps: [{ ref: steps[cut].ref, action: "press", args: ["Keep labels"] }] })
  expect(keep.ok).toBe(false)
  expect(person.asked).toHaveLength(2)
  expect(layers().confirm).toBe(true)

  person.approves = true
  const after = await agent.act({ steps: steps.slice(cut) })
  expect(after.ok, after.error?.message).toBe(true)
  expect(ui.task!.done(root)).toBe(true)
  expect(root.querySelector("[data-card-title]")!.textContent).toBe("Write the 2.0 release notes")
  expect(chips()).toEqual(["Docs"])
  expect(layers()).toEqual({ dialog: false, labels: false, manage: false, confirm: false })
})
