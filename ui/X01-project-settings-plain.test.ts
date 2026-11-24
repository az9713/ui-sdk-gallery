import { expect, test } from "vitest"
import type { Context } from "../src/ui"
import ui from "./X01-project-settings-plain"

const root = document.body.appendChild(document.createElement("section"))
ui.mount(root, { agent: undefined as never, ask: async () => false } satisfies Context)

const status = () => root.querySelector("[data-status]")!.textContent
const tab = (name: string) => [...root.querySelectorAll<HTMLElement>("[role=tab]")].find((t) => t.textContent === name)!
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!
const panel = (name: string) => root.querySelector<HTMLElement>(`[data-panel=${name}]`)!
const dialogOpen = () => !root.querySelector<HTMLElement>("[data-backdrop]")!.hidden

// Presses 1 key on the focused element. jsdom does not move focus on Tab or click on Space and Enter, so this does.
function press(name: string) {
  const parts = name.split("+")
  const key = parts.pop()!
  const init = { key: key === "Space" ? " " : key, shiftKey: parts.includes("Shift"), bubbles: true, cancelable: true }
  const target = (document.activeElement as HTMLElement | null) ?? document.body
  const went = target.dispatchEvent(new KeyboardEvent("keydown", init))
  if (went && (key === "Space" || key === "Enter") && target.matches("button")) target.click()
  target.dispatchEvent(new KeyboardEvent("keyup", init))
}

test("keyboard: the 3 tabs are 1 tab stop, and each arrow key moves to the next tab and shows its panel", () => {
  const tabs = [...root.querySelectorAll<HTMLElement>("[role=tab]")]
  expect(tabs.filter((t) => t.tabIndex >= 0)).toHaveLength(1)
  tab("General").focus()
  press("ArrowRight")
  expect(document.activeElement).toBe(tab("Notifications"))
  expect(tab("Notifications").getAttribute("aria-selected")).toBe("true")
  expect(panel("notifications").hidden).toBe(false)
  expect(panel("general").hidden).toBe(true)
  press("ArrowRight")
  press("ArrowRight")
  expect(document.activeElement).toBe(tab("General"))
  press("ArrowLeft")
  expect(document.activeElement).toBe(tab("Danger zone"))
  press("Home")
  expect(document.activeElement).toBe(tab("General"))
  press("End")
  expect(document.activeElement).toBe(tab("Danger zone"))
  expect(tabs.filter((t) => t.tabIndex >= 0)).toHaveLength(1)
  tab("General").click()
  expect(panel("general").hidden).toBe(false)
})

test("keyboard: Space changes each switch, and Save reports the 2 states", () => {
  tab("Notifications").click()
  const [digest, alerts] = root.querySelectorAll<HTMLElement>("[role=switch]")
  digest.focus()
  press("Space")
  alerts.focus()
  press("Space")
  expect(digest.getAttribute("aria-checked")).toBe("false")
  expect(alerts.getAttribute("aria-checked")).toBe("true")
  tab("General").click()
  button("Save settings").focus()
  press("Enter")
  expect(status()).toBe("Saved: Apollo, private, weekly digest off, deploy alerts on.")
})

test("keyboard: Cancel closes the dialog and deletes nothing, and focus goes back to the trigger", () => {
  tab("Danger zone").click()
  button("Delete project").focus()
  press("Enter")
  expect(dialogOpen()).toBe(true)
  expect(document.activeElement).toBe(button("Cancel"))
  press("Enter")
  expect(dialogOpen()).toBe(false)
  expect(status()).not.toContain("Deleted")
  expect(document.activeElement).toBe(button("Delete project"))
})

test("keyboard: Escape closes the dialog, Tab stays inside it, and Delete forever deletes", () => {
  button("Delete project").focus()
  press("Enter")
  press("Escape")
  expect(dialogOpen()).toBe(false)
  expect(document.activeElement).toBe(button("Delete project"))
  press("Enter")
  button("Delete forever").focus()
  const tabbed = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
  button("Delete forever").dispatchEvent(tabbed)
  expect(tabbed.defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(button("Cancel"))
  button("Delete forever").focus()
  press("Space")
  expect(status()).toBe("Deleted: Apollo.")
  expect(dialogOpen()).toBe(false)
})

test("keyboard: an empty project name is invalid and Save does not save it", () => {
  tab("General").click()
  const input = root.querySelector<HTMLInputElement>("input")!
  input.value = ""
  input.dispatchEvent(new Event("input", { bubbles: true }))
  expect(input.getAttribute("aria-invalid")).toBe("true")
  expect(root.querySelector("[data-name-error]")!.textContent).toBe("Enter a project name.")
  button("Save settings").focus()
  press("Enter")
  expect(status()).toBe("Not saved: the project name is empty.")
  expect(document.activeElement).toBe(input)
  input.value = "Atlas"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  expect(input.getAttribute("aria-invalid")).toBe("false")
  root.querySelector<HTMLSelectElement>("select")!.value = "internal"
  button("Save settings").click()
  expect(status()).toBe("Saved: Atlas, internal, weekly digest off, deploy alerts on.")
})
