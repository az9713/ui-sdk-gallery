import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./A06-command-palette"

const { root, agent, live } = mountUI(ui)
const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!
const status = () => q("[data-status]").textContent
const editorState = () => q("[data-state]").textContent
const trigger = () => q("ui-dialog-trigger button")
const input = () => q<HTMLInputElement>("ui-command-input input")
const isOpen = () => !q("ui-dialog-content").hidden
const highlighted = () => [...root.querySelectorAll("ui-command-item")].filter((item) => item.hasAttribute("data-highlighted")).map((item) => item.getAttribute("value"))
const visible = () => [...root.querySelectorAll("ui-command-item")].filter((item) => !(item as HTMLElement).hidden).map((item) => item.getAttribute("value"))

async function open() {
  trigger().focus()
  await keys("Enter")
}

async function search(text: string) {
  input().value = text
  input().dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
}

test("names: each control has the name that the page shows", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const labels = live().map((entry) => entry.label)
  for (const label of ["Command palette", "Find a command"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(trigger().textContent).toContain("Open palette")
  expect(trigger().getAttribute("aria-disabled")).toBeNull()
  expect(trigger().getAttribute("aria-keyshortcuts")).toBe("Control+K")
  expect(isOpen()).toBe(false)
})

test("keyboard: Enter on the trigger opens the dialog, the search field has focus, and it is the only tab stop", async () => {
  await open()
  expect(isOpen()).toBe(true)
  expect(q("ui-dialog-content").getAttribute("aria-modal")).toBe("true")
  expect(q("ui-dialog-content").getAttribute("aria-labelledby")).toBe(q("ui-dialog-title").id)
  expect(document.activeElement).toBe(input())
  const stops = [...q("ui-dialog-content").querySelectorAll<HTMLElement>("input, button, [tabindex]")].filter((el) => el.tabIndex >= 0)
  expect(stops).toEqual([input()])
  expect([...root.querySelectorAll("ui-command-item")].every((item) => item.getAttribute("role") === "option")).toBe(true)
  expect(highlighted()).toEqual(["new-file"])
  await keys("Escape")
})

test("keyboard: ArrowDown and ArrowUp move the highlight, and neither stops on the disabled command", async () => {
  await open()
  const down = ["save-file", "toggle-wrap", "toggle-sidebar", "format"]
  const seen: (string | null)[] = []
  for (let i = 0; i < down.length; i++) {
    await keys("ArrowDown")
    seen.push(highlighted()[0])
  }
  expect(seen).toEqual(down)
  const up: (string | null)[] = []
  for (let i = 0; i < 3; i++) {
    await keys("ArrowUp")
    up.push(highlighted()[0])
  }
  expect(up).toEqual(["toggle-sidebar", "toggle-wrap", "save-file"])
  expect(q("ui-command-item[value=close-file]").getAttribute("aria-disabled")).toBe("true")
  expect(input().getAttribute("aria-activedescendant")).toBe(q("ui-command-item[value=save-file]").id)
  await keys("Escape", "Escape")
})

test("keyboard: Enter runs the highlighted command, closes the dialog and gives focus back to the trigger", async () => {
  await open()
  await keys("ArrowDown", "ArrowDown", "Enter")
  expect(status()).toBe("Ran: Toggle word wrap.")
  expect(editorState()).toBe("Word wrap on, sidebar shown, 1 file open, saved 0 times.")
  expect(q("[data-editor]").hasAttribute("data-wrap")).toBe(true)
  expect(isOpen()).toBe(false)
  expect(document.activeElement).toBe(trigger())
})

test("keyboard: typing filters the commands, and the best match runs on Enter", async () => {
  await open()
  expect(input().value).toBe("")
  await search("sid")
  expect(visible()).toEqual(["toggle-sidebar"])
  expect(highlighted()).toEqual(["toggle-sidebar"])
  await keys("Enter")
  expect(status()).toBe("Ran: Toggle sidebar.")
  expect(q("[data-editor]").hasAttribute("data-sidebar-hidden")).toBe(true)
  expect(isOpen()).toBe(false)
})

test("keyboard: a keyword finds a command that the label does not hold", async () => {
  await open()
  await search("prettier")
  expect(visible()).toEqual(["format"])
  await keys("Escape", "Escape")
})

test("keyboard: Escape clears the search first, then closes the dialog with nothing run", async () => {
  const before = status()
  await open()
  await search("form")
  expect(visible()).toEqual(["format"])
  await keys("Escape")
  expect(isOpen()).toBe(true)
  expect(input().value).toBe("")
  expect(visible()).toHaveLength(6)
  await keys("Escape")
  expect(isOpen()).toBe(false)
  expect(document.activeElement).toBe(trigger())
  expect(status()).toBe(before)
})

test("keyboard: a search with no match shows the empty message and hides the groups, and a closed dialog forgets the search", async () => {
  await open()
  expect(q("ui-command-empty").hasAttribute("data-empty")).toBe(false)
  await search("zzz")
  expect(visible()).toEqual([])
  expect(q("ui-command-empty").hasAttribute("data-empty")).toBe(true)
  expect(q("ui-command-empty").textContent).toBe("No command matches.")
  expect([...root.querySelectorAll<HTMLElement>("ui-command-group")].every((group) => group.hidden)).toBe(true)
  await keys("Enter")
  expect(isOpen()).toBe(true)
  await keys("Escape", "Escape")
  await open()
  expect(input().value).toBe("")
  expect(visible()).toHaveLength(6)
  await keys("Escape")
})

test("keyboard: Control+K opens the dialog from anywhere, and Control+S runs Save file while it is open", async () => {
  document.body.focus()
  await keys("Control+k")
  expect(isOpen()).toBe(true)
  expect(document.activeElement).toBe(input())
  await keys("Control+s")
  expect(status()).toBe("Ran: Save file.")
  expect(editorState()).toBe("Word wrap on, sidebar hidden, 1 file open, saved 1 time.")
  expect(isOpen()).toBe(false)
  expect(q("ui-command-item[value=save-file]").getAttribute("aria-keyshortcuts")).toBe("Control+S")
})

test("agent: an agent opens the palette, searches, runs a command, and the dialog closes", async () => {
  const opened = await agent.act({ steps: [{ ref: "Command palette", action: "press" }] })
  expect(opened.ok, opened.error?.message).toBe(true)
  expect(isOpen()).toBe(true)
  const found = await agent.act({ steps: [{ ref: "Find a command", action: "setQuery", args: ["new"] }] })
  expect(found.ok, found.error?.message).toBe(true)
  expect(visible()).toEqual(["new-file"])
  const ran = await agent.act({ steps: [{ ref: "Find a command", action: "run" }] })
  expect(ran.ok, ran.error?.message).toBe(true)
  expect(status()).toBe("Ran: New file.")
  expect(editorState()).toBe("Word wrap on, sidebar hidden, 2 files open, saved 1 time.")
  expect(isOpen()).toBe(false)
})

test("agent: an agent runs a command by its value, and the disabled command is refused", async () => {
  const snapshot = live().find((entry) => entry.component === "command")!
  expect(snapshot.items).toContainEqual({ value: "toggle-wrap", label: "Toggle word wrap" })
  const ran = await agent.act({
    steps: [
      { ref: "Command palette", action: "setOpen", args: [true] },
      { ref: "Find a command", action: "run", args: ["toggle-wrap"] },
    ],
  })
  expect(ran.ok, ran.error?.message).toBe(true)
  expect(status()).toBe("Ran: Toggle word wrap.")
  expect(editorState()).toBe("Word wrap off, sidebar hidden, 2 files open, saved 1 time.")

  const refused = await agent.act({
    steps: [
      { ref: "Command palette", action: "setOpen", args: [true] },
      { ref: "Find a command", action: "run", args: ["close-file"] },
    ],
  })
  expect(refused.ok).toBe(false)
  expect(refused.error?.message).toContain("disabled")
  expect(status()).toBe("Ran: Toggle word wrap.")
  await keys("Escape")
})
