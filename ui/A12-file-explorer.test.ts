import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A12-file-explorer"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const width = () => root.querySelector("[data-width]")!.textContent
const item = (value: string) => root.querySelector<HTMLElement>(`ui-tree-item[value="${value}"]`)!
const focused = () => (document.activeElement as HTMLElement).getAttribute("value")
const handle = () => root.querySelector<HTMLElement>("ui-resizable-handle")!

test("names: each control has the name that the page shows, and the tree sits in the scroll area", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const labels = live().map((entry) => entry.label)
  for (const label of ["Project files", "Resize file list", "Scrollable file view"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  const viewport = root.querySelector("ui-scroll-area-viewport")!
  expect(viewport.getAttribute("role")).toBe("region")
  expect(viewport.contains(root.querySelector("ui-tree"))).toBe(true)
  expect(handle().getAttribute("role")).toBe("separator")
  expect(handle().getAttribute("aria-disabled")).toBeNull()
})

test("keyboard: the tree starts closed, and the explorer has 2 tab stops, the tree and then the handle", async () => {
  expect(item("src").getAttribute("aria-expanded")).toBe("false")
  const stops = tabbable(root)
  expect(stops).toEqual([item("src"), handle()])
  item("src").focus()
  await keys("Tab")
  expect(document.activeElement).toBe(handle())
  await keys("Shift+Tab")
  expect(document.activeElement).toBe(item("src"))
})

test("keyboard: ArrowDown and ArrowUp move through the rows, and a file opens when it gets focus", async () => {
  item("src").focus()
  await keys("ArrowDown")
  expect(focused()).toBe("docs")
  await keys("ArrowUp", "ArrowRight", "ArrowDown")
  expect(focused()).toBe("src/lib")
  expect(status()).toBe("No file is open.")
  await keys("ArrowRight", "ArrowDown")
  expect(focused()).toBe("src/lib/format.ts")
  expect(status()).toBe("Opened: src/lib/format.ts")
  expect(root.querySelector("[data-name]")!.textContent).toBe("src/lib/format.ts")
  expect(root.querySelector("[data-size]")!.textContent).toBe("Size 0.8 KB")
  expect(item("src/lib/format.ts").getAttribute("aria-selected")).toBe("true")
  await keys("ArrowUp")
  expect(focused()).toBe("src/lib")
  expect(status()).toBe("Opened: src/lib/format.ts")
  await keys("Home")
  expect(focused()).toBe("src")
  await keys("End")
  expect(focused()).toBe("README.md")
  expect(status()).toBe("Opened: README.md")
})

test("keyboard: ArrowLeft closes a folder, then goes to the parent, and ArrowRight opens it and enters it", async () => {
  item("src/lib").focus()
  await keys("ArrowLeft")
  expect(item("src/lib").getAttribute("aria-expanded")).toBe("false")
  expect(focused()).toBe("src/lib")
  await keys("ArrowLeft")
  expect(focused()).toBe("src")
  expect(item("src").getAttribute("aria-expanded")).toBe("true")
  await keys("ArrowDown", "ArrowRight")
  expect(item("src/lib").getAttribute("aria-expanded")).toBe("true")
  await keys("ArrowRight")
  expect(focused()).toBe("src/lib/format.ts")
  await keys("ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft")
  expect(item("src").getAttribute("aria-expanded")).toBe("false")
  await keys("ArrowRight")
  expect(item("src").getAttribute("aria-expanded")).toBe("true")
})

test("keyboard: the handle moves 1 step with each arrow, 10 with Shift, and stops at the bounds", async () => {
  const now = () => handle().getAttribute("aria-valuenow")
  handle().focus()
  const start = Number(now())
  await keys("ArrowRight")
  expect(Number(now())).toBe(start + 1)
  expect(width()).toBe(`File list is ${start + 1}% wide.`)
  await keys("ArrowLeft", "ArrowLeft")
  expect(Number(now())).toBe(start - 1)
  await keys("Shift+ArrowRight")
  expect(Number(now())).toBe(start + 9)
  await keys("ArrowUp", "ArrowDown")
  expect(Number(now())).toBe(start + 9)
  await keys("Home")
  expect(now()).toBe("25")
  await keys("End")
  expect(now()).toBe("70")
  expect(handle().getAttribute("aria-valuemin")).toBe("25")
  expect(handle().getAttribute("aria-valuemax")).toBe("70")
})

test("agent: an agent resizes the pane and opens a file in a closed folder", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  expect(labels).toContain("Project files")
  const result = await agent.act({
    steps: [
      { ref: "Resize file list", action: "setLayout", args: [[30, 70]] },
      { ref: "Project files", action: "setValue", args: ["docs/overview.md"] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(width()).toBe("File list is 30% wide.")
  expect(handle().getAttribute("aria-valuenow")).toBe("30")
  expect(status()).toBe("Opened: docs/overview.md")
  expect(item("docs").getAttribute("aria-expanded")).toBe("true")
  expect(item("docs/overview.md").getAttribute("aria-selected")).toBe("true")
})

test("agent: a file that is not in the tree is refused with the real items, and a layout past the bound is fitted", async () => {
  const missing = await agent.act({ steps: [{ ref: "Project files", action: "setValue", args: ["nope.txt"] }] })
  expect(missing.ok).toBe(false)
  expect(missing.error?.message).toContain("No item")
  expect(status()).toBe("Opened: docs/overview.md")
  const fitted = await agent.act({ steps: [{ ref: "Resize file list", action: "setLayout", args: [[10, 90]] }] })
  expect(fitted.ok, fitted.error?.message).toBe(true)
  expect(handle().getAttribute("aria-valuenow")).toBe("25")
  expect(width()).toBe("File list is 25% wide.")
})
