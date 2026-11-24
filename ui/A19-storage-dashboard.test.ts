import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./A19-storage-dashboard"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const get = (name: string) => root.querySelector<HTMLElement>(name)!
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!

test("names: each gauge and button has the name that the page shows", async () => {
  await settle()
  expect(get("[data-used]").getAttribute("role")).toBe("meter")
  expect(get("[data-backup]").getAttribute("role")).toBe("progressbar")
  expect(get("[data-used]").getAttribute("aria-valuenow")).toBe("10.2")
  expect(get("[data-used]").getAttribute("aria-valuemax")).toBe("15")
  expect(get("[data-backup]").getAttribute("aria-valuenow")).toBe("0")
  expect(get("[data-used] ui-meter-value").textContent).toContain("10.2")
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const labels = live().map((entry) => entry.label)
  for (const label of ["Empty trash", "Back up next folder"]) expect(labels).toContain(label)
})

test("keyboard: the 2 buttons are the only tab stops, and Enter empties the trash", async () => {
  expect(root.querySelectorAll("button").length).toBe(2)
  button("Empty trash").focus()
  await keys("Enter")
  expect(status()).toBe("Trash emptied: 4.2 GB freed, 6 GB used.")
  expect(get("[data-trash]").getAttribute("aria-valuenow")).toBe("0")
  expect(get("[data-used]").getAttribute("aria-valuenow")).toBe("6")
  await keys("Tab")
  expect(document.activeElement).toBe(button("Back up next folder"))
  await keys("Space")
  expect(status()).toBe("Backed up Documents: 1 of 4 folders.")
  expect(get("[data-backup]").getAttribute("aria-valuenow")).toBe("1")
  expect(get("[data-backup] ui-progress-indicator").hasAttribute("data-progressing")).toBe(true)
})

test("keyboard: the backup completes at 4 folders, and a 5th press changes nothing", async () => {
  button("Back up next folder").focus()
  await keys("Enter", "Enter", "Enter")
  expect(status()).toBe("Backup complete: 4 of 4 folders.")
  expect(get("[data-backup] ui-progress-indicator").hasAttribute("data-complete")).toBe(true)
  await keys("Enter")
  expect(status()).toBe("Backup is already complete.")
  expect(get("[data-backup]").getAttribute("aria-valuenow")).toBe("4")
  button("Empty trash").focus()
  await keys("Enter")
  expect(status()).toBe("Trash is already empty.")
})

test("agent: an agent reads the gauges and presses each button", async () => {
  const snap = agent.snapshot().filter((entry) => !entry.offPage)
  expect(snap.some((entry) => entry.label === "Storage used")).toBe(true)
  expect(snap.some((entry) => entry.label === "Backup progress")).toBe(true)
  const result = await agent.act({
    steps: [
      { ref: "Empty trash", action: "press" },
      { ref: "Back up next folder", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Backup is already complete.")
})
