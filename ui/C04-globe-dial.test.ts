import { checkPattern, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui, { globeDial, spinFor } from "./C04-globe-dial"

// jsdom has no WebGL and no 2D canvas. Without this stub it prints "Not implemented" for each mount; the UI returns early either way.
HTMLCanvasElement.prototype.getContext = (() => null) as never

const range = { min: -180, max: 180, step: 1, largeStep: 15 }
const markup = `<root aria-label="Longitude"></root>`

// jsdom has no layout: the dial is 100 by 100 with its center at (100, 100).
function layOut(el: Element) {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ x: 50, y: 50, left: 50, top: 50, width: 100, height: 100, right: 150, bottom: 150, toJSON: () => ({}) }),
  })
}
// A point at an angle in degrees clockwise from 12 o'clock, 40 px from the center.
const point = (degrees: number) => {
  const rad = (degrees * Math.PI) / 180
  return { clientX: 100 + 40 * Math.sin(rad), clientY: 100 - 40 * Math.cos(rad) }
}
const init = (degrees: number, buttons = 1) =>
  ({ ...point(degrees), button: 0, buttons, pointerId: 7, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true }) as PointerEventInit

// Presses at one angle and turns to another in steps of at most 30 degrees, 1 frame each, then lifts.
async function turn(el: Element, from: number, to: number) {
  el.dispatchEvent(new PointerEvent("pointerdown", init(from)))
  await settle()
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / 30))
  for (let i = 1; i <= steps; i++) {
    el.dispatchEvent(new PointerEvent("pointermove", init(from + ((to - from) * i) / steps)))
    await settle()
  }
  el.dispatchEvent(new PointerEvent("pointerup", init(to, 0)))
  await settle()
}

test("keyboard: the arrow keys turn the focused globe 1 degree, Page Up and Page Down 15 degrees, and Home and End go to the ends", async () => {
  const view = mount(globeDial, { ...range, defaultValue: 20 }, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(view.root)
    await view.keys("ArrowRight", "ArrowUp")
    expect(view.state.value).toBe(22)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "step-key", source: "keyboard" })
    await view.keys("ArrowLeft", "ArrowDown", "ArrowDown")
    expect(view.state.value).toBe(19)
    await view.keys("PageUp")
    expect(view.state.value).toBe(34)
    await view.keys("PageDown", "PageDown")
    expect(view.state.value).toBe(4)
    await view.keys("End")
    expect(view.state.value).toBe(179)
    await view.keys("Home")
    expect(view.state.value).toBe(-180)
  } finally {
    view.unmount()
  }
})

test("keyboard: the globe turns round past 180 degrees in both directions", async () => {
  const view = mount(globeDial, { ...range, defaultValue: 170 }, markup)
  try {
    await view.keys("Tab", "PageUp")
    expect(view.state.value).toBe(-175)
    await view.keys("PageDown")
    expect(view.state.value).toBe(170)
    await view.keys("End", "ArrowRight")
    expect(view.state.value).toBe(-180)
    await view.keys("ArrowLeft")
    expect(view.state.value).toBe(179)
    view.api.setValue(-200)
    expect(view.state.value).toBe(160)
  } finally {
    view.unmount()
  }
})

test("keyboard: the globe is a slider with its bounds, its value and its value text in degrees east or west", async () => {
  const east = mount(globeDial, { ...range, defaultValue: 140 }, markup)
  const west = mount(globeDial, { ...range, defaultValue: -74 }, markup)
  const zero = mount(globeDial, { ...range, defaultValue: 0 }, markup)
  try {
    const { root } = east
    expect(root.getAttribute("role")).toBe("slider")
    expect(root.getAttribute("tabindex")).toBe("0")
    expect(root.getAttribute("aria-valuemin")).toBe("-180")
    expect(root.getAttribute("aria-valuemax")).toBe("179")
    expect(root.getAttribute("aria-valuenow")).toBe("140")
    expect(root.getAttribute("aria-valuetext")).toBe("140 degrees east")
    expect(root.hasAttribute("data-wrap")).toBe(true)
    expect(root.style.getPropertyValue("--rotary-angle")).toBe("140deg")
    expect(west.root.getAttribute("aria-valuetext")).toBe("74 degrees west")
    expect(zero.root.getAttribute("aria-valuetext")).toBe("0 degrees")
    await checkPattern(zero.root, "slider")
  } finally {
    east.unmount()
    west.unmount()
    zero.unmount()
  }
})

test("pointer: a drag around the center turns the globe east and back, 1 degree of longitude for each degree of turn", async () => {
  const view = mount(globeDial, { ...range, defaultValue: 0 }, markup)
  try {
    layOut(view.root)
    await turn(view.root, 30, 120)
    expect(document.activeElement).toBe(view.root)
    expect(view.state.value).toBe(90)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag" })
    await turn(view.root, 120, 60)
    expect(view.state.value).toBe(30)
    // A full turn and a half from 30 lands on 30 + 540 - 720 = -150.
    await turn(view.root, 0, 540)
    expect(view.state.value).toBe(-150)
  } finally {
    view.unmount()
  }
})

test("server: the globe dial renders with no DOM", () => {
  checkServer(globeDial, { ...range, defaultValue: 20 }, markup)
})

// checkDirection asks Left and Right to swap in right to left. The dial turns east for Right in both directions, as a hardware knob does.
test("direction: Left and Right turn the globe the same way in left to right and right to left", async () => {
  try {
    for (const dir of ["ltr", "rtl"]) {
      document.documentElement.dir = dir
      const view = mount(globeDial, { ...range, defaultValue: 20 }, markup)
      try {
        await view.keys("Tab", "ArrowRight", "ArrowRight", "ArrowLeft")
        expect(view.state.value, dir).toBe(21)
      } finally {
        view.unmount()
      }
    }
  } finally {
    document.documentElement.removeAttribute("dir")
  }
})

test("scene: the turn that brings a longitude to the front is -(longitude + 90) degrees", () => {
  expect(spinFor(-90)).toBeCloseTo(0)
  expect(spinFor(0)).toBeCloseTo(-Math.PI / 2)
  expect(spinFor(90)).toBeCloseTo(-Math.PI)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const readout = () => page.root.querySelector("[data-readout]")!.textContent
const globe = () => page.root.querySelector<HTMLElement>("c04-globe")!
const city = (name: string) => page.root.querySelector<HTMLElement>(`[data-city="${name}"] button`)!
const CITIES = ["Honolulu", "New York", "Reykjavik", "London", "Cairo", "Mumbai", "Tokyo"]

test("names: the page names the globe, the 7 city buttons and the status line", async () => {
  page = mountUI(ui)
  await settle()
  expect(globe().getAttribute("role")).toBe("slider")
  expect(globe().getAttribute("aria-label")).toBe("Longitude")
  expect(globe().getAttribute("aria-valuetext")).toBe("20 degrees east")
  expect(page.root.querySelector("canvas")!.getAttribute("aria-hidden")).toBe("true")
  expect([...page.root.querySelectorAll("[data-city] button")].map((b) => b.textContent)).toEqual(CITIES)
  expect(readout()).toBe("20° E")
  expect(status()).toBe("Facing 20° E. No city in front.")
})

test("keyboard: on the page, Tab reaches the globe once, a key turns it, and a city button turns it to the city", async () => {
  const stops = tabbable(page.root)
  expect(stops.length).toBe(1 + CITIES.length)
  expect(stops[0]).toBe(globe())
  globe().focus()
  await keys("PageUp")
  expect(readout()).toBe("35° E")
  expect(status()).toBe("Facing 35° E. Cairo is in front.")
  expect(page.root.querySelector("[data-city='Cairo']")!.hasAttribute("data-here")).toBe(true)
  city("Honolulu").focus()
  await keys("Enter")
  expect(globe().getAttribute("aria-valuenow")).toBe("-158")
  expect(status()).toBe("Facing 158° W. Honolulu is in front.")
  expect(page.root.querySelector("[data-city='Cairo']")!.hasAttribute("data-here")).toBe(false)
  globe().focus()
  await keys("Home")
  expect(readout()).toBe("180°")
  expect(status()).toBe("Facing 180°. No city in front.")
  city("Mumbai").focus()
  await keys("Space")
  expect(status()).toBe("Facing 73° E. Mumbai is in front.")
})

test("agent: an agent turns the globe past 180 degrees, then presses Tokyo", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const labels = page.live().map((entry) => entry.label)
  for (const label of ["Longitude", ...CITIES]) expect(labels, `${label} is missing from the snapshot`).toContain(label)
  expect(page.live().find((e) => e.label === "Longitude")).toMatchObject({ component: "globe-dial", value: 73, actions: ["setValue"] })

  const turned = await page.agent.act({ steps: [ui.task!.steps[0]] })
  expect(turned.ok, turned.error?.message).toBe(true)
  expect(status()).toBe("Facing 160° W. Honolulu is in front.")
  expect(ui.task!.done(page.root)).toBe(false)
  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Facing 140° E. Tokyo is in front.")
  expect(ui.task!.done(page.root)).toBe(true)
  expect(globe().getAttribute("aria-valuenow")).toBe("140")
  expect(readout()).toBe("140° E")
})

test("pointer: on the page, a drag around the globe turns it and the status follows", async () => {
  layOut(globe())
  await turn(globe(), 0, -60)
  expect(readout()).toBe("80° E")
  expect(status()).toBe("Facing 80° E. Mumbai is in front.")
  expect(document.activeElement).toBe(globe())
})
