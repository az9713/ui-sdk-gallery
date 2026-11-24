import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { crossword, rowsHtml } from "./B36-crossword-grid"

// The grid as printed: SEA / PALM / ACTOR / HERO / RED, with black squares at r0c3, r0c4, r1c4, r3c0, r4c0, r4c1.
const markup = `<root aria-label="Crossword">${rowsHtml(false, {}).replaceAll("b36-row", "row").replaceAll("b36-cell", "cell")}</root>`
const options = { defaultValue: {} }
type View = ReturnType<typeof mount<typeof crossword>>
// mount() does not write the value prop as an attribute, so a square is found by its place in document order.
const square = (view: View, id: string) =>
  view.root.querySelectorAll<HTMLElement>("[data-slot=crossword-cell]")[Number(id[1]) * 5 + Number(id[3])]

test("keyboard: the grid is 1 tab stop, and the arrow keys move in 2 dimensions past black squares", async () => {
  const view = mount(crossword, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(square(view, "r0c0"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await view.keys("ArrowRight", "ArrowRight", "ArrowRight")
    expect(document.activeElement).toBe(square(view, "r0c2"))
    await view.keys("ArrowDown", "ArrowRight", "ArrowRight")
    expect(document.activeElement).toBe(square(view, "r1c3"))
    await view.keys("ArrowDown", "ArrowDown", "ArrowDown")
    expect(document.activeElement).toBe(square(view, "r4c3"))
    await view.keys("Home")
    expect(document.activeElement).toBe(square(view, "r4c2"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(square(view, "r0c3").getAttribute("aria-disabled")).toBe("true")
    expect(square(view, "r0c3").hasAttribute("data-block")).toBe(true)
    expect(square(view, "r4c2").hasAttribute("aria-disabled")).toBe(false)
    expect(square(view, "r4c2").hasAttribute("data-active")).toBe(true)
  } finally {
    view.unmount()
  }
})

test("keyboard: a letter fills the square and focus goes on along the word, and Space switches to Down", async () => {
  const view = mount(crossword, options, markup)
  try {
    await view.keys("Tab")
    await view.keys("s", "e", "a")
    expect(view.state.value).toMatchObject({ r0c0: "S", r0c1: "E", r0c2: "A" })
    expect(view.changes.find((c) => c.key === "value")).toMatchObject({ reason: "input", source: "keyboard" })
    expect(document.activeElement).toBe(square(view, "r0c2"))
    expect(square(view, "r0c1").hasAttribute("data-word")).toBe(true)
    await view.keys("Space")
    expect(view.state.word).toBe("3 Down")
    expect(square(view, "r0c1").hasAttribute("data-word")).toBe(false)
    expect(square(view, "r2c2").hasAttribute("data-word")).toBe(true)
    await view.keys("a", "l")
    expect(view.state.value).toMatchObject({ r0c2: "A", r1c2: "L" })
    expect(document.activeElement).toBe(square(view, "r2c2"))
  } finally {
    view.unmount()
  }
})

test("keyboard: Backspace clears the square, and on an empty square it goes back and clears the one before", async () => {
  const view = mount(crossword, { defaultValue: { r1c0: "P", r1c1: "A" } }, markup)
  try {
    await view.keys("Tab", "ArrowDown", "ArrowRight")
    expect(document.activeElement).toBe(square(view, "r1c1"))
    await keys("Backspace")
    expect(view.state.value.r1c1).toBe("")
    expect(document.activeElement).toBe(square(view, "r1c1"))
    await view.keys("ArrowRight")
    await keys("Backspace")
    expect(document.activeElement).toBe(square(view, "r1c1"))
    await keys("Backspace")
    expect(document.activeElement).toBe(square(view, "r1c0"))
    expect(view.state.value.r1c0).toBe("")
  } finally {
    view.unmount()
  }
})

test("keyboard: Left, Up and End move back and to the row's end, and Delete clears the square", async () => {
  const view = mount(crossword, { defaultValue: { r2c3: "O" } }, markup)
  try {
    await view.keys("Tab", "ArrowDown", "ArrowDown", "End")
    expect(document.activeElement).toBe(square(view, "r2c4"))
    await view.keys("ArrowLeft")
    expect(document.activeElement).toBe(square(view, "r2c3"))
    await keys("Delete")
    expect(view.state.value.r2c3).toBe("")
    expect(document.activeElement).toBe(square(view, "r2c3"))
    await view.keys("ArrowUp")
    expect(document.activeElement).toBe(square(view, "r1c3"))
  } finally {
    view.unmount()
  }
})

test("pointer: a click focuses a white square and makes its word current, and a black square takes no focus", async () => {
  const view = mount(crossword, options, markup)
  try {
    await view.click(square(view, "r3c1"))
    expect(document.activeElement).toBe(square(view, "r3c1"))
    expect(view.state.word).toBe("8 Across")
    await view.click(square(view, "r3c0"))
    expect(document.activeElement).toBe(square(view, "r3c1"))
    expect(square(view, "r3c0").hasAttribute("tabindex")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("server: the crossword renders with no DOM", () => {
  checkServer(crossword, options, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(crossword, options, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const cell = (id: string) => page.root.querySelector<HTMLElement>(`b36-cell[value="${id}"]`)!
const list = (dir: string) => [...page.root.querySelectorAll(`[data-list=${dir}] li`)].map((li) => li.textContent)

test("names: the page names the grid, its squares and the button, and lists the clues", async () => {
  page = mountUI(ui)
  await settle()
  const grid = page.root.querySelector("b36-crossword")!
  expect(grid.getAttribute("role")).toBe("grid")
  expect(grid.getAttribute("aria-label")).toBe("Crossword")
  expect(page.root.querySelectorAll("b36-row[role=row]").length).toBe(5)
  expect(page.root.querySelectorAll("b36-cell[role=gridcell]").length).toBe(25)
  expect(page.root.querySelectorAll("b36-cell[aria-disabled=true]").length).toBe(6)
  expect(page.root.querySelector("[data-turn] button")!.textContent).toBe("Turn grid")
  expect(list("across")[0]).toBe("1 Where the tide comes in")
  expect(list("down")[0]).toBe("1 Place for a mud bath")
  expect(status()).toBe("10 of 19 squares filled.")
})

test("keyboard: on the page, Alt+T turns the grid, focus stays on the same square, and typing goes on down the turned word", async () => {
  cell("r0c0").focus()
  await keys("ArrowDown")
  const before = cell("r1c0")
  expect(document.activeElement).toBe(before)
  expect(page.root.querySelector("[data-clue]")!.textContent).toBe("4 Across Tree on a desert island")

  await keys("Alt+t")
  await settle()
  const after = cell("r1c0")
  expect(after).not.toBe(before)
  expect(after.getAttribute("row")).toBe("0")
  expect(after.getAttribute("col")).toBe("1")
  expect(document.activeElement).toBe(after)
  expect(after.getAttribute("tabindex")).toBe("0")
  expect(status()).toBe("Turned the grid: the Down answers now read across.")
  expect(page.root.querySelector("[data-clue]")!.textContent).toBe("2 Down Tree on a desert island")
  expect(list("across")[0]).toBe("1 Place for a mud bath")

  await keys("p", "a")
  expect(cell("r1c0").textContent).toContain("P")
  expect(cell("r1c1").textContent).toContain("A")
  expect(document.activeElement).toBe(cell("r1c2"))
  expect(status()).toBe("12 of 19 squares filled.")

  await keys("Alt+t")
  await settle()
  expect(document.activeElement).toBe(cell("r1c2"))
  expect(cell("r1c2").getAttribute("row")).toBe("1")
  expect(status()).toBe("Turned the grid back: the Across answers read across again.")
})

test("keyboard: Turn grid keeps focus on the button and moves the tab stop with the square", async () => {
  const button = page.root.querySelector<HTMLElement>("[data-turn] button")!
  button.focus()
  await keys("Enter")
  await settle()
  expect(document.activeElement).toBe(button)
  expect(cell("r1c2").getAttribute("row")).toBe("2")
  expect(cell("r1c2").getAttribute("tabindex")).toBe("0")
  expect(page.root.querySelectorAll('b36-cell[tabindex="0"]').length).toBe(1)
  await keys("Enter")
  await settle()
  expect(cell("r1c2").getAttribute("tabindex")).toBe("0")
})

test("agent: an agent fills a word and turns the grid while a person is on a square, and gets errors it can act on", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const grid = page.live().find((entry) => entry.label === "Crossword")!
  expect([...grid.actions].sort()).toEqual(["fill", "turn"])
  expect(grid).toMatchObject({ turned: false })

  cell("r2c1").focus()
  const wrong = await page.agent.act({ steps: [{ ref: "Crossword", action: "fill", args: ["6 Across", "ACT"] }] })
  expect(wrong.ok).toBe(false)
  expect(wrong.error?.message).toContain("6 Across takes 5 letters")
  const none = await page.agent.act({ steps: [{ ref: "Crossword", action: "fill", args: ["12 Down", "SEA"] }] })
  expect(none.error?.message).toContain("Clues: 1 Across, 1 Down")

  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  await settle()
  expect(ui.task!.done(page.root)).toBe(true)
  expect(document.activeElement).toBe(cell("r2c1"))
  expect(cell("r2c1").getAttribute("row")).toBe("1")
  expect(page.live().find((entry) => entry.label === "Crossword")).toMatchObject({ turned: true })
})
