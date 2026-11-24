import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A11-document-editor-top"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent!.trim() === name)!
const item = (name: string) => [...root.querySelectorAll<HTMLElement>("ui-menu-item, ui-menu-checkbox-item")].find((i) => i.textContent!.trim() === name)!
const menu = (name: string) => button(name).closest<HTMLElement & { open: boolean }>("ui-menu")!
const tooltipOf = (name: string) => button(name).closest("ui-tooltip")!.querySelector<HTMLElement>("ui-tooltip-content")!
const pressed = (name: string) => button(name).getAttribute("aria-pressed")
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Application menu", "File", "Edit", "View", "Formatting", "Bold", "Italic", "Underline", "Align left", "Align center", "Align right"])
    expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(root.querySelector("ui-menubar")!.getAttribute("aria-label")).toBe("Application menu")
  expect(root.querySelector("ui-toolbar")!.getAttribute("aria-label")).toBe("Formatting")
  expect(button("Insert link").getAttribute("aria-disabled")).toBeNull()
  expect(button("Bold").getAttribute("aria-disabled")).toBeNull()
})

test("keyboard: the menubar and the toolbar are 1 tab stop each, and a separator takes no focus", () => {
  const stops = (selector: string) => tabbable(root).filter((el) => el.closest(selector) && !el.closest("ui-menu-content"))
  expect(stops("ui-menubar")).toEqual([button("File")])
  expect(stops("ui-toolbar")).toEqual([button("Bold")])
  const separators = [...root.querySelectorAll<HTMLElement>("ui-separator, ui-toolbar-separator")]
  expect(separators).toHaveLength(3)
  for (const separator of separators) expect(separator.getAttribute("role")).toBe("separator")
  expect(tabbable(root).some((el) => el.closest("ui-separator, ui-toolbar-separator"))).toBe(false)
})

test("keyboard: Tab goes from the menubar to the toolbar and back", async () => {
  button("File").focus()
  await keys("Tab")
  expect(document.activeElement).toBe(button("Bold"))
  await keys("Shift+Tab")
  expect(document.activeElement).toBe(button("File"))
})

test("keyboard: ArrowRight and ArrowLeft move between the menus, and Tab comes back to the last one", async () => {
  button("File").focus()
  await keys("ArrowRight")
  expect(document.activeElement).toBe(button("Edit"))
  await keys("ArrowRight")
  expect(document.activeElement).toBe(button("View"))
  await keys("ArrowRight")
  expect(document.activeElement).toBe(button("File"))
  await keys("ArrowLeft")
  expect(document.activeElement).toBe(button("View"))
  await keys("ArrowLeft", "ArrowLeft")
  expect(document.activeElement).toBe(button("File"))
  await keys("ArrowRight")
  await keys("Tab", "Shift+Tab")
  expect(document.activeElement).toBe(button("Edit"))
})

test("keyboard: ArrowDown opens a menu on its first item, Enter runs it, and focus goes back to the trigger", async () => {
  button("File").focus()
  await keys("ArrowDown")
  expect(menu("File").open).toBe(true)
  expect(button("File").getAttribute("aria-expanded")).toBe("true")
  expect(document.activeElement).toBe(item("Save document"))
  await keys("ArrowDown")
  expect(document.activeElement).toBe(item("Export as PDF"))
  await keys("ArrowUp", "Enter")
  expect(status()).toBe("Saved: plain, left.")
  expect(menu("File").open).toBe(false)
  expect(document.activeElement).toBe(button("File"))
})

test("keyboard: Escape closes a menu and runs nothing, and ArrowRight in an open menu opens the next one", async () => {
  button("Edit").focus()
  await keys("Enter")
  expect(menu("Edit").open).toBe(true)
  expect(document.activeElement).toBe(item("Copy text"))
  await keys("Escape")
  expect(menu("Edit").open).toBe(false)
  expect(status()).toBe("Saved: plain, left.")
  expect(document.activeElement).toBe(button("Edit"))
  await keys("Space")
  await keys("ArrowRight")
  expect(menu("Edit").open).toBe(false)
  expect(menu("View").open).toBe(true)
  await keys("Escape")
})

test("keyboard: Space on Show ruler switches it on and off", async () => {
  button("View").focus()
  await keys("ArrowDown")
  expect(document.activeElement).toBe(item("Show ruler"))
  await keys("Space")
  expect(status()).toBe("Ruler: on.")
  button("View").focus()
  await keys("ArrowDown", "Space")
  expect(status()).toBe("Ruler: off.")
})

test("keyboard: ArrowRight and ArrowLeft move through the toolbar and across its groups, Home and End go to its ends", async () => {
  button("Bold").focus()
  const order = ["Italic", "Underline", "Align left", "Align center", "Align right", "Insert link"]
  for (const name of order) {
    await keys("ArrowRight")
    expect(document.activeElement, `ArrowRight to ${name}`).toBe(button(name))
  }
  for (const name of [...order.slice(0, -1).reverse(), "Bold"]) {
    await keys("ArrowLeft")
    expect(document.activeElement, `ArrowLeft to ${name}`).toBe(button(name))
  }
  await keys("End")
  expect(document.activeElement).toBe(button("Insert link"))
  await keys("Home")
  expect(document.activeElement).toBe(button("Bold"))
})

test("keyboard: Space and Enter press the focused toggle, and the arrows alone press nothing", async () => {
  button("Bold").focus()
  await keys("ArrowRight")
  expect(pressed("Bold")).toBe("false")
  expect(pressed("Italic")).toBe("false")
  await keys("Space")
  expect(pressed("Italic")).toBe("true")
  await keys("ArrowLeft", "Space")
  expect(pressed("Bold")).toBe("true")
  expect(status()).toBe("Text style: bold, italic.")
  await keys("ArrowRight", "Enter")
  expect(pressed("Italic")).toBe("false")
  expect(status()).toBe("Text style: bold.")
})

test("keyboard: 1 alignment stays pressed, and the same toggle does not clear it", async () => {
  button("Align left").focus()
  expect(pressed("Align left")).toBe("true")
  await keys("ArrowRight", "Space")
  expect(pressed("Align center")).toBe("true")
  expect(pressed("Align left")).toBe("false")
  expect(status()).toBe("Alignment: center.")
  await keys("Space")
  expect(pressed("Align center")).toBe("true")
})

test("keyboard: Enter on Insert link runs it", async () => {
  button("Insert link").focus()
  await keys("Enter")
  expect(status()).toBe("Link dialog opened.")
})

test("keyboard: focus on a toggle shows its hint, and Escape hides it and keeps focus", async () => {
  const content = tooltipOf("Underline")
  expect(content.hasAttribute("hidden")).toBe(true)
  button("Underline").focus()
  await wait(50)
  await settle()
  expect(content.hasAttribute("hidden")).toBe(false)
  expect(content.textContent).toBe("Draw a line under the selected text")
  expect(button("Underline").getAttribute("aria-describedby")).toBe(content.id)
  await keys("Escape")
  expect(content.hasAttribute("hidden")).toBe(true)
  expect(document.activeElement).toBe(button("Underline"))
  button("Bold").focus()
})

test("agent: an agent presses the toggles, and saves from the File menu", async () => {
  const flipped = await agent.act({
    steps: [
      { ref: "Underline", action: "setPressed", args: [true] },
      { ref: "Align right", action: "setPressed", args: [true] },
    ],
  })
  expect(flipped.ok, flipped.error?.message).toBe(true)
  expect(pressed("Underline")).toBe("true")
  expect(pressed("Align right")).toBe("true")
  expect(status()).toBe("Alignment: right.")

  const style = live().find((entry) => entry.label === "Text style")!
  expect(style.value).toEqual(["bold", "underline"])
  const group = await agent.act({ steps: [{ ref: "Text style", action: "setValue", args: [["italic"]] }] })
  expect(group.ok, group.error?.message).toBe(true)
  expect(pressed("Italic")).toBe("true")
  expect(pressed("Bold")).toBe("false")

  const link = await agent.act({ steps: [{ ref: "Formatting", action: "press", args: ["Insert link"] }] })
  expect(link.ok, link.error?.message).toBe(true)
  expect(status()).toBe("Link dialog opened.")

  const saved = await agent.act({ steps: [{ ref: "File", action: "press", args: ["Save document"] }] })
  expect(saved.ok, saved.error?.message).toBe(true)
  expect(status()).toBe("Saved: italic, right.")
  const ruler = await agent.act({ steps: [{ ref: "View", action: "press", args: ["Show ruler"] }] })
  expect(ruler.ok, ruler.error?.message).toBe(true)
  expect(status()).toBe("Ruler: on.")
})
