import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { emojiPicker } from "./B19-emoji-picker"

// 7 emoji in rows of 3: a b c / d e f / g. The last row is short.
const ids = ["a", "b", "c", "d", "e", "f", "g"]
const items = ids.map((id) => ({ value: id, label: `Emoji ${id}` }))
const cells = (from: number) => ids.slice(from, from + 3).map((id) => `<emoji value="${id}">${id}</emoji>`).join("")
const markup = `<root aria-label="Emoji picker"><trigger>Add reaction</trigger><content><grid aria-label="Reactions"><row value="r0">${cells(0)}</row><row value="r1">${cells(3)}</row><row value="r2">${cells(6)}</row></grid></content></root>`
const open = { defaultOpen: true, columns: 3, items }
type View = ReturnType<typeof mount<typeof emojiPicker>>
const emoji = (view: View, id: string) => view.part("emoji", id) as HTMLElement
const shown = (el: Element | undefined) => !!el?.isConnected && !(el as HTMLElement).hidden

async function focusFirst(view: View) {
  emoji(view, "a").focus()
  await view.settle()
}

test("keyboard: opening puts focus on the grid, and the grid is 1 tab stop", async () => {
  const view = mount(emojiPicker, { columns: 3, items }, markup)
  try {
    const trigger = view.part("trigger") as HTMLElement
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(shown(view.part("content"))).toBe(false)
    trigger.focus()
    await view.keys("Enter")
    await view.settle()
    expect(view.state.open).toBe(true)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(shown(view.part("content"))).toBe(true)
    expect(document.activeElement).toBe(emoji(view, "a"))
    expect(view.root.querySelectorAll('[data-slot=emoji-picker-emoji][tabindex="0"]').length).toBe(1)
  } finally {
    view.unmount()
  }
})

test("keyboard: Left and Right stay in the row, and Home and End go to its ends", async () => {
  const view = mount(emojiPicker, open, markup)
  try {
    await focusFirst(view)
    await view.keys("ArrowLeft")
    expect(document.activeElement).toBe(emoji(view, "a"))
    await view.keys("ArrowRight", "ArrowRight", "ArrowRight")
    expect(document.activeElement).toBe(emoji(view, "c"))
    await view.keys("ArrowDown", "Home")
    expect(document.activeElement).toBe(emoji(view, "d"))
    await view.keys("ArrowLeft")
    expect(document.activeElement).toBe(emoji(view, "d"))
    await view.keys("End")
    expect(document.activeElement).toBe(emoji(view, "f"))
    await view.keys("Control+Home")
    expect(document.activeElement).toBe(emoji(view, "a"))
    await view.keys("Control+End")
    expect(document.activeElement).toBe(emoji(view, "g"))
    await view.keys("End", "ArrowRight")
    expect(document.activeElement).toBe(emoji(view, "g"))
  } finally {
    view.unmount()
  }
})

test("keyboard: Down into a column that the short last row lacks lands on its last emoji", async () => {
  const view = mount(emojiPicker, open, markup)
  try {
    await focusFirst(view)
    await view.keys("ArrowRight", "ArrowDown")
    expect(document.activeElement).toBe(emoji(view, "e"))
    await view.keys("ArrowDown")
    expect(document.activeElement).toBe(emoji(view, "g"))
    await view.keys("ArrowDown")
    expect(document.activeElement).toBe(emoji(view, "g"))
    await view.keys("ArrowUp", "ArrowUp")
    expect(document.activeElement).toBe(emoji(view, "a"))
    await view.keys("ArrowUp")
    expect(document.activeElement).toBe(emoji(view, "a"))
  } finally {
    view.unmount()
  }
})

test("keyboard: Enter and Space pick the focused emoji and mark it selected", async () => {
  const view = mount(emojiPicker, open, markup)
  try {
    await focusFirst(view)
    expect(emoji(view, "b").getAttribute("aria-selected")).toBe("false")
    await view.keys("ArrowRight", "Enter")
    expect(view.state.value).toBe("b")
    expect(view.changes.find((c) => c.key === "value")).toMatchObject({ value: "b", reason: "item-press", source: "keyboard" })
    expect(emoji(view, "b").getAttribute("aria-selected")).toBe("true")
    expect(emoji(view, "b").hasAttribute("data-selected")).toBe(true)
    view.api.setOpen(true)
    await view.settle()
    emoji(view, "c").focus()
    await view.keys("Space")
    expect(view.state.value).toBe("c")
    expect(emoji(view, "b").getAttribute("aria-selected")).toBe("false")
  } finally {
    view.unmount()
  }
})

test("keyboard: a pick closes the popup and focus goes back to the trigger", async () => {
  const view = mount(emojiPicker, { columns: 3, items }, markup)
  try {
    const trigger = view.part("trigger") as HTMLElement
    trigger.focus()
    await view.keys("Enter")
    await view.settle()
    expect(document.activeElement).toBe(emoji(view, "a"))
    await view.keys("Escape")
    await view.settle()
    expect(view.state.open).toBe(false)
    expect(document.activeElement).toBe(trigger)
    await view.keys("Enter")
    await view.settle()
    await view.keys("ArrowDown", "Enter")
    await view.settle()
    expect(view.state.value).toBe("d")
    expect(view.state.open).toBe(false)
    expect(view.changes.filter((c) => c.key === "open").at(-1)).toMatchObject({ value: false, reason: "item-press" })
    expect(document.activeElement).toBe(trigger)
  } finally {
    view.unmount()
  }
})

test("keyboard: a click picks an emoji", async () => {
  const view = mount(emojiPicker, open, markup)
  try {
    await view.click(emoji(view, "f"))
    expect(view.state.value).toBe("f")
    expect(view.changes.find((c) => c.key === "value")).toMatchObject({ reason: "item-press" })
    expect(view.state.open).toBe(false)
  } finally {
    view.unmount()
  }
})

test("server: the emoji picker renders with no DOM", () => {
  checkServer(emojiPicker, open, markup)
})

// checkDirection presses ArrowRight on the first control, the trigger, where it does nothing. So this test is by hand.
test("direction: Left and Right follow the text direction", async () => {
  for (const [dir, right, left] of [
    ["ltr", "c", "a"],
    ["rtl", "a", "c"],
  ]) {
    document.documentElement.dir = dir
    const view = mount(emojiPicker, open, markup)
    try {
      emoji(view, "b").focus()
      await view.keys("ArrowRight")
      expect(document.activeElement, `${dir} ArrowRight`).toBe(emoji(view, right))
      emoji(view, "b").focus()
      await view.keys("ArrowLeft")
      expect(document.activeElement, `${dir} ArrowLeft`).toBe(emoji(view, left))
    } finally {
      view.unmount()
      document.documentElement.dir = ""
    }
  }
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent

test("names: the page names the picker, its trigger and each emoji, and the popup starts open", async () => {
  page = mountUI(ui)
  await settle()
  const picker = page.root.querySelector("b19-emoji-picker")!
  expect(picker.getAttribute("aria-label")).toBe("Emoji picker")
  expect(picker.getAttribute("role")).toBe("group")
  expect(page.root.querySelector("b19-grid")!.getAttribute("role")).toBe("grid")
  expect(page.root.querySelector("b19-grid")!.getAttribute("aria-label")).toBe("Reactions")
  expect(page.root.querySelectorAll("b19-row[role=row]").length).toBe(3)
  expect(page.root.querySelectorAll("b19-emoji[role=gridcell]").length).toBe(14)
  expect(page.root.querySelectorAll("b19-row")[2].children.length).toBe(2)
  for (const cell of page.root.querySelectorAll("b19-emoji")) expect(cell.getAttribute("aria-label")).toBeTruthy()
  expect(page.root.querySelector("b19-trigger button")!.getAttribute("aria-expanded")).toBe("true")
  expect(page.root.querySelector("b19-popup")!.hasAttribute("hidden")).toBe(false)
})

test("keyboard: on the page, Down from the fifth column lands on the last emoji, and Enter reports the pick", async () => {
  const cells = [...page.root.querySelectorAll<HTMLElement>("b19-emoji")]
  cells[4].focus()
  await keys("ArrowDown")
  expect(document.activeElement).toBe(cells[10])
  await keys("ArrowDown")
  expect(document.activeElement).toBe(cells[13])
  await keys("Enter")
  expect(status()).toBe("Reaction: Star ⭐.")
  expect(page.root.querySelector("b19-popup")!.hasAttribute("hidden")).toBe(true)
  expect(document.activeElement).toBe(page.root.querySelector("b19-trigger button"))
})

test("agent: an agent opens the picker and picks an emoji, and an emoji that is not in the grid is refused", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const picker = page.live().find((entry) => entry.label === "Emoji picker")!
  expect(picker.actions).toEqual(expect.arrayContaining(["setOpen", "choose"]))
  expect(picker.open).toBe(false)
  expect(picker.value).toBe("star")

  const refused = await page.agent.act({ steps: [{ ref: "Emoji picker", action: "choose", args: ["Unicorn"] }] })
  expect(refused.ok).toBe(false)
  expect(refused.error?.message).toContain("No emoji")
  expect(status()).toBe("Reaction: Star ⭐.")

  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(ui.task!.done(page.root)).toBe(true)
  expect(page.root.querySelector("b19-emoji[value=rocket]")!.getAttribute("aria-selected")).toBe("true")
  expect(page.root.querySelector("b19-popup")!.hasAttribute("hidden")).toBe(true)
})
