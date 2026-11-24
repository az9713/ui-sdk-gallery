import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./A01-project-settings"

const { root, agent, person, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const tab = (name: string) => [...root.querySelectorAll<HTMLElement>("ui-tabs-tab button")].find((b) => b.textContent === name)!
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Project name", "Visibility", "Save settings"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(root.querySelector("ui-tabs-list")!.getAttribute("aria-label")).toBe("Settings sections")
  expect(button("Save settings").getAttribute("aria-disabled")).toBeNull()
})

test("keyboard: Space changes each switch, and Save reports the 2 states", async () => {
  tab("Notifications").click()
  await settle()
  const [digest, alerts] = root.querySelectorAll<HTMLElement>("ui-switch")
  digest.focus()
  await keys("Space")
  alerts.focus()
  await keys("Space")
  expect(digest.getAttribute("aria-checked")).toBe("false")
  expect(alerts.getAttribute("aria-checked")).toBe("true")
  tab("General").click()
  await settle()
  button("Save settings").focus()
  await keys("Enter")
  expect(status()).toBe("Saved: Apollo, private, weekly digest off, deploy alerts on.")
})

test("keyboard: Cancel closes the dialog and deletes nothing, and focus goes back to the trigger", async () => {
  tab("Danger zone").click()
  await settle()
  button("Delete project").focus()
  await keys("Enter")
  expect(root.querySelector("ui-alert-dialog-content")!.hasAttribute("hidden")).toBe(false)
  button("Cancel").focus()
  await keys("Enter")
  expect(root.querySelector("ui-alert-dialog-content")!.hasAttribute("hidden")).toBe(true)
  expect(status()).not.toContain("Deleted")
  expect(document.activeElement).toBe(button("Delete project"))
})

test("keyboard: an empty project name is invalid", async () => {
  tab("General").click()
  await settle()
  const input = root.querySelector("input")!
  input.value = ""
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("blur", { bubbles: true }))
  await settle()
  expect(input.validity.valueMissing).toBe(true)
  input.value = "Apollo"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
})

test("agent: an agent changes each setting, and the delete step waits for the person", async () => {
  const changed = await agent.act({
    steps: [
      { ref: "Project name", action: "setValue", args: ["Atlas"] },
      { ref: "Visibility", action: "setValue", args: ["Internal"] },
      { ref: "Deploy alerts", action: "setChecked", args: [false] },
      { ref: "Save settings", action: "press" },
    ],
  })
  expect(changed.ok, changed.error?.message).toBe(true)
  expect(root.querySelector("input")!.value).toBe("Atlas")
  expect(status()).toBe("Saved: Atlas, internal, weekly digest off, deploy alerts off.")

  const remove = { steps: [{ ref: "Delete this project?", action: "press", args: ["Delete forever"] }] }
  expect((await agent.act(remove)).ok).toBe(false)
  expect(person.asked).toEqual(["Deletes the project and all its files"])
  expect(status()).not.toContain("Deleted")
  person.approves = true
  const removed = await agent.act(remove)
  expect(removed.ok, removed.error?.message).toBe(true)
  expect(status()).toBe("Deleted: Atlas.")
})
