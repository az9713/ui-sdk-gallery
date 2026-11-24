import { checkDirection, checkPattern, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { outline } from "./B15-outline-editor"

const rows = [
  { key: "A", depth: 0 },
  { key: "A1", depth: 1 },
  { key: "A2", depth: 1 },
  { key: "B", depth: 0 },
  { key: "C", depth: 0 },
]
const markupOf = (list: { key: string }[]) =>
  `<root aria-label="Outline">${list.map((r) => `<row value="${r.key}"><span data-toggle></span>${r.key}</row>`).join("")}</root>`
const markup = markupOf(rows)
const options = { defaultValue: rows }
type View = ReturnType<typeof mount<typeof outline>>
const row = (view: View, key: string) => view.part("row", key)!
const shown = (view: View, key: string) => row(view, key).isConnected && !row(view, key).hidden
const depths = (list: { key: string; depth: number }[]) => list.map(({ key, depth }) => `${"-".repeat(depth)}${key}`)

// jsdom has no layout: each row is 40 px high with a 10 px gap, at its place among the shown rows, and indented 28 px for each level.
function layOut(view: View) {
  for (const { key } of rows) {
    row(view, key).getBoundingClientRect = () => {
      const visible = view.api.rows().filter((r) => view.api.shown(view.state, r.key))
      const index = visible.findIndex((r) => r.key === key)
      const left = (visible[index]?.depth ?? 0) * 28
      const top = index * 50
      return { x: left, y: top, left, top, right: 300, bottom: top + 40, width: 300 - left, height: 40, toJSON: () => ({}) }
    }
  }
}

test("keyboard: the tree is 1 tab stop, and Up, Down, Home and End move focus without a change", async () => {
  const view = mount(outline, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(row(view, "A"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(row(view, "B").getAttribute("tabindex")).toBe("-1")
    await view.keys("ArrowDown", "ArrowDown")
    expect(document.activeElement).toBe(row(view, "A2"))
    await view.keys("ArrowUp")
    expect(document.activeElement).toBe(row(view, "A1"))
    await view.keys("End")
    expect(document.activeElement).toBe(row(view, "C"))
    await view.keys("ArrowDown")
    expect(document.activeElement).toBe(row(view, "C"))
    await view.keys("Home")
    expect(document.activeElement).toBe(row(view, "A"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(view.state.value).toEqual(rows)
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: Right goes into a branch and Left back out, then Left closes the branch and Right opens it", async () => {
  const view = mount(outline, options, markup)
  try {
    expect(row(view, "A").getAttribute("aria-expanded")).toBe("true")
    expect(row(view, "B").hasAttribute("aria-expanded")).toBe(false)
    await view.keys("Tab", "ArrowRight")
    expect(document.activeElement).toBe(row(view, "A1"))
    await view.keys("ArrowLeft")
    expect(document.activeElement).toBe(row(view, "A"))
    await view.keys("ArrowLeft")
    expect(row(view, "A").getAttribute("aria-expanded")).toBe("false")
    expect(shown(view, "A1")).toBe(false)
    expect(shown(view, "A2")).toBe(false)
    await view.keys("ArrowDown")
    expect(document.activeElement).toBe(row(view, "B"))
    await view.keys("ArrowUp", "ArrowRight")
    expect(row(view, "A").getAttribute("aria-expanded")).toBe("true")
    expect(shown(view, "A1")).toBe(true)
    expect(document.activeElement).toBe(row(view, "A"))
    expect(view.state.value).toEqual(rows)
  } finally {
    view.unmount()
  }
})

test("keyboard: Space picks up a row, Right nests it under the row above, and Space drops it", async () => {
  const view = mount(outline, options, markup)
  try {
    await view.keys("Tab", "End", "ArrowUp", "Space")
    expect(row(view, "B").getAttribute("aria-selected")).toBe("true")
    expect(row(view, "B").hasAttribute("data-grabbed")).toBe(true)
    expect(row(view, "C").getAttribute("aria-selected")).toBe("false")
    await view.keys("ArrowRight")
    expect(depths(view.api.rows())).toEqual(["A", "-A1", "-A2", "-B", "C"])
    expect(row(view, "B").getAttribute("aria-level")).toBe("2")
    expect(view.state.value).toEqual(rows)
    await view.keys("Space")
    expect(depths(view.state.value)).toEqual(["A", "-A1", "-A2", "-B", "C"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "move-key", source: "keyboard" })
    expect(row(view, "B").getAttribute("aria-selected")).toBe("false")
    expect(row(view, "B").getAttribute("aria-posinset")).toBe("3")
    expect(row(view, "B").getAttribute("aria-setsize")).toBe("3")
    expect(view.announced.at(-1)).toBe("Dropped B at level 2 in A, position 3 of 3.")
    expect(document.activeElement).toBe(row(view, "B"))
  } finally {
    view.unmount()
  }
})

test("keyboard: Enter picks up a parent, Down moves it with its children, and Enter drops it", async () => {
  const view = mount(outline, options, markup)
  try {
    await view.keys("Tab", "Enter")
    expect(row(view, "A1").getAttribute("aria-selected")).toBe("true")
    await view.keys("ArrowDown", "Enter")
    expect(depths(view.state.value)).toEqual(["B", "A", "-A1", "-A2", "C"])
    expect(document.activeElement).toBe(row(view, "A"))
  } finally {
    view.unmount()
  }
})

test("keyboard: Escape puts a picked-up row back, and Tab puts it back and goes on", async () => {
  const view = mount(outline, options, markup)
  try {
    await view.keys("Tab", "End", "Space", "ArrowUp", "ArrowRight", "Escape")
    expect(view.state.value).toEqual(rows)
    expect(view.state.moving).toBeNull()
    expect(row(view, "C").getAttribute("aria-selected")).toBe("false")
    await view.keys("Space", "ArrowUp", "Tab")
    expect(view.state.value).toEqual(rows)
    expect(view.state.moving).toBeNull()
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: the first row cannot nest, and a row goes no deeper than level 3", async () => {
  const deep = [
    { key: "A", depth: 0 },
    { key: "A1", depth: 1 },
    { key: "A2", depth: 2 },
    { key: "B", depth: 0 },
  ]
  const view = mount(outline, { defaultValue: deep }, markupOf(deep))
  try {
    await view.keys("Tab", "Space", "ArrowRight", "Space")
    expect(view.state.value).toEqual(deep)
    await view.keys("End", "Space", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "Space")
    expect(depths(view.state.value)).toEqual(["A", "-A1", "--A2", "--B"])
    expect(row(view, "B").getAttribute("aria-level")).toBe("3")
    await view.keys("Space", "ArrowLeft", "ArrowLeft", "ArrowLeft", "Space")
    expect(depths(view.state.value)).toEqual(deep.map((r) => `${"-".repeat(r.depth)}${r.key}`))
  } finally {
    view.unmount()
  }
})

test("keyboard: a closed branch moves with its hidden rows, and a row dropped into a closed branch opens it", async () => {
  const view = mount(outline, options, markup)
  try {
    await view.keys("Tab", "ArrowLeft", "Space", "ArrowDown", "Space")
    expect(depths(view.state.value)).toEqual(["B", "A", "-A1", "-A2", "C"])
    expect(shown(view, "A1")).toBe(false)
    await view.keys("End", "Space", "ArrowRight")
    expect(shown(view, "C")).toBe(true)
    await view.keys("Space")
    expect(depths(view.state.value)).toEqual(["B", "A", "-A1", "-A2", "-C"])
    expect(row(view, "A").getAttribute("aria-expanded")).toBe("true")
    expect(shown(view, "A1")).toBe(true)
    expect(document.activeElement).toBe(row(view, "C"))
  } finally {
    view.unmount()
  }
})

test("keyboard: the tree passes the APG tree view checks, typing a letter included", async () => {
  const view = mount(outline, options, markup)
  try {
    await checkPattern(view.root, "tree")
  } finally {
    view.unmount()
  }
})

test("pointer: a drag sideways nests a row under the row above and reports the drag", async () => {
  const view = mount(outline, options, markup)
  layOut(view)
  try {
    await view.drag(row(view, "B"), { by: { x: 40, y: 0 } })
    await view.settle()
    expect(depths(view.state.value)).toEqual(["A", "-A1", "-A2", "-B", "C"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag", source: "mouse" })
    expect(view.state.moving).toBeNull()
  } finally {
    view.unmount()
  }
})

test("pointer: a click on the arrow closes and opens a branch, and a click on a row changes nothing", async () => {
  const view = mount(outline, options, markup)
  try {
    await view.click(row(view, "A").querySelector("[data-toggle]")!)
    expect(row(view, "A").getAttribute("aria-expanded")).toBe("false")
    expect(shown(view, "A1")).toBe(false)
    await view.click(row(view, "A").querySelector("[data-toggle]")!)
    expect(shown(view, "A1")).toBe(true)
    await view.click(row(view, "B"))
    expect(view.state.value).toEqual(rows)
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("server: the outline renders with no DOM", () => {
  checkServer(outline, options, markup)
})

test("direction: Left and Right swap on a right to left page", async () => {
  await checkDirection(outline, options, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const items = () => [...page.root.querySelectorAll<HTMLElement>("b15-row")]
const item = (name: string) => items().find((el) => el.textContent === name)!
const titles = () => items().map((el) => el.textContent)

test("names: the page names the tree, its rows and their levels, and describes how to move a row", async () => {
  page = mountUI(ui)
  await settle()
  const tree = page.root.querySelector("b15-outline")!
  expect(tree.getAttribute("aria-label")).toBe("Outline")
  expect(tree.getAttribute("role")).toBe("tree")
  expect(titles()).toEqual(["Goals", "Grow signups", "Cut churn", "Timeline", "Beta in March", "Launch in May", "Risks", "Late hiring"])
  expect(items().map((el) => el.getAttribute("aria-level"))).toEqual(["1", "2", "2", "1", "2", "2", "1", "2"])
  for (const el of items()) {
    expect(el.getAttribute("role")).toBe("treeitem")
    expect(page.root.querySelector(`#${el.getAttribute("aria-describedby")}`)!.textContent).toContain("Space")
    expect(el.hasAttribute("aria-disabled")).toBe(false)
  }
  expect(items().filter((el) => el.tabIndex === 0).length).toBe(1)
  expect(status()).toBe("The outline has not changed.")
})

test("keyboard: on the page, the rows follow the new order, focus stays on the moved row and the status line reports it", async () => {
  item("Late hiring").focus()
  await keys("Space", "ArrowUp")
  expect(titles()).toEqual(["Goals", "Grow signups", "Cut churn", "Timeline", "Beta in March", "Launch in May", "Late hiring", "Risks"])
  expect(document.activeElement).toBe(item("Late hiring"))
  expect(status()).toBe("The outline has not changed.")
  await keys("Space")
  expect(status()).toBe("Moved Late hiring under Timeline, place 3 of 3.")
  expect(document.activeElement).toBe(item("Late hiring"))
  expect(item("Risks").hasAttribute("aria-expanded")).toBe(false)
  expect(items().filter((el) => el.tabIndex === 0).length).toBe(1)
  await keys("Space", "ArrowDown", "Space")
  expect(titles()).toEqual(["Goals", "Grow signups", "Cut churn", "Timeline", "Beta in March", "Launch in May", "Risks", "Late hiring"])
  expect(status()).toBe("Moved Late hiring under Risks, place 1 of 1.")
})

test("pointer: on the page, the arrow of a branch hides and shows its rows", async () => {
  const toggle = item("Goals").querySelector<HTMLElement>("[data-toggle]")!
  toggle.click()
  await settle()
  expect(item("Goals").getAttribute("aria-expanded")).toBe("false")
  expect(item("Grow signups").hidden).toBe(true)
  toggle.click()
  await settle()
  expect(item("Grow signups").hidden).toBe(false)
  expect(status()).toBe("Moved Late hiring under Risks, place 1 of 1.")
})

test("agent: an agent finds the outline and its rows, nests 1 row and moves a branch", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const tree = page.live().find((entry) => entry.label === "Outline")!
  expect(tree.actions).toEqual(["move"])
  const found = JSON.stringify(await page.agent.query({ within: "Outline" }))
  for (const title of titles()) expect(found).toContain(title!)
  expect(ui.task!.done(page.root)).toBe(false)

  const result = await page.agent.act(ui.task!)
  expect(result.ok, result.error?.message).toBe(true)
  expect(ui.task!.done(page.root)).toBe(true)
  expect(item("Cut churn").getAttribute("aria-level")).toBe("2")
  expect(item("Risks").getAttribute("aria-posinset")).toBe("2")

  const wrong = await page.agent.act({ steps: [{ ref: "Outline", action: "move", args: ["Budget", null, 0] }] })
  expect(wrong.ok).toBe(false)
  expect(wrong.error?.message).toContain('No row "Budget"')
})
