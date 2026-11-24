import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./A07-prompt-box"

// jsdom has no Range geometry and no form.requestSubmit, which the menu and the Enter key use.
Range.prototype.getBoundingClientRect = () => new DOMRect(10, 10, 5, 10)
Range.prototype.getClientRects = () => [] as unknown as DOMRectList
HTMLFormElement.prototype.requestSubmit = function () {
  this.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
}

type Token = { type: string; value: string; label: string }
type PromptEl = HTMLElement & {
  api: { getValue(): (string | Token)[]; getLabel(): string; setValue(v: (string | Token)[]): boolean; focus(o?: object): void }
}
type MenuEl = HTMLElement & { api: { open(o: object): Promise<unknown>; isOpen(): boolean } }
type FilesEl = HTMLElement & { api: { getValue(): File[]; addFiles(f: File[]): boolean } }

const { root, agent, person, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const prompt = () => root.querySelector<PromptEl>("ui-token-input")!
const menu = () => root.querySelector<MenuEl>("ui-trigger-menu")!
const attached = () => root.querySelector<FilesEl>("ui-file-input")!
const names = () => attached().api.getValue().map((file) => file.name)
const tokens = () => prompt().api.getValue().filter((part): part is Token => typeof part !== "string")
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!
const file = (name: string) => new File(["x"], name)

test("names: each control has the name that the page shows, and the draft shows 2 tokens", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const labels = live().map((entry) => entry.label)
  for (const label of ["Prompt", "Attach files", "Model", "Send"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(tokens().map((token) => token.label)).toEqual(["routes.ts", "app.tsx"])
  expect(root.querySelectorAll("ui-token-input-token")).toHaveLength(2)
  expect(names()).toEqual(["design-brief.pdf"])
  expect(button("Send").getAttribute("aria-disabled")).toBeNull()
})

test("keyboard: the @ menu opens on the trigger, arrows move the choice, Enter inserts a token", async () => {
  prompt().api.setValue([])
  prompt().api.focus({ at: "end" })
  await settle()
  void menu().api.open({ trigger: "@" })
  await settle()
  expect(menu().api.isOpen()).toBe(true)
  const items = [...root.querySelectorAll<HTMLElement>("ui-trigger-menu-item")]
  expect(items.map((item) => item.textContent?.trim())).toEqual(["app.tsx", "routes.ts", "README.md"])
  expect(items[0].hasAttribute("data-highlighted")).toBe(true)
  await keys("ArrowDown")
  expect(items[1].hasAttribute("data-highlighted")).toBe(true)
  await keys("ArrowDown", "ArrowUp", "ArrowUp")
  expect(items[0].hasAttribute("data-highlighted")).toBe(true)
  await keys("ArrowDown", "Enter")
  await settle()
  expect(menu().api.isOpen()).toBe(false)
  expect(tokens()).toMatchObject([{ type: "file", value: "src/routes.ts", label: "routes.ts" }])
})

test("keyboard: Escape closes the @ menu and adds no token", async () => {
  prompt().api.setValue([])
  prompt().api.focus({ at: "end" })
  await settle()
  void menu().api.open({ trigger: "@" })
  await settle()
  expect(menu().api.isOpen()).toBe(true)
  await keys("Escape")
  await settle()
  expect(menu().api.isOpen()).toBe(false)
  expect(tokens()).toEqual([])
})

test("keyboard: the attachment list is 1 tab stop, arrows move between files, Delete removes the focused file", async () => {
  attached().api.addFiles([file("notes.txt"), file("mockup.png")])
  await settle()
  expect(names()).toEqual(["design-brief.pdf", "notes.txt", "mockup.png"])
  const items = [...root.querySelectorAll<HTMLElement>("ui-file-input-item")]
  expect(items.filter((item) => item.tabIndex === 0)).toHaveLength(1)
  items[0].focus()
  await keys("ArrowDown")
  expect(document.activeElement).toBe(items[1])
  await keys("ArrowUp")
  expect(document.activeElement).toBe(items[0])
  items[1].focus()
  await keys("Delete")
  expect(names()).toEqual(["design-brief.pdf", "mockup.png"])
  expect(status()).toBe("Nothing is sent.")
})

test("keyboard: Enter in the prompt sends it with the model and the attachments, and the box is empty after", async () => {
  prompt().api.setValue(["Summarize this."])
  prompt().api.focus({ at: "end" })
  await settle()
  await keys("Enter")
  expect(status()).toBe('Sent to Sonnet: "Summarize this." with 2 files: design-brief.pdf, mockup.png.')
  expect(prompt().api.getLabel()).toBe("")
  expect(names()).toEqual([])
})

test("keyboard: Send with an empty prompt sends nothing and says why", async () => {
  attached().api.addFiles([file("notes.txt")])
  button("Send").focus()
  await keys("Enter")
  expect(status()).toBe("Write a prompt before you send.")
  expect(names()).toEqual(["notes.txt"])
})

test("keyboard: the model select opens with the arrow key, Enter chooses, and Send reports it", async () => {
  prompt().api.setValue(["Hi"])
  await settle()
  button("Sonnet").focus()
  await keys("ArrowDown")
  await settle()
  const options = [...root.querySelectorAll<HTMLElement>("ui-select-item")]
  expect(options.map((o) => o.textContent?.trim())).toEqual(["Sonnet", "Opus", "Haiku"])
  await keys("ArrowDown", "Enter")
  await settle()
  button("Send").focus()
  await keys("Enter")
  expect(status()).toBe('Sent to Opus: "Hi" with 1 file: notes.txt.')
})

test("agent: an agent writes the prompt with a file token, attaches a file, picks a model, and sends", async () => {
  const result = await agent.act({
    steps: [
      { ref: "Prompt", action: "setValue", args: [["Explain ", { type: "file", value: "src/routes.ts", label: "routes.ts" }, " and fix the typo"]] },
      { ref: "Attach files", action: "addFiles", args: [[file("mockup.png")]] },
      { ref: "Model", action: "setValue", args: ["Haiku"] },
      { ref: "Send", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe('Sent to Haiku: "Explain routes.ts and fix the typo" with 1 file: mockup.png.')
  expect(person.asked).toEqual([])
})

test("agent: an agent removes an attached file and a token before it sends", async () => {
  attached().api.addFiles([file("one.txt"), file("two.txt")])
  await settle()
  const [first] = attached().api.getValue()
  expect(first.name).toBe("one.txt")
  const result = await agent.act({
    steps: [
      { ref: "Prompt", action: "setValue", args: [["Check ", { type: "file", value: "README.md", label: "README.md", id: "t-readme" }]] },
      { ref: "Prompt", action: "removeToken", args: ["t-readme"] },
      { ref: "Attach files", action: "removeFile", args: [first] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(tokens()).toEqual([])
  expect(names()).toEqual(["two.txt"])
  expect(status()).toBe('Sent to Haiku: "Explain routes.ts and fix the typo" with 1 file: mockup.png.')
  const sent = await agent.act({ steps: [{ ref: "Send", action: "press" }] })
  expect(sent.ok, sent.error?.message).toBe(true)
  expect(status()).toBe('Sent to Haiku: "Check" with 1 file: two.txt.')
  expect(prompt().api.getLabel()).toBe("")
  expect(names()).toEqual([])
})
