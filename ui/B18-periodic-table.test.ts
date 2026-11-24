import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { ATOMS, periodicTable } from "./B18-periodic-table"

const cell = (atom: (typeof ATOMS)[number]) =>
  `<cell value="${atom.symbol}" name="${atom.name}" number="${atom.number}" group="${atom.group}"><small>${atom.number}</small> <b>${atom.symbol}</b></cell>`
const markup = `<root aria-label="Elements">${[1, 2, 3, 4, 5]
  .map((period) => `<row>${ATOMS.filter((atom) => atom.period === period).map(cell).join("")}</row>`)
  .join("")}</root>`

const symbolOf = (el: Element | null) => el?.querySelector("b")?.textContent

// jsdom has no layout: each cell gets the box the CSS gives it, 56 pixels square with a 4 pixel gap, by group and period.
function place(cells: Iterable<HTMLElement>) {
  for (const el of cells) {
    const atom = ATOMS.find((item) => item.symbol === symbolOf(el))!
    const left = (atom.group - 1) * 60
    const top = (atom.period - 1) * 60
    el.getBoundingClientRect = () => ({ left, top, right: left + 56, bottom: top + 56, x: left, y: top, width: 56, height: 56 }) as DOMRect
  }
}
function view() {
  const v = mount(periodicTable, {}, markup)
  place(v.root.querySelectorAll<HTMLElement>("[data-slot=periodic-table-cell]"))
  return v
}
const at = (v: ReturnType<typeof view>, symbol: string) =>
  [...v.root.querySelectorAll<HTMLElement>("[data-slot=periodic-table-cell]")].find((el) => symbolOf(el) === symbol)!
const focused = () => symbolOf(document.activeElement)

test("keyboard: an arrow key moves focus to the nearest element on screen, across the gaps of the table", async () => {
  const v = view()
  try {
    await v.keys("Tab")
    expect(focused()).toBe("H")
    await v.keys("ArrowRight")
    expect(focused()).toBe("He")
    await v.keys("ArrowDown")
    expect(focused()).toBe("Ne")
    await v.keys("ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft")
    expect(focused()).toBe("B")
    await v.keys("ArrowLeft")
    expect(focused()).toBe("Be")
    await v.keys("ArrowDown", "ArrowDown")
    expect(focused()).toBe("Ca")
    await v.keys("ArrowUp", "ArrowUp")
    expect(focused()).toBe("Be")
    expect(v.state.value).toBe(null)
  } finally {
    v.unmount()
  }
})

test("keyboard: Home and End go to the first and last element, and with nothing in line an arrow takes the nearest element that way", async () => {
  const v = view()
  try {
    await v.keys("Tab", "End")
    expect(focused()).toBe("Xe")
    await v.keys("ArrowRight", "ArrowDown")
    expect(focused()).toBe("Xe")
    await v.keys("Home")
    expect(focused()).toBe("H")
    await v.keys("ArrowUp", "ArrowLeft")
    expect(focused()).toBe("H")
    at(v, "Fe").focus()
    await v.keys("ArrowUp")
    const above = focused()
    expect(above).not.toBe("Fe")
    expect(v.api.neighbors("Fe").up).toBe(above)
  } finally {
    v.unmount()
  }
})

test("keyboard: the table is 1 tab stop, and only the selected element is marked selected", async () => {
  const v = view()
  try {
    expect(v.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await v.keys("Tab", "ArrowDown", "ArrowDown", "Space")
    expect(v.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(at(v, "Na").getAttribute("tabindex")).toBe("0")
    expect(at(v, "Na").getAttribute("aria-selected")).toBe("true")
    expect(at(v, "Na").hasAttribute("data-selected")).toBe(true)
    expect(v.root.querySelectorAll('[aria-selected="true"]').length).toBe(1)
    expect(at(v, "H").getAttribute("aria-selected")).toBe("false")
    expect(at(v, "H").hasAttribute("data-selected")).toBe(false)
    expect(at(v, "Fe").getAttribute("aria-label")).toBe("26 Fe Iron")
    expect(at(v, "Fe").getAttribute("aria-colindex")).toBe("8")
    expect(at(v, "Fe").hasAttribute("aria-disabled")).toBe(false)
    expect(v.root.getAttribute("role")).toBe("grid")
    expect(v.root.getAttribute("aria-colcount")).toBe("18")
  } finally {
    v.unmount()
  }
})

test("keyboard: Space and Enter select the focused element, and the arrow keys do not", async () => {
  const v = view()
  try {
    await v.keys("Tab", "ArrowRight")
    expect(v.state.value).toBe(null)
    await v.keys("Space")
    expect(v.state.value).toBe("He")
    expect(v.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
    await v.keys("ArrowDown")
    expect(v.state.value).toBe("He")
    await v.keys("Enter")
    expect(v.state.value).toBe("Ne")
  } finally {
    v.unmount()
  }
})

test("pointer: a click selects an element", async () => {
  const v = view()
  try {
    await v.click(at(v, "Fe"))
    expect(v.state.value).toBe("Fe")
    expect(v.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press" })
  } finally {
    v.unmount()
  }
})

test("agent: selectNeighbor selects the nearest element on screen in a direction and leaves focus where it is", async () => {
  const v = view()
  try {
    await v.keys("Tab")
    expect(() => v.api.selectNeighbor("down")).toThrow("Select an element first")
    v.api.setValue("Fe")
    v.api.selectNeighbor("down")
    expect(v.state.value).toBe("Ru")
    v.api.selectNeighbor("up")
    v.api.selectNeighbor("left")
    expect(v.state.value).toBe("Mn")
    v.api.setValue("He")
    v.api.selectNeighbor("left")
    expect(v.state.value).toBe("H")
    expect(v.api.neighbors("He")).toEqual({ left: "H", right: undefined, up: undefined, down: "Ne" })
    expect(() => v.api.selectNeighbor("up")).toThrow("No element lies up of H.")
    expect(() => v.api.selectNeighbor("north")).toThrow('No direction "north"')
    expect(() => v.api.setValue("Xx")).toThrow('No element "Xx"')
    expect(v.state.value).toBe("H")
    expect(focused()).toBe("H")
  } finally {
    v.unmount()
  }
})

test("server: the table renders with no DOM", () => {
  checkServer(periodicTable, {}, markup)
})

// spatialMove is physical, so checkDirection, which expects Left and Right to swap, does not apply.
test("direction: Left and Right mean left and right on screen in both text directions", async () => {
  try {
    for (const dir of ["ltr", "rtl"]) {
      document.documentElement.dir = dir
      const v = view()
      try {
        await v.keys("Tab", "ArrowDown", "ArrowRight")
        expect(focused(), dir).toBe("Be")
        await v.keys("ArrowRight")
        expect(focused(), dir).toBe("B")
        await v.keys("ArrowLeft", "ArrowLeft")
        expect(focused(), dir).toBe("Li")
      } finally {
        v.unmount()
      }
    }
  } finally {
    document.documentElement.dir = ""
  }
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const pageCell = (symbol: string) => page.root.querySelector<HTMLElement>(`b18-cell[value="${symbol}"]`)!

test("names: the page names the grid and each of its 54 elements", async () => {
  page = mountUI(ui)
  await settle()
  place(page.root.querySelectorAll<HTMLElement>("b18-cell"))
  const table = page.root.querySelector("b18-table")!
  expect(table.getAttribute("aria-label")).toBe("Elements")
  expect(table.getAttribute("role")).toBe("grid")
  expect(page.root.querySelectorAll("b18-period[role=row]").length).toBe(5)
  expect(page.root.querySelectorAll("b18-cell[role=gridcell]").length).toBe(54)
  expect(pageCell("Xe").getAttribute("aria-label")).toBe("54 Xe Xenon")
  expect(pageCell("Xe").textContent).toBe("54 Xe")
  expect(page.root.querySelector<HTMLElement>("[data-detail]")!.hidden).toBe(true)
  expect(status()).toBe("No element is selected.")
})

test("keyboard: on the page, Space selects the focused element and the detail and status lines report it", async () => {
  pageCell("Mg").focus()
  await keys("ArrowDown", "ArrowRight")
  expect(focused()).toBe("Sc")
  await keys("Space")
  expect(status()).toBe("Selected: Scandium (Sc), number 21.")
  const detail = page.root.querySelector<HTMLElement>("[data-detail]")!
  expect(detail.hidden).toBe(false)
  expect(detail.querySelector("[data-facts]")!.textContent).toBe("Atomic number 21, group 3, period 4.")
  expect(detail.querySelector("[data-near]")!.textContent).toBe("Nearest on screen: left Ca, right Ti, up Mg, down Y.")
})

test("agent: an agent selects Iron, then the element below it, and an unknown element or direction is refused", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const table = page.live().find((entry) => entry.label === "Elements")!
  expect(table.actions).toEqual(["setValue", "selectNeighbor"])
  const found = await page.agent.query({ within: "Elements", text: "Iron" })
  expect(JSON.stringify(found)).toContain('"Fe"')

  pageCell("H").focus()
  const result = await page.agent.act({
    steps: [
      { ref: "Elements", action: "setValue", args: ["Iron"] },
      { ref: "Elements", action: "selectNeighbor", args: ["down"] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Selected: Ruthenium (Ru), number 44.")
  expect(focused()).toBe("H")
  expect(ui.task!.done(page.root)).toBe(true)

  const unknown = await page.agent.act({ steps: [{ ref: "Elements", action: "setValue", args: ["Unobtainium"] }] })
  expect(unknown.ok).toBe(false)
  const sideways = await page.agent.act({ steps: [{ ref: "Elements", action: "selectNeighbor", args: ["north"] }] })
  expect(sideways.ok).toBe(false)
  expect(sideways.error?.message).toContain('No direction "north"')
  expect(status()).toBe("Selected: Ruthenium (Ru), number 44.")
})
