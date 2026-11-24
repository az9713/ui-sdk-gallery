import { checkDirection, checkPattern, checkServer, mount } from "@ui-sdk/core/testing"
import { afterEach, expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { sizePicker } from "./F07-size-picker"

const SIZES = ["38", "39", "40"]
const options = { sizes: SIZES }
const markup = `<root aria-label="Shoe size">${SIZES.map((s) => `<size value="${s}">${s}</size>`).join("")}</root>`
type View = ReturnType<typeof mount<typeof sizePicker>>
const radios = (view: View) => [...view.root.querySelectorAll<HTMLElement>("[data-slot=size-picker-size]")]
const radio = (view: View, size: string) => radios(view).find((el) => el.textContent === size)!
const focused = () => document.activeElement?.textContent

afterEach(() => {
  document.documentElement.removeAttribute("dir")
})

test("keyboard: the arrow keys choose a size as they move, and the group is 1 tab stop on the chosen one", async () => {
  const view = mount(sizePicker, { ...options, defaultValue: "39" }, markup)
  try {
    expect(view.root.getAttribute("role")).toBe("radiogroup")
    expect(radios(view).every((el) => el.getAttribute("role") === "radio")).toBe(true)
    expect(radios(view).filter((el) => el.tabIndex === 0)).toEqual([radio(view, "39")])
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await view.keys("Tab")
    expect(focused()).toBe("39")
    await view.keys("ArrowRight")
    expect(focused()).toBe("40")
    expect(view.state.value).toBe("40")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "list-navigation", source: "keyboard" })
    await view.keys("ArrowRight")
    expect(focused()).toBe("38")
    expect(view.state.value).toBe("38")
    await view.keys("ArrowLeft")
    expect(view.state.value).toBe("40")
    await view.keys("ArrowDown")
    expect(view.state.value).toBe("38")
    await view.keys("ArrowUp")
    expect(view.state.value).toBe("40")
    await view.keys("Home")
    expect(view.state.value).toBe("38")
    await view.keys("End")
    expect(view.state.value).toBe("40")
    expect(radios(view).map((el) => el.getAttribute("aria-checked"))).toEqual(["false", "false", "true"])
    expect(radios(view).filter((el) => el.tabIndex === 0)).toEqual([radio(view, "40")])
    expect(radios(view).filter((el) => el.hasAttribute("data-checked"))).toEqual([radio(view, "40")])
  } finally {
    view.unmount()
  }
})

test("keyboard: with no size chosen, the tab stop is the first size and no radio is checked", async () => {
  const view = mount(sizePicker, options, markup)
  try {
    expect(view.state.value).toBe("")
    expect(radios(view).map((el) => el.getAttribute("aria-checked"))).toEqual(["false", "false", "false"])
    expect(radios(view).some((el) => el.hasAttribute("data-checked"))).toBe(false)
    await view.keys("Tab")
    expect(focused()).toBe("38")
    expect(view.state.value).toBe("")
  } finally {
    view.unmount()
  }
})

test("keyboard: Space chooses the focused size, and a click chooses a size", async () => {
  const view = mount(sizePicker, { ...options, defaultValue: "38" }, markup)
  try {
    radio(view, "39").focus()
    expect(view.state.value).toBe("38")
    await view.keys("Space")
    expect(view.state.value).toBe("39")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
    const count = view.changes.length
    await view.keys("Space")
    expect(view.changes.length).toBe(count)
    await view.keys("Enter")
    expect(view.state.value).toBe("39")
    await view.click(radio(view, "40"))
    expect(view.state.value).toBe("40")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "mouse" })
  } finally {
    view.unmount()
  }
})

test("keyboard: the group follows the radio group pattern", async () => {
  const view = mount(sizePicker, { ...options, defaultValue: "38" }, markup)
  try {
    await checkPattern(view.root, "radio-group")
  } finally {
    view.unmount()
  }
})

test("server: the size picker renders with no DOM", () => {
  checkServer(sizePicker, { ...options, defaultValue: "39" }, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(sizePicker, { ...options, defaultValue: "38" }, markup)
})

test("direction: ArrowRight moves to the next size in ltr and to the previous size in rtl", async () => {
  const seen: Record<string, string> = {}
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(sizePicker, { ...options, defaultValue: "39" }, markup)
    try {
      await view.keys("Tab", "ArrowRight")
      seen[dir] = view.state.value
    } finally {
      view.unmount()
    }
  }
  expect(seen).toEqual({ ltr: "40", rtl: "38" })
})

test("agent: the primitive's setValue takes only its own sizes", async () => {
  const view = mount(sizePicker, { ...options, defaultValue: "38" }, markup)
  try {
    expect(view.api.sizes()).toEqual(SIZES.map((s) => ({ value: s, label: s })))
    expect(view.api.setValue("47")).toBe(false)
    expect(view.state.value).toBe("38")
    expect(radio(view, "38").getAttribute("aria-checked")).toBe("true")
    expect(view.api.setValue("40")).toBe(true)
    expect(view.state.value).toBe("40")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "imperative" })
  } finally {
    view.unmount()
  }
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const shape = () => page.root.querySelector<SVGGElement>("[data-foot]")!
const size = (value: string) => page.root.querySelector<HTMLElement>(`f07-size[value="${value}"]`)!

test("names: the page names the picker, its 9 sizes and the bag button, and hides the drawing", async () => {
  page = mountUI(ui)
  await settle()
  const picker = page.root.querySelector("f07-size-picker")!
  expect(picker.getAttribute("role")).toBe("radiogroup")
  expect(page.root.querySelector(`#${picker.getAttribute("aria-labelledby")}`)!.textContent).toBe("Shoe size (EU)")
  expect([...page.root.querySelectorAll("f07-size")].map((el) => el.textContent)).toEqual([
    "38", "39", "40", "41", "42", "43", "44", "45", "46",
  ])
  expect(page.root.querySelectorAll("f07-size[role=radio]").length).toBe(9)
  expect(page.root.querySelector("[data-bag] button")!.textContent).toBe("Add to bag")
  expect(page.root.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true")
  expect(page.root.querySelector("svg text")).toBeNull()
  expect(page.root.querySelector("h2")!.textContent).toBe("Trail Runner 2")
  expect(size("41").getAttribute("aria-checked")).toBe("true")
  expect(size("41").tabIndex).toBe(0)
  expect(shape().style.transform).toBe("scale(0.8836)")
  expect(page.root.querySelector("[data-length]")!.textContent).toBe("25.8 cm")
  expect(status()).toBe("Size 41 selected. Foot length 25.8 cm.")
  expect(page.live().map((entry) => entry.label)).toEqual(["Shoe size (EU)", "Add to bag"])
})

test("keyboard: on the page, the arrow keys change the size, the foot outline scales and the status line follows", async () => {
  size("41").focus()
  await keys("ArrowRight")
  expect(status()).toBe("Size 42 selected. Foot length 26.5 cm.")
  expect(shape().style.transform).toBe("scale(0.9075)")
  expect(page.root.querySelector("[data-length]")!.textContent).toBe("26.5 cm")
  await keys("End")
  expect(status()).toBe("Size 46 selected. Foot length 29.2 cm.")
  expect(shape().style.transform).toBe("scale(1)")
  await keys("ArrowRight")
  expect(status()).toBe("Size 38 selected. Foot length 23.8 cm.")
  expect(shape().style.transform).toBe("scale(0.8151)")
  expect(size("38").tabIndex).toBe(0)
  await keys("Space")
  expect(status()).toBe("Size 38 selected. Foot length 23.8 cm.")
  page.root.querySelector<HTMLElement>("[data-bag] button")!.focus()
  await keys("Enter")
  expect(status()).toBe("Added Trail Runner 2 in size 38 to your bag.")
})

test("agent: an agent chooses size 42, and size 47 is refused with the 9 real sizes", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const picker = page.live().find((entry) => entry.label === "Shoe size (EU)")!
  expect(picker.actions).toEqual(["setValue"])
  expect(picker).toMatchObject({ value: "38" })

  expect(ui.task!.done(page.root)).toBe(false)
  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok).toBe(false)
  expect(result.error?.step).toBe(1)
  expect(result.error?.message).toContain('No item "47"')
  expect(result.error?.message).toContain("38, 39, 40, 41, 42, 43, 44, 45, 46")
  expect(status()).toBe("Size 42 selected. Foot length 26.5 cm.")
  expect(shape().style.transform).toBe("scale(0.9075)")
  expect(page.live().find((entry) => entry.label === "Shoe size (EU)")).toMatchObject({ value: "42" })
  expect(ui.task!.done(page.root)).toBe(true)

  const press = await page.agent.act({ steps: [{ ref: "Add to bag", action: "press" }] })
  expect(press.ok, press.error?.message).toBe(true)
  expect(status()).toBe("Added Trail Runner 2 in size 42 to your bag.")
})
