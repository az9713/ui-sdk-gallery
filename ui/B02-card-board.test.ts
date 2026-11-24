import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { board } from "./B02-card-board"

// To do: A, B. Doing: C. Done: D. Doing holds at most 2 cards.
const lists = { todo: ["A", "B"], doing: ["C"], done: ["D"] }
const options = { defaultValue: lists }
const card = (value: string) => `<card value="${value}">${value}</card>`
const markup = `<root aria-label="Board"><column value="todo" aria-label="To do">${card("A")}${card("B")}</column><column value="doing" aria-label="Doing">${card("C")}</column><column value="done" aria-label="Done">${card("D")}</column><add>New card</add></root>`
const focused = () => document.activeElement?.textContent

test("keyboard: arrow keys move in a column and between columns, and Home, End go to the column ends", async () => {
  const view = mount(board, options, markup)
  try {
    await view.keys("Tab")
    expect(focused()).toBe("A")
    await view.keys("ArrowUp")
    expect(focused()).toBe("A")
    await view.keys("ArrowDown")
    expect(focused()).toBe("B")
    await view.keys("ArrowRight")
    expect(focused()).toBe("C")
    await view.keys("ArrowRight")
    expect(focused()).toBe("D")
    await view.keys("ArrowRight")
    expect(focused()).toBe("D")
    await view.keys("ArrowLeft", "ArrowLeft")
    expect(focused()).toBe("A")
    await view.keys("End")
    expect(focused()).toBe("B")
    await view.keys("Home")
    expect(focused()).toBe("A")
  } finally {
    view.unmount()
  }
})

test("keyboard: the board is 1 tab stop, and each column is a named listbox of options", async () => {
  const view = mount(board, options, markup)
  try {
    expect(view.root.getAttribute("role")).toBe("group")
    const columns = view.root.querySelectorAll("[role=listbox]")
    expect([...columns].map((el) => el.getAttribute("aria-label"))).toEqual(["To do", "Doing", "Done"])
    expect(view.root.querySelectorAll("[role=option]").length).toBe(4)
    await view.keys("Tab", "ArrowDown", "ArrowRight")
    expect(view.root.querySelectorAll('[role=option][tabindex="0"]').length).toBe(1)
    expect(view.part("card", "C")!.getAttribute("tabindex")).toBe("0")
    expect(view.part("card", "A")!.getAttribute("aria-selected")).toBe("false")
    expect(view.part("card", "A")!.hasAttribute("data-moving")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: Space picks a card up, Right moves it to the next column, and Space drops it", async () => {
  const view = mount(board, options, markup)
  try {
    await view.keys("Tab", "Space")
    expect(view.part("card", "A")!.getAttribute("aria-selected")).toBe("true")
    expect(view.part("card", "A")!.hasAttribute("data-moving")).toBe(true)
    await view.keys("ArrowRight", "Space")
    expect(view.state.value).toEqual({ todo: ["B"], doing: ["A", "C"], done: ["D"] })
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "move-key", source: "keyboard" })
    expect(view.part("card", "A")!.getAttribute("aria-selected")).toBe("false")
    expect(view.announced.join(" ")).toContain("Doing")
  } finally {
    view.unmount()
  }
})

test("keyboard: Enter picks a card up, Down moves it in its column, and Escape puts it back", async () => {
  const view = mount(board, options, markup)
  try {
    await view.keys("Tab", "Enter", "ArrowDown", "Escape")
    expect(view.state.value).toEqual(lists)
    expect(view.changes.length).toBe(0)
    await view.keys("Enter", "ArrowDown", "Enter")
    expect(view.state.value.todo).toEqual(["B", "A"])
  } finally {
    view.unmount()
  }
})

test("keyboard: Doing takes at most 2 cards, so a third card skips it", async () => {
  const view = mount(board, options, markup)
  try {
    await view.keys("Tab", "Space", "ArrowRight", "Space")
    expect(view.state.value.doing).toEqual(["A", "C"])
    expect(view.part("column", "doing")!.hasAttribute("data-full")).toBe(true)
    view.part("card", "B")!.focus()
    await view.keys("Space", "ArrowRight", "Space")
    expect(view.state.value).toEqual({ todo: [], doing: ["A", "C"], done: ["B", "D"] })
  } finally {
    view.unmount()
  }
})

test("pointer: a drag moves a card to another column", async () => {
  const view = mount(board, options, markup)
  try {
    await view.drag(view.part("card", "B")!, { to: view.part("column", "done")! })
    expect(view.state.value).toEqual({ todo: ["A"], doing: ["C"], done: ["D", "B"] })
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag" })
  } finally {
    view.unmount()
  }
})

test("pointer: a drag of New card onto a column adds a card there, and a click adds it to To do", async () => {
  const view = mount(board, options, markup)
  try {
    await view.drag(view.part("add")!, { to: view.part("column", "done")! })
    expect(view.state.value.done).toEqual(["D", "New card 1"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag" })
    expect(document.querySelector("[data-drag-preview]")).toBe(null)
    await view.click(view.part("add")!)
    expect(view.state.value.todo).toEqual(["A", "B", "New card 2"])
  } finally {
    view.unmount()
  }
})

test("agent: moveCard and addCard check the card and the column, and refuse a full Doing", async () => {
  const view = mount(board, options, markup)
  try {
    expect(() => view.api.moveCard("A", "Shipped")).toThrow('No column "Shipped". Columns: To do, Doing, Done.')
    expect(() => view.api.moveCard("Z", "done")).toThrow('No card "Z"')
    expect(view.api.moveCard("A", "Doing")).toBe(true)
    expect(() => view.api.moveCard("B", "doing")).toThrow("Doing holds at most 2 cards.")
    expect(() => view.api.addCard("Doing")).toThrow("Doing holds at most 2 cards.")
    expect(view.state.value).toEqual({ todo: ["B"], doing: ["C", "A"], done: ["D"] })
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "imperative" })
  } finally {
    view.unmount()
  }
})

test("server: the board renders with no DOM", () => {
  checkServer(board, options, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(board, options, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const column = (list: string) =>
  [...page.root.querySelectorAll(`b02-board-column[value=${list}] b02-board-card`)].map((el) => el.textContent)

test("names: the page names the board, its 3 columns, each card and the button", async () => {
  page = mountUI(ui)
  await settle()
  const root = page.root.querySelector("b02-board")!
  expect(root.getAttribute("aria-label")).toBe("Sprint board")
  expect(root.getAttribute("role")).toBe("group")
  expect([...page.root.querySelectorAll("b02-board-column")].map((el) => el.getAttribute("aria-label"))).toEqual(["To do", "Doing", "Done"])
  expect(column("todo")).toEqual(["Write release notes", "Fix login bug", "Update icons"])
  expect(page.root.querySelector("b02-board-add button")!.textContent).toBe("New card")
  expect(page.root.querySelectorAll('b02-board-card[tabindex="0"]').length).toBe(1)
  expect(status()).toBe("No card has moved.")
})

test("keyboard: on the page, a card moves to its new column with focus on it, and Enter on New card adds a card", async () => {
  page.root.querySelector<HTMLElement>("b02-board-card")!.focus()
  await keys("Space", "ArrowRight", "ArrowRight", "Space")
  expect(column("done")).toEqual(["Write release notes", "Billing export"])
  expect(focused()).toBe("Write release notes")
  expect(status()).toBe("Moved Write release notes to Done.")
  expect(page.root.querySelectorAll('b02-board-card[tabindex="0"]').length).toBe(1)
  await keys("ArrowDown")
  expect(focused()).toBe("Billing export")
  page.root.querySelector<HTMLElement>("b02-board-add button")!.focus()
  await keys("Enter")
  expect(column("todo")).toEqual(["Fix login bug", "Update icons", "New card 1"])
  expect(status()).toBe("Added New card 1 to To do.")
})

test("agent: an agent finds the board, moves a card, adds a card, and is refused a third card in Doing", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const entry = page.live().find((e) => e.label === "Sprint board")!
  expect(entry.actions).toEqual(["moveCard", "addCard"])
  const found = await page.agent.query({ within: "Sprint board", text: "login" })
  expect(JSON.stringify(found)).toContain("Fix login bug, To do")

  const result = await page.agent.act({
    steps: [
      { ref: "Sprint board", action: "moveCard", args: ["Fix login bug", "Doing"] },
      { ref: "Sprint board", action: "addCard", args: ["Done"] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(column("doing")).toEqual(["Search page", "Fix login bug"])
  expect(column("done")).toContain("New card 2")
  expect(status()).toBe("Added New card 2 to Done.")

  const refused = await page.agent.act({ steps: [{ ref: "Sprint board", action: "moveCard", args: ["Update icons", "Doing"] }] })
  expect(refused.ok).toBe(false)
  expect(refused.error?.message).toContain("Doing holds at most 2 cards.")
  expect(column("doing")).toEqual(["Search page", "Fix login bug"])
})
