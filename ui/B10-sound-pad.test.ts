import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { soundPad } from "./B10-sound-pad"

const markup = `<root aria-label="Sound pad"><pad><thumb aria-label="Sound point"></thumb></pad></root>`
type View = ReturnType<typeof mount<typeof soundPad>>
const thumb = (view: View) => view.root.querySelector<HTMLElement>("[data-slot=sound-pad-thumb]")!
const value = (view: View) => view.state.value

test("keyboard: arrows step an axis, Shift steps ten, Page Up moves y and Home goes to the start of x", async () => {
  const view = mount(soundPad, {}, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(thumb(view))
    await view.keys("ArrowRight")
    expect(value(view)).toEqual({ x: 51, y: 50 })
    await view.keys("ArrowUp", "ArrowUp")
    expect(value(view)).toEqual({ x: 51, y: 52 })
    await view.keys("ArrowLeft", "ArrowDown")
    expect(value(view)).toEqual({ x: 50, y: 51 })
    await view.keys("Shift+ArrowRight")
    expect(value(view)).toEqual({ x: 60, y: 51 })
    await view.keys("Shift+ArrowDown")
    expect(value(view)).toEqual({ x: 60, y: 41 })
    await view.keys("PageUp")
    expect(value(view)).toEqual({ x: 60, y: 51 })
    await view.keys("PageDown")
    expect(value(view)).toEqual({ x: 60, y: 41 })
    await view.keys("Home")
    expect(value(view).x).toBe(0)
    await view.keys("End")
    expect(value(view).x).toBe(100)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "step-key", source: "keyboard" })
  } finally {
    view.unmount()
  }
})

test("keyboard: the pad is 1 tab stop and the point stops at the edges", async () => {
  const view = mount(soundPad, { defaultValue: { x: 100, y: 100 } }, markup)
  try {
    await view.keys("Tab")
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await view.keys("ArrowRight", "ArrowUp")
    expect(value(view)).toEqual({ x: 100, y: 100 })
    expect(view.changes.length).toBe(0)
  } finally {
    view.unmount()
  }
})

test("server: the sound pad renders with no DOM", () => {
  checkServer(soundPad, {}, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(soundPad, {}, markup)
})

// jsdom has no layout: the pad is 200 by 100 at (10, 20).
function layOut(pad: Element) {
  Object.defineProperty(pad, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ x: 10, y: 20, left: 10, top: 20, width: 200, height: 100, right: 210, bottom: 120, toJSON: () => ({}) }),
  })
}
const at = (x: number, y: number, buttons = 1) =>
  ({ clientX: x, clientY: y, button: 0, buttons, pointerId: 3, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true }) as PointerEventInit

test("pointer: a press and a drag on the pad move the point and report their reasons", async () => {
  const view = mount(soundPad, {}, markup)
  try {
    const pad = view.root.querySelector("[data-slot=sound-pad-pad]")!
    layOut(pad)
    pad.dispatchEvent(new PointerEvent("pointerdown", at(60, 95)))
    await settle()
    expect(value(view)).toEqual({ x: 25, y: 25 })
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "track-press" })
    pad.dispatchEvent(new PointerEvent("pointermove", at(160, 45)))
    await settle()
    expect(value(view)).toEqual({ x: 75, y: 75 })
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag" })
    pad.dispatchEvent(new PointerEvent("pointerup", at(160, 45, 0)))
    await settle()
    expect(thumb(view).getAttribute("style")).toContain("75%")
  } finally {
    view.unmount()
  }
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const slider = () => page.root.querySelector<HTMLElement>("b10-thumb")!

test("names: the thumb is 1 slider that reads both axes", async () => {
  page = mountUI(ui)
  await settle()
  expect(page.root.querySelector("b10-sound-pad")!.getAttribute("aria-label")).toBe("Sound pad")
  expect(slider().getAttribute("aria-label")).toBe("Sound point")
  expect(slider().getAttribute("aria-valuetext")).toBe("Reverb 50 of 100, Brightness 50 of 100")
  expect(page.root.querySelectorAll("button").length).toBe(2)
  expect(page.root.querySelector("[data-reset] button")!.textContent).toBe("Reset pad")
  expect(page.root.querySelector("[data-save] button")!.textContent).toBe("Save sound")
})

test("keyboard: on the page, arrows change the status line and Reset pad puts the point back", async () => {
  slider().focus()
  await keys("ArrowRight", "Shift+ArrowUp")
  expect(status()).toBe("Reverb 51%, Brightness 60%.")
  expect(slider().getAttribute("aria-valuetext")).toBe("Reverb 51 of 100, Brightness 60 of 100")
  page.root.querySelector<HTMLElement>("[data-reset] button")!.focus()
  await keys("Enter")
  expect(status()).toBe("Reverb 50%, Brightness 50%.")
  page.root.querySelector<HTMLElement>("[data-save] button")!.focus()
  await keys("Space")
  expect(status()).toBe("Saved: Reverb 50%, Brightness 50%.")
})

test("agent: an agent sets the point and saves it, and the status line reports both axes", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const pad = page.live().find((entry) => entry.label === "Sound pad")!
  expect(pad.actions).toEqual(expect.arrayContaining(["setPoint", "reset"]))
  const result = await page.agent.act({
    steps: [
      { ref: "Sound pad", action: "setPoint", args: [80, 30] },
      { ref: "Save sound", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Saved: Reverb 80%, Brightness 30%.")
  expect(slider().getAttribute("aria-valuetext")).toBe("Reverb 80 of 100, Brightness 30 of 100")
  expect(slider().getAttribute("style")).toContain("80%")
})
