import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { annotator } from "./B09-annotation-boxes"

// 2 boxes on the 640 by 400 photo. Each box has 8 handles, in clockwise order from the top left.
const titles = { a: "Alpha", b: "Beta" }
const defaultValue = { a: { x: 40, y: 40, width: 100, height: 80 }, b: { x: 300, y: 200, width: 60, height: 60 } }
const SIDES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
const markup = `<root aria-label="Boxes">${Object.keys(titles)
  .map((k) => `<box value="${k}">${SIDES.map((side) => `<handle value="${k}:${side}"></handle>`).join("")}</box>`)
  .join("")}</root>`
const options = { titles, defaultValue }
const mountBoxes = () => mount(annotator, options, markup)
const focused = () => document.activeElement?.getAttribute("aria-label")

// A mouse press on `el` at `from`, moves to `to`, then up. `during` runs before the button goes up.
async function press(el: Element, from: [number, number], to: [number, number], during?: () => void) {
  const at = (x: number, y: number, buttons = 1) =>
    ({ clientX: x, clientY: y, button: 0, buttons, pointerId: 7, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true }) as PointerEventInit
  el.dispatchEvent(new PointerEvent("pointerdown", at(...from)))
  for (let i = 1; i <= 4; i++)
    el.dispatchEvent(new PointerEvent("pointermove", at(from[0] + ((to[0] - from[0]) * i) / 4, from[1] + ((to[1] - from[1]) * i) / 4)))
  await settle()
  during?.()
  el.dispatchEvent(new PointerEvent("pointerup", at(...to, 0)))
  await settle()
}

test("keyboard: each box is 1 tab stop, followed by its 8 handles, and each handle is a named button", async () => {
  const view = mountBoxes()
  try {
    const order: (string | null | undefined)[] = []
    for (let i = 0; i < 18; i++) {
      await view.keys("Tab")
      order.push(focused())
    }
    const sides = ["top left", "top", "top right", "right", "bottom right", "bottom", "bottom left", "left"]
    expect(order).toEqual(["Alpha", ...sides.map((s) => `Resize Alpha ${s}`), "Beta", ...sides.map((s) => `Resize Beta ${s}`)])
    const box = view.part("box", "a")!
    expect(box.getAttribute("role")).toBe("group")
    expect(box.getAttribute("tabindex")).toBe("0")
    expect(box.getAttribute("aria-description")).toBe("100 by 80 at 40, 40")
    expect(box.hasAttribute("data-dragging")).toBe(false)
    const handle = view.part("handle", "a:se")!
    expect(handle.localName).toBe("button")
    expect(handle.getAttribute("type")).toBe("button")
    expect(handle.getAttribute("data-resize-handle")).toBe("se")
    expect(handle.getAttribute("style")).toContain("cursor: nwse-resize")
    expect(handle.hasAttribute("aria-pressed")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: on a box, the arrow keys move it 4 pixels, Shift 40, and the photo's edge stops it", async () => {
  const view = mountBoxes()
  try {
    view.part("box", "a")!.focus()
    await view.keys("ArrowRight", "ArrowDown")
    expect(view.state.value.a).toEqual({ x: 44, y: 44, width: 100, height: 80 })
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "resize-key", source: "keyboard" })
    expect(view.announced.at(-1)).toBe("Alpha moved to 44, 44.")
    await view.keys("Shift+ArrowLeft", "ArrowLeft", "ArrowLeft")
    expect(view.state.value.a).toEqual({ x: 0, y: 44, width: 100, height: 80 })
    expect(view.part("box", "a")!.getAttribute("aria-description")).toBe("100 by 80 at 0, 44")
    view.part("box", "b")!.focus()
    await view.keys("Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight")
    expect(view.state.value.b).toEqual({ x: 580, y: 200, width: 60, height: 60 })
    await view.keys("Shift+ArrowDown", "Shift+ArrowDown", "Shift+ArrowDown", "Shift+ArrowDown")
    expect(view.state.value.b).toEqual({ x: 580, y: 340, width: 60, height: 60 })
    expect(focused()).toBe("Beta")
  } finally {
    view.unmount()
  }
})

test("keyboard: on a corner handle, the arrow keys move 2 edges by 4 pixels, Shift by 40, and the smallest size stops them", async () => {
  const view = mountBoxes()
  try {
    view.part("handle", "a:se")!.focus()
    await view.keys("ArrowRight", "ArrowDown")
    expect(view.state.value.a).toEqual({ x: 40, y: 40, width: 104, height: 84 })
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "resize-key", source: "keyboard" })
    expect(view.announced.at(-1)).toBe("Alpha resized to 104 by 84.")
    await view.keys("Shift+ArrowLeft", "Shift+ArrowLeft", "Shift+ArrowLeft", "Shift+ArrowUp", "Shift+ArrowUp", "Shift+ArrowUp")
    expect(view.state.value.a).toEqual({ x: 40, y: 40, width: 24, height: 24 })
    view.part("handle", "a:nw")!.focus()
    await view.keys("ArrowLeft", "ArrowUp")
    expect(view.state.value.a).toEqual({ x: 36, y: 36, width: 28, height: 28 })
    await view.keys("ArrowRight", "ArrowRight")
    expect(view.state.value.a).toEqual({ x: 40, y: 36, width: 24, height: 28 })
    expect(focused()).toBe("Resize Alpha top left")
  } finally {
    view.unmount()
  }
})

test("keyboard: on an edge handle, the arrow keys move only that edge, along its own axis", async () => {
  const view = mountBoxes()
  try {
    view.part("handle", "a:e")!.focus()
    await view.keys("ArrowDown", "ArrowUp")
    expect(view.state.value.a).toEqual({ x: 40, y: 40, width: 100, height: 80 })
    await view.keys("ArrowRight")
    expect(view.state.value.a).toEqual({ x: 40, y: 40, width: 104, height: 80 })
    view.part("handle", "a:n")!.focus()
    await view.keys("ArrowLeft", "ArrowUp")
    expect(view.state.value.a).toEqual({ x: 40, y: 36, width: 104, height: 84 })
    view.part("handle", "a:w")!.focus()
    await view.keys("ArrowLeft")
    expect(view.state.value.a).toEqual({ x: 36, y: 36, width: 108, height: 84 })
    view.part("handle", "a:s")!.focus()
    await view.keys("Shift+ArrowDown")
    expect(view.state.value.a).toEqual({ x: 36, y: 36, width: 108, height: 124 })
    expect(view.state.value.b).toEqual(defaultValue.b)
  } finally {
    view.unmount()
  }
})

test("pointer: a drag on the box moves it on the 4 pixel grid", async () => {
  const view = mountBoxes()
  try {
    await view.drag(view.part("box", "b")!, { by: { x: 21, y: 10 } })
    expect(view.state.value.b).toEqual({ x: 320, y: 212, width: 60, height: 60 })
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag" })
    expect(view.part("box", "b")!.getAttribute("aria-description")).toBe("60 by 60 at 320, 212")
    expect(view.part("box", "b")!.hasAttribute("data-dragging")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("pointer: a drag on a handle resizes the box from that side and does not move the other sides", async () => {
  const view = mountBoxes()
  try {
    await view.drag(view.part("handle", "b:se")!, { by: { x: 21, y: 10 } })
    expect(view.state.value.b).toEqual({ x: 300, y: 200, width: 80, height: 72 })
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag" })
    expect(view.announced.at(-1)).toBe("Beta resized to 80 by 72.")
    await view.drag(view.part("handle", "b:w")!, { by: { x: -20, y: 30 } })
    expect(view.state.value.b).toEqual({ x: 280, y: 200, width: 100, height: 72 })
    expect(view.changes.filter((change) => change.key === "value").length).toBe(2)
  } finally {
    view.unmount()
  }
})

test("pointer: during a drag the box shows the draft, and Escape puts it back", async () => {
  const view = mountBoxes()
  try {
    const box = view.part("box", "b")!
    await press(box, [330, 230], [390, 250], () => {
      expect(box.getAttribute("data-dragging")).toBe("move")
      expect(box.getAttribute("style")).toContain("--resize-x: 360px")
      expect(view.state.value.b).toEqual(defaultValue.b)
    })
    expect(view.state.value.b).toEqual({ x: 360, y: 220, width: 60, height: 60 })
    const handle = view.part("handle", "b:se")!
    await press(handle, [360, 280], [400, 320], () => {
      expect(box.getAttribute("data-dragging")).toBe("se")
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
    })
    expect(view.state.value.b).toEqual({ x: 360, y: 220, width: 60, height: 60 })
    expect(box.hasAttribute("data-dragging")).toBe(false)
    expect(view.changes.filter((change) => change.key === "value").length).toBe(1)
  } finally {
    view.unmount()
  }
})

test("agent: moveBox and resizeBox check their arguments and keep the box in the photo", async () => {
  const view = mountBoxes()
  try {
    expect(() => view.api.moveBox("Gamma", 0, 0)).toThrow('No box "Gamma". Boxes: Alpha, Beta.')
    expect(() => view.api.moveBox("Beta", "left" as never, 8)).toThrow('moveBox takes a box and 2 numbers, like moveBox("Beta", 40, 80).')
    expect(() => view.api.resizeBox("Alpha", 120, Number.NaN)).toThrow(
      'resizeBox takes a box, a width and a height, like resizeBox("Alpha", 120, 80).',
    )
    expect(() => view.api.resizeBox("Alpha", 10, 40)).toThrow("A box is at least 24 by 24.")
    expect(view.state.value).toEqual(defaultValue)

    expect(view.api.moveBox("beta", 1000, -5)).toBe(true)
    expect(view.state.value.b).toEqual({ x: 580, y: 0, width: 60, height: 60 })
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "imperative" })
    expect(view.api.resizeBox("a", 103, 77)).toBe(true)
    expect(view.state.value.a).toEqual({ x: 40, y: 40, width: 103, height: 77 })
    view.api.resizeBox("Alpha", 1000, 1000)
    expect(view.state.value.a).toEqual({ x: 40, y: 40, width: 600, height: 360 })
  } finally {
    view.unmount()
  }
})

test("server: the annotator renders with no DOM", () => {
  checkServer(annotator, options, markup)
})

// checkDirection expects Left and Right to swap in right to left. On a photo they do not: they are physical.
test("direction: in both text directions, Right moves a box right and moves its right edge right", async () => {
  const results: unknown[] = []
  try {
    for (const dir of ["ltr", "rtl"]) {
      document.documentElement.dir = dir
      const view = mountBoxes()
      try {
        view.part("box", "a")!.focus()
        await view.keys("ArrowRight")
        view.part("handle", "a:se")!.focus()
        await view.keys("ArrowRight")
        view.part("handle", "b:w")!.focus()
        await view.keys("ArrowRight")
        results.push(view.state.value)
      } finally {
        view.unmount()
      }
    }
  } finally {
    document.documentElement.dir = ""
  }
  expect(results[0]).toEqual({ a: { x: 44, y: 40, width: 104, height: 80 }, b: { x: 304, y: 200, width: 56, height: 60 } })
  expect(results[1]).toEqual(results[0])
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const pageBox = (key: string) => page.root.querySelector<HTMLElement>(`b09-box[value="${key}"]`)!
const pageHandle = (key: string) => page.root.querySelector<HTMLElement>(`b09-handle[value="${key}"] button`)!

test("names: the page names the photo, each box and each of its 8 handles", async () => {
  page = mountUI(ui)
  await settle()
  const root = page.root.querySelector("b09-annotator")!
  expect(root.getAttribute("role")).toBe("group")
  expect(root.getAttribute("aria-label")).toBe("Street photo boxes")
  const boxes = [...page.root.querySelectorAll("b09-box")]
  expect(boxes.map((el) => el.getAttribute("aria-label"))).toEqual(["Car", "Cyclist", "Traffic light"])
  expect(boxes.map((el) => el.getAttribute("aria-description"))).toEqual(["216 by 128 at 72, 224", "152 by 124 at 364, 196", "48 by 96 at 500, 40"])
  expect([...pageBox("light").querySelectorAll("button")].map((el) => el.getAttribute("aria-label"))).toEqual([
    "Resize Traffic light top left",
    "Resize Traffic light top",
    "Resize Traffic light top right",
    "Resize Traffic light right",
    "Resize Traffic light bottom right",
    "Resize Traffic light bottom",
    "Resize Traffic light bottom left",
    "Resize Traffic light left",
  ])
  expect(page.root.querySelectorAll("b09-handle button").length).toBe(24)
  expect([...page.root.querySelectorAll("b09-handle button")].every((el) => el.textContent === "")).toBe(true)
  expect(page.root.querySelector("[data-photo]")!.getAttribute("aria-hidden")).toBe("true")
  expect(status()).toBe("No box has changed yet.")
})

test("keyboard: on the page, Left on the Cyclist box moves it, and Shift with Down on its bottom handle resizes it", async () => {
  pageBox("cyclist").focus()
  await keys("ArrowLeft")
  expect(status()).toBe("Moved Cyclist to 360, 196.")
  pageHandle("cyclist:s").focus()
  await keys("Shift+ArrowDown")
  expect(status()).toBe("Resized Cyclist to 152 by 164 at 360, 196.")
  expect(pageBox("cyclist").getAttribute("aria-description")).toBe("152 by 164 at 360, 196")
  expect(document.activeElement).toBe(pageHandle("cyclist:s"))
})

test("agent: an agent finds the boxes, resizes the Cyclist, moves the Traffic light, and is refused a box that is not there", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const entry = page.live().find((e) => e.label === "Street photo boxes")!
  expect(entry.actions).toEqual(["moveBox", "resizeBox"])
  const found = await page.agent.query({ within: "Street photo boxes", text: "light" })
  expect(JSON.stringify(found)).toContain("Traffic light")

  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(pageBox("cyclist").getAttribute("aria-description")).toBe("128 by 152 at 360, 196")
  expect(status()).toBe("Moved Traffic light to 536, 44.")

  const refused = await page.agent.act({ steps: [{ ref: "Street photo boxes", action: "moveBox", args: ["Bus", 0, 0] }] })
  expect(refused.ok).toBe(false)
  expect(refused.error?.message).toContain('No box "Bus". Boxes: Car, Cyclist, Traffic light.')
})
