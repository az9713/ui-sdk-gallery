import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui, { FILES as REPO, fileFinder } from "./B38-file-finder"

// jsdom has no canvas 2D context. This fake one records each cell that the treemap draws, with the colors it used.
type Cell = { w: number; h: number; fill: string; stroke: string }
const drawn = { fills: [] as { w: number; h: number; fill: string }[], strokes: [] as string[] }
const fake = {
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  font: "",
  textBaseline: "",
  setTransform() {},
  fillText() {},
  measureText: () => ({ width: 10 }),
  fillRect(_x: number, _y: number, w: number, h: number) {
    if (this.fillStyle !== "#020c05") drawn.fills.push({ w, h, fill: this.fillStyle })
  },
  // The 3px outline of the highlighted file is not a cell border.
  strokeRect() {
    if (this.lineWidth === 1) drawn.strokes.push(this.strokeStyle)
  },
}
HTMLCanvasElement.prototype.getContext = (() => fake) as never
// Cell area follows file size, so the cells in order of area are the files in order of size. That names each cell.
const cells = () => {
  const bySize = [...REPO].sort((a, b) => b.size - a.size).map((file) => file.path)
  const list: (Cell & { path: string })[] = drawn.fills.map((cell, i) => ({ ...cell, stroke: drawn.strokes[i], path: "" }))
  list.sort((a, b) => b.w * b.h - a.w * a.h).forEach((cell, i) => (cell.path = bySize[i]))
  return new Map(list.map((cell) => [cell.path, cell]))
}

// 5 files. "ordts" matches 2 of them: tests/orders.test.ts scores higher than src/routes/orders.ts, but comes later in the repository.
const FILES = [
  { path: "src/server.ts", size: 7.4 },
  { path: "src/routes/orders.ts", size: 14.2 },
  { path: "tests/orders.test.ts", size: 11.5 },
  { path: "package.json", size: 1.7 },
  { path: "README.md", size: 3.6 },
]
const PATHS = FILES.map((file) => file.path)
const options = { files: FILES }
const markup = `<root aria-label="File finder"><input aria-label="Find a file" /><list aria-label="Files">${PATHS.map((path) => `<file value="${path}" label="${path}">${path}</file>`).join("")}</list><empty>No file matches.</empty></root>`
type View = ReturnType<typeof mount<typeof fileFinder>>

const input = (view: View) => view.root.querySelector("input")!
const file = (view: View, path: string) => view.part("file", path)!
// A file that does not match is not on the page. The element stays in the markup, as web components keep it.
const shown = (view: View) => PATHS.filter((path) => file(view, path).isConnected && !file(view, path).hidden)
const emptyShown = (view: View) => view.part("empty")!.isConnected && !view.part("empty")!.hidden
const highlighted = (view: View) => PATHS.filter((path) => file(view, path).hasAttribute("data-highlighted"))

async function open() {
  const view = mount(fileFinder, options, markup)
  await view.keys("Tab")
  return view
}

test("keyboard: the finder is 1 tab stop, and focus stays in the search box", async () => {
  const view = await open()
  try {
    expect(document.activeElement).toBe(input(view))
    expect(input(view).getAttribute("role")).toBe("combobox")
    expect(input(view).getAttribute("aria-controls")).toBe(view.part("list")!.id)
    expect(view.part("list")!.getAttribute("role")).toBe("listbox")
    expect(view.root.querySelectorAll("[tabindex]").length).toBe(0)
    await view.keys("ArrowDown", "ArrowDown", "ArrowUp")
    expect(document.activeElement).toBe(input(view))
  } finally {
    view.unmount()
  }
})

test("keyboard: ArrowDown and ArrowUp move the highlight, and aria-activedescendant follows it", async () => {
  const view = await open()
  try {
    expect(input(view).hasAttribute("aria-activedescendant")).toBe(false)
    await view.keys("ArrowDown")
    expect(highlighted(view)).toEqual(["src/server.ts"])
    expect(input(view).getAttribute("aria-activedescendant")).toBe(file(view, "src/server.ts").id)
    await view.keys("ArrowDown", "ArrowDown")
    expect(highlighted(view)).toEqual(["tests/orders.test.ts"])
    expect(input(view).getAttribute("aria-activedescendant")).toBe(file(view, "tests/orders.test.ts").id)
    await view.keys("ArrowUp")
    expect(highlighted(view)).toEqual(["src/routes/orders.ts"])
  } finally {
    view.unmount()
  }
})

test("keyboard: letters in order find a file, with other letters between them", async () => {
  const view = await open()
  try {
    await view.type("pgj")
    expect(shown(view)).toEqual(["package.json"])
    await view.keys("Escape")
    await view.type("ORD")
    expect(shown(view)).toEqual(["src/routes/orders.ts", "tests/orders.test.ts"])
  } finally {
    view.unmount()
  }
})

test("keyboard: the best match comes first, and equal scores keep the order of the repository", async () => {
  const view = await open()
  try {
    expect(view.api.ranked()).toEqual(PATHS)
    await view.type("ordts")
    expect(view.api.ranked()).toEqual(["tests/orders.test.ts", "src/routes/orders.ts"])
    expect(highlighted(view)).toEqual(["tests/orders.test.ts"])
    await view.keys("ArrowDown")
    expect(highlighted(view)).toEqual(["src/routes/orders.ts"])
    await view.keys("ArrowDown")
    expect(highlighted(view)).toEqual(["tests/orders.test.ts"])
  } finally {
    view.unmount()
  }
})

test("keyboard: each matched letter is inside a mark, and the text keeps its case", async () => {
  const view = await open()
  try {
    await view.type("ORDTS")
    const row = file(view, "tests/orders.test.ts")
    expect(row.querySelector("[data-path]")!.textContent).toBe("tests/orders.test.ts")
    expect([...row.querySelectorAll("mark")].map((mark) => mark.textContent).join("")).toBe("ordts")
    expect(file(view, "src/routes/orders.ts").querySelectorAll("mark").length).toBeGreaterThan(0)
    await view.keys("Escape")
    expect(file(view, "tests/orders.test.ts").querySelectorAll("mark").length).toBe(0)
  } finally {
    view.unmount()
  }
})

test("keyboard: typing highlights the best match, so Enter opens it", async () => {
  const view = await open()
  try {
    await view.type("ordts")
    expect(shown(view)).toEqual(["src/routes/orders.ts", "tests/orders.test.ts"])
    await view.keys("Enter")
    expect(view.state.value).toBe("tests/orders.test.ts")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
  } finally {
    view.unmount()
  }
})

test("keyboard: Enter opens the highlighted file, and Enter with no highlight opens nothing", async () => {
  const view = await open()
  try {
    await view.keys("Enter")
    expect(view.state.value).toBe(null)
    await view.keys("ArrowDown", "ArrowDown", "Enter")
    expect(view.state.value).toBe("src/routes/orders.ts")
    expect(file(view, "src/routes/orders.ts").getAttribute("aria-selected")).toBe("true")
    expect(file(view, "src/routes/orders.ts").hasAttribute("data-selected")).toBe(true)
    expect(file(view, "src/server.ts").getAttribute("aria-selected")).toBe("false")
    expect(file(view, "src/server.ts").hasAttribute("data-selected")).toBe(false)
    await view.keys("ArrowDown", "Enter")
    expect(view.state.value).toBe("tests/orders.test.ts")
    expect(file(view, "src/routes/orders.ts").getAttribute("aria-selected")).toBe("false")
    expect(document.activeElement).toBe(input(view))
  } finally {
    view.unmount()
  }
})

test("keyboard: Escape clears the search text, and with no text it leaves the key alone", async () => {
  const view = await open()
  try {
    await view.type("ordts")
    await view.keys("Escape")
    expect(input(view).value).toBe("")
    expect(shown(view)).toEqual(PATHS)
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    input(view).dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: a search with no match shows the empty message and highlights nothing", async () => {
  const view = await open()
  try {
    await view.type("ordts")
    expect(emptyShown(view)).toBe(false)
    await view.keys("Escape")
    await view.type("zzz")
    expect(shown(view)).toEqual([])
    expect(emptyShown(view)).toBe(true)
    expect(highlighted(view)).toEqual([])
    await view.keys("Enter")
    expect(view.state.value).toBe(null)
    expect(view.announced.at(-1)).toBe("No file matches.")
  } finally {
    view.unmount()
  }
})

test("keyboard: a click opens a file, and a press on a file keeps focus in the search box", async () => {
  const view = await open()
  try {
    // jsdom moves focus on a press whatever the page does, so the test reads whether the page cancels the focus move.
    const press = new MouseEvent("pointerdown", { bubbles: true, cancelable: true })
    file(view, "package.json").dispatchEvent(press)
    expect(press.defaultPrevented).toBe(true)
    await view.click(file(view, "package.json"))
    expect(view.state.value).toBe("package.json")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press" })
    expect(document.activeElement).toBe(input(view))
  } finally {
    view.unmount()
  }
})

test("keyboard: moving the mouse over a file highlights it", async () => {
  const view = await open()
  try {
    await view.hover(file(view, "README.md"))
    expect(highlighted(view)).toEqual(["README.md"])
    expect(input(view).getAttribute("aria-activedescendant")).toBe(file(view, "README.md").id)
  } finally {
    view.unmount()
  }
})

test("agent: search and open run through the api, and a path that is not in the repository is refused", async () => {
  const view = mount(fileFinder, options, markup)
  try {
    view.api.search("ordts")
    await view.settle()
    expect(input(view).value).toBe("ordts")
    expect(shown(view)).toEqual(["src/routes/orders.ts", "tests/orders.test.ts"])
    expect(view.announced.at(-1)).toBe("2 files match.")
    expect(view.api.open("docs/nothing.md")).toBe(false)
    expect(view.state.value).toBe(null)
    expect(view.api.open("README.md")).toBe(true)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "imperative" })
    view.api.clear()
    await view.settle()
    expect(input(view).value).toBe("")
    expect(shown(view)).toEqual(PATHS)
  } finally {
    view.unmount()
  }
})

test("keyboard: onValueChange can refuse opening a file", async () => {
  const view = mount(fileFinder, { ...options, value: "package.json", onValueChange: (_value, details) => details.cancel() }, markup)
  try {
    expect(file(view, "package.json").getAttribute("aria-selected")).toBe("true")
    await view.keys("Tab", "ArrowDown", "Enter")
    expect(view.state.value).toBe("package.json")
  } finally {
    view.unmount()
  }
})

test("server: the finder renders with no DOM", () => {
  checkServer(fileFinder, options, markup)
})

// The vertical list has no left or right to check, so checkDirection does not apply.
test("direction: the same keys give the same result in left to right and right to left", async () => {
  const results: string[][] = []
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = await open()
    try {
      await view.type("ordts")
      await view.keys("ArrowDown", "ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Enter")
      results.push([String(view.state.value), highlighted(view).join()])
      expect(input(view).value).toBe("ordts")
    } finally {
      view.unmount()
    }
  }
  document.documentElement.dir = "ltr"
  expect(results[1]).toEqual(results[0])
  expect(results[0]).toEqual(["src/routes/orders.ts", "src/routes/orders.ts"])
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const field = () => page.root.querySelector("input")!
const canvas = () => page.root.querySelector("canvas")!
const type = async (text: string) => {
  field().value = text
  field().dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
}
const order = () => [...page.root.querySelectorAll("b38-file:not([hidden])")].map((el) => el.getAttribute("value"))

test("names: the page names the finder, the search box, the list and the treemap", async () => {
  page = mountUI(ui)
  await settle()
  expect(page.root.querySelector("b38-finder")!.getAttribute("aria-label")).toBe("File finder")
  expect(field().getAttribute("aria-label")).toBe("Find a file")
  expect(field().getAttribute("role")).toBe("combobox")
  expect(page.root.querySelector("b38-finder-list")!.getAttribute("role")).toBe("listbox")
  expect(page.root.querySelector("b38-finder-list")!.getAttribute("aria-label")).toBe("Files")
  expect(page.root.querySelectorAll("b38-file").length).toBe(16)
  expect(canvas().getAttribute("role")).toBe("img")
  expect(canvas().getAttribute("aria-label")).toBe("Treemap of 16 files by size.")
  expect(status()).toBe("No file is open.")
  expect(tabbable(page.root)).toEqual([field()])
})

test("keyboard: on the page, the list is in the order of the score, and Enter opens the best match", async () => {
  field().focus()
  await type("ordts")
  expect(order()).toEqual(["tests/orders.test.ts", "src/routes/orders.ts"])
  const marks = [...page.root.querySelectorAll('b38-file[value="tests/orders.test.ts"] mark')].map((mark) => mark.textContent)
  expect(marks.join("")).toBe("ordts")
  await keys("Enter")
  expect(status()).toBe("Opened: tests/orders.test.ts.")
  expect(page.root.querySelector("b38-file[data-selected]")!.getAttribute("value")).toBe("tests/orders.test.ts")
  await keys("Escape")
  expect(field().value).toBe("")
  expect(order().length).toBe(16)
  expect(order()[0]).toBe("src/index.ts")
})

test("names: the treemap lights the files that match a search and dims the others", async () => {
  drawn.fills.length = 0
  drawn.strokes.length = 0
  await type("ordts")
  // Each repaint draws all 16 cells again: read the last 16.
  drawn.fills.splice(0, drawn.fills.length - 16)
  drawn.strokes.splice(0, drawn.strokes.length - 16)
  const grid = cells()
  expect(grid.size).toBe(16)
  for (const [path, cell] of grid) {
    const matches = path === "tests/orders.test.ts" || path === "src/routes/orders.ts"
    if (matches) {
      expect(cell.fill, path).toContain("rgba(76, 255, 122, ")
      expect(cell.stroke, path).toBe("rgb(76, 255, 122)")
    } else {
      expect(cell.fill, path).toBe("#06170c")
      expect(cell.stroke, path).toBe("#14532d")
    }
  }
  await type("")
})

test("names: the treemap says how many files match a search", async () => {
  await type("pgj")
  expect(canvas().getAttribute("aria-label")).toBe("Treemap of 16 files by size. 1 file matches pgj.")
  await type("")
  expect(canvas().getAttribute("aria-label")).toBe("Treemap of 16 files by size.")
})

test("agent: an agent finds the finder, searches, and opens a file that is not an invented one", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const finder = page.live().find((entry) => entry.label === "File finder")!
  expect([...finder.actions].sort()).toEqual(["clear", "open", "search"])

  const refused = await page.agent.act({ steps: [{ ref: "File finder", action: "open", args: ["docs/nothing.md"] }] })
  expect(refused.steps[0].result).toBe(false)
  expect(status()).toBe("Opened: tests/orders.test.ts.")

  const result = await page.agent.act({
    steps: [
      { ref: "File finder", action: "search", args: ["ordts"] },
      { ref: "File finder", action: "open", args: ["src/routes/orders.ts"] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Opened: src/routes/orders.ts.")
  expect(field().value).toBe("ordts")
  const items = page.agent.snapshot().find((entry) => entry.label === "File finder")!.items
  expect(JSON.stringify(items)).toBe(
    JSON.stringify([
      { value: "tests/orders.test.ts", label: "tests/orders.test.ts" },
      { value: "src/routes/orders.ts", label: "src/routes/orders.ts" },
    ]),
  )
})
