import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { photoGrid } from "./B05-photo-lasso"

// 2 rows of 3 photos.
const photos = ["a", "b", "c", "d", "e", "f"]
const cell = (i: number) => `<photo value="${photos[i]}" row="${Math.floor(i / 3)}" col="${i % 3}">${photos[i]}</photo>`
const markup = `<root aria-label="Trip photos"><row>${[0, 1, 2].map(cell).join("")}</row><row>${[3, 4, 5].map(cell).join("")}</row><lasso></lasso></root>`
const options = { photos, cols: 3 }
type View = ReturnType<typeof mount<typeof photoGrid>>
const photo = (view: View, key: string) => view.part("photo", key)!

// jsdom has no layout. Each photo is 80 px square with a 20 px gap, in a grid that starts at (0, 0) with a 20 px edge.
// Each element gets its own getBoundingClientRect, as mount() gives it one.
function layOut(surface: HTMLElement, cells: HTMLElement[], cols: number) {
  const box = (el: Element, left: number, top: number, width: number, height: number) =>
    Object.defineProperty(el, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) }),
    })
  const rows = Math.ceil(cells.length / cols)
  box(surface, 0, 0, 20 + cols * 100, 20 + rows * 100)
  cells.forEach((el, i) => box(el, 20 + (i % cols) * 100, 20 + Math.floor(i / cols) * 100, 80, 80))
  for (const row of new Set(cells.map((el) => el.parentElement!)))
    box(row, 0, row.firstElementChild!.getBoundingClientRect().top, 20 + cols * 100, 80)
}

// A mouse rectangle on the surface: down at `from`, moves to `to`, then up. `during` runs before the button goes up.
async function draw(
  surface: HTMLElement,
  from: [number, number],
  to: [number, number],
  { shift = false, during }: { shift?: boolean; during?: () => void | Promise<void> } = {},
) {
  const at = (x: number, y: number, buttons = 1) =>
    ({ clientX: x, clientY: y, button: 0, buttons, pointerId: 7, pointerType: "mouse", isPrimary: true, shiftKey: shift, bubbles: true, cancelable: true }) as PointerEventInit
  surface.dispatchEvent(new PointerEvent("pointerdown", at(...from)))
  for (let i = 1; i <= 8; i++)
    surface.dispatchEvent(new PointerEvent("pointermove", at(from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8)))
  await settle()
  await during?.()
  surface.dispatchEvent(new PointerEvent("pointerup", at(...to, 0)))
  await settle()
}

function mountLaidOut() {
  const view = mount(photoGrid, options, markup)
  layOut(view.root, photos.map((key) => photo(view, key)), 3)
  return view
}

test("keyboard: arrow keys move in 2 dimensions and Home, End go to the row ends", async () => {
  const view = mount(photoGrid, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(photo(view, "a"))
    await view.keys("ArrowRight")
    expect(document.activeElement).toBe(photo(view, "b"))
    await view.keys("ArrowDown")
    expect(document.activeElement).toBe(photo(view, "e"))
    await view.keys("End")
    expect(document.activeElement).toBe(photo(view, "f"))
    await view.keys("Home")
    expect(document.activeElement).toBe(photo(view, "d"))
    await view.keys("ArrowUp")
    expect(document.activeElement).toBe(photo(view, "a"))
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: the grid is 1 tab stop, and each photo states that it is not selected", async () => {
  const view = mount(photoGrid, options, markup)
  try {
    await view.keys("Tab", "ArrowDown", "ArrowRight")
    expect(document.activeElement).toBe(photo(view, "e"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(view.root.getAttribute("role")).toBe("grid")
    expect(view.root.getAttribute("aria-multiselectable")).toBe("true")
    for (const key of photos) {
      expect(photo(view, key).getAttribute("aria-selected")).toBe("false")
      expect(photo(view, key).hasAttribute("data-selected")).toBe(false)
      expect(photo(view, key).hasAttribute("aria-disabled")).toBe(false)
    }
    expect(view.part("lasso")!.getAttribute("aria-hidden")).toBe("true")
  } finally {
    view.unmount()
  }
})

test("keyboard: Space and Enter select a photo, and Space again clears it", async () => {
  const view = mount(photoGrid, options, markup)
  try {
    await view.keys("Tab", "Space", "ArrowRight", "Enter")
    expect(view.state.value).toEqual(["a", "b"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
    expect(photo(view, "b").getAttribute("aria-selected")).toBe("true")
    expect(photo(view, "b").hasAttribute("data-selected")).toBe(true)
    expect(photo(view, "c").getAttribute("aria-selected")).toBe("false")
    await view.keys("Space")
    expect(view.state.value).toEqual(["a"])
    expect(photo(view, "b").hasAttribute("data-selected")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: Shift with an arrow key extends the selection", async () => {
  const view = mount(photoGrid, options, markup)
  try {
    await view.keys("Tab", "Space", "Shift+ArrowRight", "Shift+ArrowRight")
    expect(view.state.value).toEqual(["a", "b", "c"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "list-navigation" })
  } finally {
    view.unmount()
  }
})

test("keyboard: a click on a photo selects it, and a second click clears it", async () => {
  const view = mount(photoGrid, options, markup)
  try {
    await view.click(photo(view, "a"))
    await view.click(photo(view, "d"))
    expect(view.state.value).toEqual(["a", "d"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "mouse" })
    await view.click(photo(view, "a"))
    expect(view.state.value).toEqual(["d"])
    expect(document.activeElement).toBe(photo(view, "a"))
  } finally {
    view.unmount()
  }
})

test("pointer: a rectangle across 2 rows selects the 4 photos it touches and reports the lasso", async () => {
  const view = mountLaidOut()
  try {
    // x 110 to 230 touches columns 2 and 3, y 10 to 130 touches rows 1 and 2.
    await draw(view.root, [110, 10], [230, 130])
    expect(view.state.value.toSorted()).toEqual(["b", "c", "e", "f"])
    expect(view.changes.length).toBe(1)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "lasso" })
    await view.settle()
    expect(view.announced.at(-1)).toBe("4 photos selected")
    expect(photo(view, "b").getAttribute("aria-selected")).toBe("true")
    expect(photo(view, "a").getAttribute("aria-selected")).toBe("false")
    expect(view.state.lasso).toBeNull()
    expect(view.root.querySelectorAll("[data-lassoed]").length).toBe(0)
    expect(view.part("lasso")!.getAttribute("style")).toContain("display: none")
  } finally {
    view.unmount()
  }
})

test("pointer: with Shift, a rectangle adds to the selection", async () => {
  const view = mountLaidOut()
  try {
    await view.click(photo(view, "a"))
    // x 110 to 150 and y 10 to 90 touch only photo b.
    await draw(view.root, [110, 10], [150, 90], { shift: true })
    expect(view.state.value.toSorted()).toEqual(["a", "b"])
    expect(view.changes.at(-1)).toMatchObject({ reason: "lasso" })
    // Without Shift, a rectangle replaces the selection: only photo f.
    await draw(view.root, [310, 210], [250, 150])
    expect(view.state.value).toEqual(["f"])
  } finally {
    view.unmount()
  }
})

test("pointer: the rectangle shows while it is drawn, and Escape cancels it and keeps the selection", async () => {
  const view = mountLaidOut()
  try {
    await view.click(photo(view, "a"))
    const before = view.changes.length
    await draw(view.root, [110, 10], [230, 90], {
      during: async () => {
        expect(view.state.lasso).not.toBeNull()
        expect(view.part("lasso")!.getAttribute("style") ?? "").not.toContain("display: none")
        expect([...view.root.querySelectorAll("[data-lassoed]")].map((el) => el.textContent).toSorted()).toEqual(["b", "c"])
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
        await view.settle()
      },
    })
    expect(view.state.value).toEqual(["a"])
    expect(view.changes.length).toBe(before)
    expect(view.state.lasso).toBeNull()
    expect(view.root.querySelectorAll("[data-lassoed]").length).toBe(0)
  } finally {
    view.unmount()
  }
})

test("pointer: a drag that starts on a photo draws no rectangle", async () => {
  const view = mountLaidOut()
  try {
    await draw(photo(view, "a"), [60, 60], [260, 160])
    expect(view.state.value).toEqual([])
    expect(view.changes.filter((change) => change.reason === "lasso")).toEqual([])
    expect(view.state.lasso).toBeNull()
  } finally {
    view.unmount()
  }
})

test("server: the photo grid renders with no DOM", () => {
  checkServer(photoGrid, options, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(photoGrid, options, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const grid = () => page.root.querySelector<HTMLElement>("b05-photo-grid")!
const cells = () => [...page.root.querySelectorAll<HTMLElement>("b05-photo")]
const button = (text: string) => [...page.root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === text)!

test("names: the page names the grid, each photo and the buttons", async () => {
  page = mountUI(ui)
  await settle()
  expect(grid().getAttribute("aria-label")).toBe("Trip photos")
  expect(grid().getAttribute("role")).toBe("grid")
  expect(cells().length).toBe(12)
  expect(cells()[0].textContent!.trim()).toBe("Tram 28")
  expect(cells().every((el) => el.getAttribute("role") === "gridcell" && el.getAttribute("aria-selected") === "false")).toBe(true)
  expect(cells().filter((el) => el.tabIndex === 0).length).toBe(1)
  expect(cells().some((el) => el.hasAttribute("aria-disabled"))).toBe(false)
  expect([...page.root.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Add to album", "Clear selection"])
  expect(page.root.querySelector("b05-lasso")!.getAttribute("aria-hidden")).toBe("true")
  expect(status()).toBe("No photo is selected.")
})

test("keyboard: on the page, Space selects the focused photo, the status line reports it, and both buttons work", async () => {
  cells()[0].focus()
  await keys("ArrowRight", "Space", "ArrowDown", "Space")
  expect(status()).toBe("2 photos selected: Alfama roofs, Pastel de nata.")
  button("Add to album").focus()
  await keys("Enter")
  expect(status()).toBe("Added 2 photos to the album: Alfama roofs, Pastel de nata.")
  button("Clear selection").focus()
  await keys("Enter")
  expect(status()).toBe("No photo is selected.")
  expect(cells().filter((el) => el.hasAttribute("data-selected")).length).toBe(0)
  button("Add to album").focus()
  await keys("Space")
  expect(status()).toBe("Select a photo first.")
})

test("pointer: on the page, a rectangle selects the photos it touches and the status line lists them", async () => {
  layOut(grid(), cells(), 4)
  // x 10 to 130 touches columns 1 and 2, y 110 to 130 touches row 2 only.
  await draw(grid(), [10, 110], [130, 130])
  expect(status()).toBe("2 photos selected: Tile wall, Pastel de nata.")
  // x 250 to 330 touches columns 3 and 4, y 210 to 230 touches row 3 only.
  await draw(grid(), [250, 210], [330, 230], { shift: true })
  expect(status()).toBe("4 photos selected: Tile wall, Pastel de nata, Elevator lift, Beach at Cascais.")
  expect(cells().filter((el) => el.hasAttribute("data-selected")).length).toBe(4)
  await page.agent.act({ steps: [{ ref: "Trip photos", action: "clear" }] })
  expect(status()).toBe("No photo is selected.")
})

test("agent: an agent finds the grid and its photos, selects 2 photos and adds them, and cannot select a photo that is not there", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const entry = page.live().find((e) => e.label === "Trip photos")!
  expect(entry.actions).toEqual(["toggle", "clear"])
  const found = JSON.stringify(await page.agent.query({ within: "Trip photos" }))
  expect(found).toContain("Sintra palace")
  expect(found).toContain("Beach at Cascais")

  const wrong = await page.agent.act({ steps: [{ ref: "Trip photos", action: "toggle", args: ["Eiffel tower"] }] })
  expect(wrong.ok).toBe(false)
  expect(wrong.error?.message).toContain('No photo "Eiffel tower"')

  const result = await page.agent.act(ui.task!)
  expect(result.ok, result.error?.message).toBe(true)
  expect(ui.task!.done(page.root)).toBe(true)
  expect(cells().filter((el) => el.hasAttribute("data-selected")).length).toBe(2)
})
