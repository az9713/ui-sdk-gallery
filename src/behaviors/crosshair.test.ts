import { type ChangeDetails, createChange, definePrimitive } from "@ui-sdk/core"
import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { type CrosshairPointer, type CrosshairReason, createCrosshair } from "./crosshair"

// 4 points with uneven spacing, like events on a timeline.
const POINTS = [
  { value: "a", at: 0.05 },
  { value: "b", at: 0.1 },
  { value: "c", at: 0.5 },
  { value: "d", at: 0.9 },
]
const CROSS: Record<string, number> = { a: 0.2, b: 0.4, c: 0.6, d: 0.8 }

type Options = {
  defaultValue?: string
  onValueChange?: (value: string | null, details: ChangeDetails<CrosshairReason>) => void
}
type State = { value: string | null; pointer: CrosshairPointer | null }

const probe = definePrimitive({
  name: "crosshair-probe",
  options: { defaultValue: "string", onValueChange: "callback" },
  state: (options: Options): State => ({ value: options.defaultValue ?? null, pointer: null }),
  api: (context) => {
    const change = createChange(context)
    const crosshair = createCrosshair(context, {
      key: "value",
      pointer: "pointer",
      set: (value, details) => change("value", value, details),
      points: () => POINTS,
      cross: (value) => CROSS[value],
      label: (value) => `Point ${value}`,
      page: () => 2,
    })
    return { crosshair, show: (value: string) => crosshair.show(value), hide: () => crosshair.hide() }
  },
  slots: (slot) => ({
    root: slot({
      role: "slider",
      focus: "tab-stop",
      keys: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Escape"],
      attrs: (state, { api }) => ({ ...api.crosshair.surfaceAttrs(state), ...api.crosshair.lineAttrs(state) }),
      on: {
        keydown: (event, { el, api }) => void api.crosshair.keydown(event, el!),
        pointermove: (event, { el, api }) => api.crosshair.pointermove(event, el!),
        pointerdown: (event, { el, api }) => api.crosshair.pointerdown(event, el!),
        pointerleave: (event, { api }) => api.crosshair.pointerleave(event),
      },
    }),
  }),
  agent: { actions: ["show", "hide"] },
})

const markup = `<root aria-label="Probe"></root>`
const box = { left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250, x: 100, y: 50 }
const place = (el: HTMLElement) =>
  Object.defineProperty(el, "getBoundingClientRect", { configurable: true, value: () => ({ ...box, toJSON() {} }) })
const pointer = (el: HTMLElement, type: string, x: number, y: number) =>
  el.dispatchEvent(
    new PointerEvent(type, {
      clientX: box.left + x * box.width,
      clientY: box.top + y * box.height,
      bubbles: true,
      pointerType: "mouse",
    }),
  )

test("keyboard: arrows step 1 point, Page Up a page, Home and End go to the ends", async () => {
  const view = mount(probe, { defaultValue: "b" }, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(view.root)
    await view.keys("ArrowRight")
    expect(view.state.value).toBe("c")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "step-key", source: "keyboard" })
    await view.keys("ArrowLeft", "ArrowLeft", "ArrowLeft")
    expect(view.state.value).toBe("a")
    await view.keys("PageUp")
    expect(view.state.value).toBe("c")
    await view.keys("End")
    expect(view.state.value).toBe("d")
    await view.keys("Home")
    expect(view.state.value).toBe("a")
    expect(view.root.getAttribute("aria-valuenow")).toBe("1")
    expect(view.root.getAttribute("aria-valuetext")).toBe("Point a")
    expect(view.root.getAttribute("aria-valuemax")).toBe("4")
  } finally {
    view.unmount()
  }
})

test("keyboard: Escape hides the crosshair, and an arrow shows it again at the start point", async () => {
  const view = mount(probe, { defaultValue: "b" }, markup)
  try {
    await view.keys("Tab", "Escape")
    expect(view.state.value).toBe(null)
    expect(view.changes.at(-1)).toMatchObject({ reason: "escape-key" })
    expect(view.root.hasAttribute("data-crosshair")).toBe(false)
    expect(view.root.getAttribute("aria-valuetext")).toBe("No point")
    expect(view.root.getAttribute("aria-valuenow")).toBe("4")
    await view.keys("ArrowLeft")
    expect(view.state.value).toBe("d")
    await view.keys("Escape", "Home")
    expect(view.state.value).toBe("a")
  } finally {
    view.unmount()
  }
})

test("pointer: a hover moves to the nearest point of uneven ones, the cross line follows the pointer, and leaving hides it", async () => {
  const view = mount(probe, {}, markup)
  try {
    place(view.root)
    pointer(view.root, "pointermove", 0.08, 0.25)
    expect(view.state.value).toBe("b")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-hover" })
    pointer(view.root, "pointermove", 0.31, 0.5)
    expect(view.state.value).toBe("c")
    expect(view.state.pointer).toEqual({ x: 0.31, y: 0.5 })
    await view.settle()
    expect(view.root.style.getPropertyValue("--crosshair-x")).toBe("0.5")
    expect(view.root.style.getPropertyValue("--crosshair-y")).toBe("0.5")
    expect(view.root.hasAttribute("data-pointer")).toBe(true)
    view.root.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }))
    expect(view.state.value).toBe(null)
    expect(view.state.pointer).toBe(null)
  } finally {
    view.unmount()
  }
})

test("pointer: right to left, x runs from the right edge, so a hover near the left edge picks the last point", async () => {
  const view = mount(probe, {}, `<root aria-label="Probe" dir="rtl"></root>`)
  try {
    place(view.root)
    pointer(view.root, "pointermove", 0.08, 0.5)
    expect(view.state.value).toBe("d")
    expect(view.state.pointer).toEqual({ x: 0.92, y: 0.5 })
  } finally {
    view.unmount()
  }
})

test("pointer: a key after a hover puts the cross line back on the point's own place", async () => {
  const view = mount(probe, {}, markup)
  try {
    place(view.root)
    pointer(view.root, "pointermove", 0.5, 0.9)
    await view.settle()
    expect(view.root.style.getPropertyValue("--crosshair-y")).toBe("0.9")
    view.root.focus()
    await view.keys("ArrowLeft")
    expect(view.state.value).toBe("b")
    expect(view.state.pointer).toBe(null)
    expect(view.root.style.getPropertyValue("--crosshair-y")).toBe("0.4")
    expect(view.root.hasAttribute("data-pointer")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("pointer: with no pointer over it, the cross line sits on the point's own place", async () => {
  const view = mount(probe, { defaultValue: "c" }, markup)
  try {
    expect(view.root.style.getPropertyValue("--crosshair-x")).toBe("0.5")
    expect(view.root.style.getPropertyValue("--crosshair-y")).toBe("0.6")
    expect(view.api.crosshair.nearest(0.7)).toBe("c")
    expect(view.api.crosshair.nearest(0.71)).toBe("d")
    expect(view.api.crosshair.show("zz")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("server: the crosshair renders with no DOM", () => {
  checkServer(probe, { defaultValue: "b" }, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(probe, { defaultValue: "b" }, markup)
})
