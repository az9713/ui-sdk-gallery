import { checkServer, mount } from "@ui-sdk/core/testing"
import { afterEach, expect, test, vi } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { brew } from "./B24-coffee-dose"

const markup = `<root aria-label="Coffee dose"><less>Less coffee</less><more>More coffee</more></root>`
// Delay and repeat are short, so a held button repeats within the test.
const options = { min: 1, max: 6, defaultValue: 3, delay: 30, repeat: 15 }
type View = ReturnType<typeof mount<typeof brew>>
const less = (view: View) => view.part("less")!
const more = (view: View) => view.part("more")!
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function pointer(el: HTMLElement, type: string) {
  const box = el.getBoundingClientRect()
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      isPrimary: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    }),
  )
}

afterEach(() => document.documentElement.removeAttribute("dir"))

test("keyboard: Space and Enter on a button step 1 gram, and a step at the limit changes nothing", async () => {
  const view = mount(brew, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(less(view))
    await view.keys("Space")
    expect(view.state.value).toBe(2)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "step-press", source: "keyboard" })
    await view.keys("Enter")
    expect(view.state.value).toBe(1)
    const count = view.changes.length
    await view.keys("Space")
    expect(view.state.value).toBe(1)
    expect(view.changes.length).toBe(count)
    await view.keys("Tab", "Space")
    expect(view.state.value).toBe(2)
    expect(document.activeElement).toBe(more(view))
  } finally {
    view.unmount()
  }
})

test("keyboard: a button at its limit is aria-disabled and stays a tab stop", async () => {
  const view = mount(brew, { ...options, defaultValue: 1 }, markup)
  try {
    expect(less(view).getAttribute("role")).toBe("button")
    expect(less(view).getAttribute("aria-disabled")).toBe("true")
    expect(less(view).hasAttribute("data-limit")).toBe(true)
    expect(more(view).hasAttribute("aria-disabled")).toBe(false)
    expect(less(view).tabIndex).toBe(0)
    expect(more(view).tabIndex).toBe(0)
    await view.keys("Tab")
    expect(document.activeElement).toBe(less(view))
    await view.keys("Tab", "Space")
    expect(more(view).hasAttribute("aria-disabled")).toBe(false)
    expect(view.state.value).toBe(2)
    expect(less(view).hasAttribute("aria-disabled")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: holding More coffee steps at once, keeps stepping, and stops at the limit", async () => {
  const view = mount(brew, { ...options, delay: 120, repeat: 20 }, markup)
  try {
    pointer(more(view), "pointerdown")
    await settle()
    expect(view.state.value).toBe(4)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "step-press" })
    expect(more(view).hasAttribute("data-holding")).toBe(true)
    await wait(400)
    expect(view.state.value).toBe(6)
    expect(view.changes.map((c) => c.reason)).toEqual(["step-press", "hold-repeat", "hold-repeat"])
    expect(more(view).getAttribute("aria-disabled")).toBe("true")
    const count = view.changes.length
    await wait(100)
    expect(view.changes.length).toBe(count)
    pointer(more(view), "pointerup")
    await settle()
    expect(view.state.value).toBe(6)
    expect(more(view).hasAttribute("data-holding")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: letting go stops the repeat, and Less coffee holds downward", async () => {
  const view = mount(brew, { min: 0, max: 100, defaultValue: 50, delay: 30, repeat: 15 }, markup)
  try {
    pointer(less(view), "pointerdown")
    await wait(120)
    pointer(less(view), "pointerup")
    await settle()
    const stopped = view.state.value
    expect(stopped).toBeLessThan(48)
    await wait(100)
    expect(view.state.value).toBe(stopped)
  } finally {
    view.unmount()
  }
})

test("keyboard: holding Space repeats at the pace of the button, not of the keyboard", async () => {
  const view = mount(brew, { min: 0, max: 100, defaultValue: 50, delay: 30, repeat: 15 }, markup)
  try {
    await view.keys("Tab", "Tab")
    const el = more(view)
    expect(document.activeElement).toBe(el)
    const init = { key: " ", bubbles: true, cancelable: true }
    el.dispatchEvent(new KeyboardEvent("keydown", init))
    expect(view.state.value).toBe(51)
    for (let i = 0; i < 20; i++) el.dispatchEvent(new KeyboardEvent("keydown", { ...init, repeat: true }))
    expect(view.state.value).toBe(51)
    await wait(250)
    el.dispatchEvent(new KeyboardEvent("keyup", init))
    await settle()
    const stopped = view.state.value
    expect(stopped).toBeGreaterThan(53)
    expect(stopped).toBeLessThan(75)
    await wait(80)
    expect(view.state.value).toBe(stopped)
  } finally {
    view.unmount()
  }
})

test("keyboard: a press with a pointer steps once, and the click after it does not step again", async () => {
  const view = mount(brew, options, markup)
  try {
    pointer(more(view), "pointerdown")
    pointer(more(view), "pointerup")
    // A click that follows a real press has a detail of 1; el.click() has 0 and counts as a click with no press behind it.
    more(view).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }))
    await settle()
    expect(view.state.value).toBe(4)
    expect(view.changes.length).toBe(1)
    await wait(80)
    expect(view.state.value).toBe(4)
    await view.click(less(view))
    expect(view.state.value).toBe(3)
  } finally {
    view.unmount()
  }
})

test("server: the dose control renders with no DOM", () => {
  checkServer(brew, options, markup)
})

// The buttons take no arrow keys, so there is no key whose result depends on the direction.
test("direction: the buttons do the same in left-to-right and right-to-left, and arrows change nothing", async () => {
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(brew, options, markup)
    try {
      await view.keys("Tab", "ArrowLeft", "ArrowRight")
      expect(view.state.value, dir).toBe(3)
      expect(document.activeElement, dir).toBe(less(view))
      await view.keys("Space", "Tab", "Enter", "Enter")
      expect(view.state.value, dir).toBe(4)
    } finally {
      view.unmount()
    }
  }
})

let calm: ReturnType<typeof mountUI> | undefined
test("visual: with reduced motion the cup shows the end state, a higher level and a darker colour for a bigger dose", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }))
  try {
    calm = mountUI(ui)
    await settle()
    const cup = calm.root.querySelector("[data-liquid]")!
    const level = () => Number(cup.getAttribute("y"))
    const colour = () => (cup as SVGElement).style.fill
    const at18 = { level: level(), colour: colour() }
    expect(at18.level).toBeGreaterThan(40)
    expect(at18.level).toBeLessThan(176)
    expect(calm.root.querySelectorAll("[data-ticks] line").length).toBe(4)
    await calm.agent.act({ steps: [{ ref: "Coffee dose", action: "setValue", args: [40] }] })
    expect(level()).toBeLessThan(at18.level)
    expect(colour()).not.toBe(at18.colour)
    const dark = colour()
    await calm.agent.act({ steps: [{ ref: "Coffee dose", action: "setValue", args: [8] }] })
    expect(level()).toBeGreaterThan(at18.level)
    expect(colour()).not.toBe(dark)
  } finally {
    vi.unstubAllGlobals()
    calm?.root.remove()
  }
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const liquid = () => page.root.querySelector("[data-liquid]")!

test("names: the page names the dose control, its 2 buttons, the cup and the brew button", async () => {
  page = mountUI(ui)
  await settle()
  const control = page.root.querySelector("b24-brew")!
  expect(control.getAttribute("role")).toBe("group")
  expect(control.getAttribute("aria-label")).toBe("Coffee dose")
  expect(page.root.querySelector("b24-less")!.textContent).toBe("Less coffee")
  expect(page.root.querySelector("b24-more")!.textContent).toBe("More coffee")
  expect(page.root.querySelector("[data-brew] button")!.textContent).toBe("Start brew")
  expect(page.root.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true")
  expect(page.root.querySelector("[data-grams]")!.textContent).toBe("18")
  expect(status()).toBe("Dose: 18 g coffee, 288 g water.")
})

test("keyboard: on the page, the buttons move the dose, the readout and the cup follow, and a button stops at 8 g", async () => {
  const lessButton = page.root.querySelector<HTMLElement>("b24-less")!
  lessButton.focus()
  await keys("Space")
  expect(status()).toBe("Dose: 17 g coffee, 272 g water.")
  expect(page.root.querySelector("[data-grams]")!.textContent).toBe("17")
  expect(page.root.querySelector("[data-water-grams]")!.textContent).toBe("272")
  expect(page.root.querySelector("svg")!.getAttribute("data-amount")).toBe("17")
  await keys("Tab", "Enter")
  expect(status()).toBe("Dose: 18 g coffee, 288 g water.")
  lessButton.focus()
  for (let i = 0; i < 12; i++) await keys("Space")
  expect(status()).toBe("Dose: 8 g coffee, 128 g water.")
  expect(lessButton.getAttribute("aria-disabled")).toBe("true")
  await keys("Enter")
  expect(status()).toBe("Dose: 8 g coffee, 128 g water.")
  await keys("Tab", "Enter", "Enter")
  expect(status()).toBe("Dose: 10 g coffee, 160 g water.")
})

test("agent: an agent sets 20 g, steps up twice and starts the brew, and a dose out of range is refused", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const control = page.live().find((entry) => entry.label === "Coffee dose")!
  expect(control.actions).toEqual(["setValue", "increment", "decrement"])
  expect(control).toMatchObject({ value: 10 })

  const refused = await page.agent.act({ steps: [{ ref: "Coffee dose", action: "setValue", args: [41] }] })
  expect(refused.ok).toBe(false)
  expect(refused.error?.message).toContain("from 8 to 40 g")
  const fraction = await page.agent.act({ steps: [{ ref: "Coffee dose", action: "setValue", args: [12.5] }] })
  expect(fraction.ok).toBe(false)
  expect(status()).toBe("Dose: 10 g coffee, 160 g water.")

  const dose = () => page.live().find((entry) => entry.label === "Coffee dose")!.value
  await page.agent.act({ steps: [{ ref: "Coffee dose", action: "setValue", args: [40] }, { ref: "Coffee dose", action: "increment" }] })
  expect(dose()).toBe(40)
  expect(status()).toBe("Dose: 40 g coffee, 640 g water.")
  await page.agent.act({ steps: [{ ref: "Coffee dose", action: "setValue", args: [8] }, { ref: "Coffee dose", action: "decrement" }] })
  expect(dose()).toBe(8)

  expect(ui.task!.done(page.root)).toBe(false)
  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Brewing 22 g coffee with 352 g water.")
  expect(ui.task!.done(page.root)).toBe(true)
  expect(liquid().getAttribute("y")).not.toBeNull()
})
