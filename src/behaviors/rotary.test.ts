import { type ChangeDetails, createChange, definePrimitive } from "@ui-sdk/core"
import { checkPattern, checkServer, mount, settle } from "@ui-sdk/core/testing"
import { afterEach, expect, test } from "vitest"
import { createRotary, type RotaryOptions, type RotaryReason } from "./rotary"

type Options = {
  min: number
  max: number
  step: number
  largeStep?: number
  wrap?: boolean
  defaultValue?: number
  onValueChange?: (value: number, details: ChangeDetails<RotaryReason>) => void
}
type State = { value: number; min: number; max: number; step: number; largeStep?: number; wrap: boolean }

// A dial of 1 slider part, with the behavior's options that a test changes passed in.
const dialWith = (extra: Partial<RotaryOptions<State>> = {}) =>
  definePrimitive({
    name: "dial",
    options: { min: "number", max: "number", step: "number", largeStep: "number", wrap: "boolean", defaultValue: "number", onValueChange: "callback" },
    state: (options: Options): State => ({
      value: options.defaultValue ?? options.min,
      min: options.min,
      max: options.max,
      step: options.step,
      largeStep: options.largeStep,
      wrap: options.wrap ?? false,
    }),
    api: (context) => {
      const change = createChange(context)
      const rotary = createRotary(context, {
        value: (state) => state.value,
        set: (value, details) => change("value", value, details),
        range: () => context.store.get(),
        wrap: () => context.store.get().wrap,
        valueText: (value) => `${value} degrees`,
        ...extra,
      })
      return { rotary }
    },
    slots: (slot) => ({
      root: slot({
        role: "slider",
        focus: "tab-stop",
        keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"],
        attrs: (state, { api }) => ({ ...api.rotary.attrs(state), style: api.rotary.style(state) }),
        on: {
          keydown: (event, { api }) => void api.rotary.keydown(event),
          pointerdown: (event, { el, api }) => api.rotary.pointerdown(event, el!),
        },
      }),
    }),
    agent: { actions: [] },
  })
const dial = dialWith()
const markup = `<root aria-label="Gain"></root>`
const stops = { min: 0, max: 270, step: 1 }
const loop = { min: -180, max: 180, step: 1, wrap: true }

// jsdom has no layout: the dial is 100 by 100 with its center at (100, 100).
function layOut(el: Element) {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ x: 50, y: 50, left: 50, top: 50, width: 100, height: 100, right: 150, bottom: 150, toJSON: () => ({}) }),
  })
}
// A point at an angle in degrees clockwise from 12 o'clock, at a distance from the center.
const point = (degrees: number, radius = 40) => {
  const rad = (degrees * Math.PI) / 180
  return { x: 100 + radius * Math.sin(rad), y: 100 - radius * Math.cos(rad) }
}
const init = ({ x, y }: { x: number; y: number }, buttons = 1, button = 0) =>
  ({ clientX: x, clientY: y, button, buttons, pointerId: 5, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true }) as PointerEventInit

// Presses at the first point and moves through the others, 1 frame each, then lifts.
async function drag(el: Element, points: { x: number; y: number }[], button = 0) {
  el.dispatchEvent(new PointerEvent("pointerdown", init(points[0], 1, button)))
  await settle()
  for (const p of points.slice(1)) {
    el.dispatchEvent(new PointerEvent("pointermove", init(p, 1, button)))
    await settle()
  }
  el.dispatchEvent(new PointerEvent("pointerup", init(points.at(-1)!, 0, button)))
  await settle()
}
// The angles from one to another in steps of at most 30 degrees, as a hand turns a knob.
const arc = (from: number, to: number, most = 30) => {
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / most))
  return Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps)
}
const turn = (el: Element, from: number, to: number) => drag(el, arc(from, to).map((a) => point(a)))

afterEach(() => document.documentElement.removeAttribute("dir"))

test("keys: Up and Right step up, Down and Left step down, Shift and Page keys take the large step, Home and End go to the ends", async () => {
  const view = mount(dial, { ...stops, defaultValue: 100 }, markup)
  try {
    await view.keys("Tab", "ArrowUp", "ArrowRight")
    expect(view.state.value).toBe(102)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "step-key", source: "keyboard" })
    await view.keys("ArrowDown", "ArrowLeft")
    expect(view.state.value).toBe(100)
    await view.keys("PageUp", "Shift+ArrowUp")
    expect(view.state.value).toBe(120)
    await view.keys("PageDown", "Shift+ArrowLeft")
    expect(view.state.value).toBe(100)
    await view.keys("End")
    expect(view.state.value).toBe(270)
    await view.keys("Home")
    expect(view.state.value).toBe(0)
  } finally {
    view.unmount()
  }
})

test("keys: a stopping range stays at its ends, and the large step can be set", async () => {
  const view = mount(dial, { ...stops, largeStep: 45, defaultValue: 260 }, markup)
  try {
    await view.keys("Tab", "PageUp")
    expect(view.state.value).toBe(270)
    const changes = view.changes.length
    await view.keys("ArrowUp", "PageUp", "End")
    expect(view.state.value).toBe(270)
    expect(view.changes.length).toBe(changes)
    await view.keys("Home", "ArrowDown")
    expect(view.state.value).toBe(0)
    await view.keys("PageUp")
    expect(view.state.value).toBe(45)
  } finally {
    view.unmount()
  }
})

test("keys: a wrapping range goes round both ways, and Home and End go to min and the step before max", async () => {
  const view = mount(dial, { ...loop, defaultValue: 179 }, markup)
  try {
    await view.keys("Tab", "ArrowUp")
    expect(view.state.value).toBe(-180)
    await view.keys("ArrowLeft")
    expect(view.state.value).toBe(179)
    await view.keys("ArrowLeft", "PageUp")
    expect(view.state.value).toBe(-172)
    await view.keys("PageDown")
    expect(view.state.value).toBe(178)
    await view.keys("Home")
    expect(view.state.value).toBe(-180)
    await view.keys("End")
    expect(view.state.value).toBe(179)
  } finally {
    view.unmount()
  }
})

test("keys: Control and Meta with an arrow are left to the page", async () => {
  const view = mount(dial, { ...stops, defaultValue: 100 }, markup)
  try {
    await view.keys("Tab", "Control+ArrowUp", "Meta+ArrowUp")
    expect(view.state.value).toBe(100)
    expect(view.changes.length).toBe(0)
  } finally {
    view.unmount()
  }
})

test("direction: Left and Right turn the same way in left to right and right to left, as a knob turns", async () => {
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(dial, { ...stops, defaultValue: 100 }, markup)
    try {
      await view.keys("Tab", "ArrowRight", "ArrowRight")
      expect(view.state.value, dir).toBe(102)
      await view.keys("ArrowLeft")
      expect(view.state.value, dir).toBe(101)
    } finally {
      view.unmount()
    }
  }
})

test("set: snaps to the step, keeps a stopping range in its bounds, wraps a looping one, and reports imperative", () => {
  const view = mount(dial, { min: 0, max: 10, step: 0.5, defaultValue: 5 }, markup)
  const round = mount(dial, { ...loop, defaultValue: 0 }, markup)
  try {
    view.api.rotary.set(3.3)
    expect(view.state.value).toBe(3.5)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "imperative" })
    view.api.rotary.set(14)
    expect(view.state.value).toBe(10)
    view.api.rotary.set(-2)
    expect(view.state.value).toBe(0)
    for (const [asked, got] of [
      [190, -170],
      [-181, 179],
      [180, -180],
      [539.6, -180],
      [179.4, 179],
    ]) {
      round.api.rotary.set(asked)
      expect(round.state.value, String(asked)).toBe(got)
    }
  } finally {
    view.unmount()
    round.unmount()
  }
})

test("attrs: the slider states its bounds, value and value text, and the style turns with the value", () => {
  const view = mount(dial, { ...stops, defaultValue: 135 }, markup)
  const round = mount(dial, { ...loop, defaultValue: 0 }, markup)
  try {
    const { root } = view
    expect(root.getAttribute("role")).toBe("slider")
    expect(root.getAttribute("tabindex")).toBe("0")
    expect(root.getAttribute("aria-valuemin")).toBe("0")
    expect(root.getAttribute("aria-valuemax")).toBe("270")
    expect(root.getAttribute("aria-valuenow")).toBe("135")
    expect(root.getAttribute("aria-valuetext")).toBe("135 degrees")
    expect(root.hasAttribute("data-wrap")).toBe(false)
    expect(root.style.getPropertyValue("--rotary-angle")).toBe("0deg")
    expect(root.style.getPropertyValue("--rotary-fraction")).toBe("0.5")
    view.api.rotary.set(0)
    expect(root.style.getPropertyValue("--rotary-angle")).toBe("-135deg")
    expect(view.api.rotary.angle(view.state)).toBe(-135)
    view.api.rotary.set(270)
    expect(root.style.getPropertyValue("--rotary-angle")).toBe("135deg")
    expect(view.api.rotary.fraction(view.state)).toBe(1)

    expect(round.root.getAttribute("aria-valuemin")).toBe("-180")
    expect(round.root.getAttribute("aria-valuemax")).toBe("179")
    expect(round.root.hasAttribute("data-wrap")).toBe(true)
    expect(round.api.rotary.angle(round.state)).toBe(0)
    round.api.rotary.set(-180)
    expect(round.api.rotary.angle(round.state)).toBe(-180)
    round.api.rotary.set(90)
    expect(round.root.style.getPropertyValue("--rotary-angle")).toBe("90deg")
  } finally {
    view.unmount()
    round.unmount()
  }
})

test("pointer: a press focuses the dial, a clockwise turn raises the value and an anticlockwise turn lowers it", async () => {
  const view = mount(dial, { ...stops, defaultValue: 100 }, markup)
  try {
    layOut(view.root)
    await turn(view.root, 90, 180)
    expect(document.activeElement).toBe(view.root)
    expect(view.state.value).toBe(190)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag" })
    await turn(view.root, 180, 90)
    expect(view.state.value).toBe(100)
    await turn(view.root, -30, -90)
    expect(view.state.value).toBe(40)
  } finally {
    view.unmount()
  }
})

test("pointer: a turn across 6 o'clock and 12 o'clock goes on without a jump", async () => {
  const view = mount(dial, { ...stops, defaultValue: 100 }, markup)
  try {
    layOut(view.root)
    await turn(view.root, 150, 210)
    expect(view.state.value).toBe(160)
    await turn(view.root, 30, -30)
    expect(view.state.value).toBe(100)
  } finally {
    view.unmount()
  }
})

test("pointer: a turn past an end stops there, and turning back moves the value at once", async () => {
  const view = mount(dial, { ...stops, defaultValue: 250 }, markup)
  try {
    layOut(view.root)
    await drag(view.root, [...arc(0, 90), ...arc(90, 60).slice(1)].map((a) => point(a)))
    expect(view.state.value).toBe(240)
    await turn(view.root, 0, -300)
    expect(view.state.value).toBe(0)
  } finally {
    view.unmount()
  }
})

test("pointer: moves smaller than a step add up", async () => {
  const view = mount(dial, { min: 0, max: 270, step: 10, defaultValue: 0 }, markup)
  try {
    layOut(view.root)
    await drag(view.root, arc(90, 92, 2).map((a) => point(a)))
    expect(view.state.value).toBe(0)
    await drag(view.root, arc(90, 110, 4).map((a) => point(a)))
    expect(view.state.value).toBe(20)
  } finally {
    view.unmount()
  }
})

test("pointer: a wrapping range turns round past its ends, and a full turn comes back to the start", async () => {
  const view = mount(dial, { ...loop, defaultValue: 170 }, markup)
  try {
    layOut(view.root)
    await turn(view.root, 0, 90)
    expect(view.state.value).toBe(-100)
    await turn(view.root, 45, 405)
    expect(view.state.value).toBe(-100)
    await turn(view.root, 0, -90)
    expect(view.state.value).toBe(170)
  } finally {
    view.unmount()
  }
})

test("pointer: moves inside the dead zone turn nothing, and a press with another button does nothing", async () => {
  const view = mount(dial, { ...stops, defaultValue: 100 }, markup)
  try {
    layOut(view.root)
    await drag(view.root, [point(0, 4), point(90, 6), point(200, 3)])
    expect(view.state.value).toBe(100)
    await drag(view.root, [point(0, 4), point(90, 40), point(180, 40)])
    expect(view.state.value).toBe(190)
    await drag(view.root, arc(0, 90).map((a) => point(a)), 2)
    expect(view.state.value).toBe(190)
  } finally {
    view.unmount()
  }
})

test("options: sweep sets how far the pointer turns from min to max, and deadZone how near the center a move counts", async () => {
  const quarter = mount(dialWith({ sweep: () => 90 }), { ...stops, defaultValue: 0 }, markup)
  const wide = mount(dialWith({ deadZone: 30 }), { ...stops, defaultValue: 100 }, markup)
  try {
    layOut(quarter.root)
    await turn(quarter.root, 0, 30)
    expect(quarter.state.value).toBe(90)
    expect(quarter.api.rotary.angle(quarter.state)).toBeCloseTo(-15)
    layOut(wide.root)
    await drag(wide.root, arc(0, 90).map((a) => point(a, 20)))
    expect(wide.state.value).toBe(100)
  } finally {
    quarter.unmount()
    wide.unmount()
  }
})

test("pattern: the dial passes the slider pattern", async () => {
  const view = mount(dial, { ...stops, defaultValue: 100 }, markup)
  try {
    await checkPattern(view.root, "slider")
  } finally {
    view.unmount()
  }
})

test("server: the dial renders with no DOM", () => {
  checkServer(dial, { ...stops, defaultValue: 100 }, markup)
  checkServer(dial, { ...loop, defaultValue: 0 }, markup)
})
