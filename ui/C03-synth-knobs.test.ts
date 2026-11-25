import { checkPattern, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui, { synthKnob } from "./C03-synth-knobs"

const cutoff = { min: 0, max: 10, step: 0.1, largeStep: 1, defaultValue: 6.5 }
const phase = { min: -180, max: 180, step: 1, largeStep: 15, wrap: true, unit: "degrees", defaultValue: 170 }
const markup = (label: string) => `<root aria-label="${label}"></root>`

// jsdom has no layout: the knob is 100 by 100 with its center at (100, 100).
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
  ({ ...point(degrees), button: 0, buttons, pointerId: 4, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true }) as PointerEventInit

// Presses at one angle and turns to another in steps of at most 27 degrees, 1 frame each, then lifts.
async function turn(el: Element, from: number, to: number) {
  el.dispatchEvent(new PointerEvent("pointerdown", init(from)))
  await settle()
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / 27))
  for (let i = 1; i <= steps; i++) {
    el.dispatchEvent(new PointerEvent("pointermove", init(from + ((to - from) * i) / steps)))
    await settle()
  }
  el.dispatchEvent(new PointerEvent("pointerup", init(to, 0)))
  await settle()
}

test("keyboard: the arrow keys turn a focused knob, Page Up and Page Down take its large step, and Home and End go to its ends", async () => {
  const view = mount(synthKnob, cutoff, markup("Cutoff"))
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(view.root)
    await view.keys("ArrowUp", "ArrowRight")
    expect(view.state.value).toBe(6.7)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "step-key", source: "keyboard" })
    await view.keys("ArrowDown", "ArrowLeft")
    expect(view.state.value).toBe(6.5)
    await view.keys("PageUp")
    expect(view.state.value).toBe(7.5)
    await view.keys("PageDown", "PageDown")
    expect(view.state.value).toBe(5.5)
    await view.keys("End")
    expect(view.state.value).toBe(10)
    await view.keys("Home")
    expect(view.state.value).toBe(0)
  } finally {
    view.unmount()
  }
})

test("keyboard: Phase turns round past its ends, and a knob that stops does not", async () => {
  const round = mount(synthKnob, phase, markup("Phase"))
  try {
    await round.keys("Tab", "PageUp")
    expect(round.state.value).toBe(-175)
    await round.keys("PageDown")
    expect(round.state.value).toBe(170)
    await round.keys("End")
    expect(round.state.value).toBe(179)
    await round.keys("ArrowUp")
    expect(round.state.value).toBe(-180)
    await round.keys("ArrowLeft")
    expect(round.state.value).toBe(179)
  } finally {
    round.unmount()
  }
  const stops = mount(synthKnob, { min: -50, max: 50, step: 1, largeStep: 10, unit: "cents", defaultValue: 45 }, markup("Detune"))
  try {
    await stops.keys("Tab", "PageUp")
    expect(stops.state.value).toBe(50)
    await stops.keys("ArrowUp")
    expect(stops.state.value).toBe(50)
  } finally {
    stops.unmount()
  }
})

test("keyboard: a knob is a slider with its bounds, its value and its value text with the unit", async () => {
  const attack = mount(synthKnob, { min: 0, max: 2000, step: 10, largeStep: 100, unit: "milliseconds", defaultValue: 120 }, markup("Attack"))
  const round = mount(synthKnob, phase, markup("Phase"))
  const plain = mount(synthKnob, cutoff, markup("Cutoff"))
  try {
    const { root } = attack
    expect(root.getAttribute("role")).toBe("slider")
    expect(root.getAttribute("tabindex")).toBe("0")
    expect(root.getAttribute("aria-valuemin")).toBe("0")
    expect(root.getAttribute("aria-valuemax")).toBe("2000")
    expect(root.getAttribute("aria-valuenow")).toBe("120")
    expect(root.getAttribute("aria-valuetext")).toBe("120 milliseconds")
    expect(root.hasAttribute("data-wrap")).toBe(false)
    expect(round.root.getAttribute("aria-valuemax")).toBe("179")
    expect(round.root.getAttribute("aria-valuetext")).toBe("170 degrees")
    expect(round.root.hasAttribute("data-wrap")).toBe(true)
    expect(plain.root.getAttribute("aria-valuetext")).toBe("6.5")
    expect(plain.root.style.getPropertyValue("--rotary-fraction")).toBe("0.65")
    await checkPattern(plain.root, "slider")
  } finally {
    attack.unmount()
    round.unmount()
    plain.unmount()
  }
})

test("pointer: a drag around the center turns a knob clockwise and back, and stops at its end", async () => {
  const view = mount(synthKnob, { ...cutoff, defaultValue: 5 }, markup("Cutoff"))
  try {
    layOut(view.root)
    // 270 degrees of turn go from 0 to 10, so 27 degrees are 1.
    await turn(view.root, 90, 171)
    expect(document.activeElement).toBe(view.root)
    expect(view.state.value).toBe(8)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag" })
    await turn(view.root, 171, 117)
    expect(view.state.value).toBe(6)
    await turn(view.root, -90, 45)
    expect(view.state.value).toBe(10)
  } finally {
    view.unmount()
  }
})

test("server: the knob renders with no DOM", () => {
  checkServer(synthKnob, cutoff, markup("Cutoff"))
  checkServer(synthKnob, phase, markup("Phase"))
})

// checkDirection asks Left and Right to swap in right to left. A knob turns clockwise for Right in both directions, as a hardware knob does.
test("direction: Left and Right turn a knob the same way in left to right and right to left", async () => {
  try {
    for (const dir of ["ltr", "rtl"]) {
      document.documentElement.dir = dir
      const view = mount(synthKnob, cutoff, markup("Cutoff"))
      try {
        await view.keys("Tab", "ArrowRight", "ArrowRight", "ArrowLeft")
        expect(view.state.value, dir).toBe(6.6)
      } finally {
        view.unmount()
      }
    }
  } finally {
    document.documentElement.removeAttribute("dir")
  }
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const knob = (name: string) => page.root.querySelector<HTMLElement>(`c03-knob[aria-label="${name}"]`)!
const readout = (name: string) => page.root.querySelector(`[data-readout="${name}"]`)!.textContent
const NAMES = ["Cutoff", "Resonance", "Attack", "Release", "Detune", "Phase"]

test("names: the page names the 6 knobs, the save button and the status line", async () => {
  page = mountUI(ui)
  await settle()
  const knobs = [...page.root.querySelectorAll("c03-knob")]
  expect(knobs.map((el) => el.getAttribute("aria-label"))).toEqual(NAMES)
  for (const el of knobs) expect(el.getAttribute("role")).toBe("slider")
  expect(knob("Detune").getAttribute("aria-valuetext")).toBe("-7 cents")
  expect(knob("Phase").hasAttribute("data-wrap")).toBe(true)
  expect(NAMES.map(readout)).toEqual(["6.5", "3.2", "120 ms", "900 ms", "-7 ct", "90°"])
  expect(page.root.querySelector("ui-button button")!.textContent).toBe("Save patch")
  expect(status()).toBe("Turn a knob, then save the patch.")
})

test("agent: an agent finds the 6 knobs, sets Cutoff, Resonance and Phase, and saves the patch", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const labels = page.live().map((entry) => entry.label)
  for (const label of [...NAMES, "Save patch"]) expect(labels, `${label} is missing from the snapshot`).toContain(label)
  const entry = page.live().find((e) => e.label === "Cutoff")!
  expect(entry).toMatchObject({ component: "synth-knob", value: 6.5, actions: ["setValue"] })

  expect(ui.task!.done(page.root)).toBe(false)
  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Saved patch: Cutoff 7.2, Resonance 4.0, Attack 120 ms, Release 900 ms, Detune -7 ct, Phase -170°.")
  expect(ui.task!.done(page.root)).toBe(true)
  expect(knob("Phase").getAttribute("aria-valuenow")).toBe("-170")
  expect(readout("Phase")).toBe("-170°")
})

test("agent: a value past the end of a knob stops at the end, a number in text is read, and Phase turns round", async () => {
  const result = await page.agent.act({
    steps: [
      { ref: "Cutoff", action: "setValue", args: [12] },
      { ref: "Detune", action: "setValue", args: ["-80"] },
      { ref: "Phase", action: "setValue", args: [-190] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(readout("Cutoff")).toBe("10.0")
  expect(readout("Detune")).toBe("-50 ct")
  expect(readout("Phase")).toBe("170°")
  expect(status()).toBe("Phase 170°.")
})

test("keyboard: on the page, Tab reaches each knob once, and a key turns it and updates its readout and the status line", async () => {
  const stops = tabbable(page.root)
  expect(stops.length).toBe(7)
  expect(stops.slice(0, 6)).toEqual(NAMES.map(knob))
  knob("Cutoff").focus()
  await keys("ArrowDown")
  expect(readout("Cutoff")).toBe("9.9")
  expect(status()).toBe("Cutoff 9.9.")
  await keys("Tab")
  expect(document.activeElement).toBe(knob("Resonance"))
  await keys("ArrowUp")
  expect(readout("Resonance")).toBe("4.1")
  expect(knob("Resonance").getAttribute("aria-valuetext")).toBe("4.1")
  knob("Phase").focus()
  await keys("PageUp")
  expect(readout("Phase")).toBe("-175°")
  page.root.querySelector<HTMLElement>("ui-button button")!.focus()
  await keys("Enter")
  expect(status()).toBe("Saved patch: Cutoff 9.9, Resonance 4.1, Attack 120 ms, Release 900 ms, Detune -50 ct, Phase -175°.")
})

test("pointer: on the page, a drag around Attack turns it and its readout follows", async () => {
  layOut(knob("Attack"))
  // 270 degrees go from 0 to 2000 ms, so 27 degrees are 200 ms.
  await turn(knob("Attack"), 0, 27)
  expect(readout("Attack")).toBe("320 ms")
  expect(status()).toBe("Attack 320 ms.")
  expect(document.activeElement).toBe(knob("Attack"))
})
