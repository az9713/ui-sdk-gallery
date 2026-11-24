import { checkDirection, checkPattern, checkServer, mount } from "@ui-sdk/core/testing"
import { createLocalStorage } from "@ui-sdk/core"
import { afterEach, expect, test, vi } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { themeSwitch } from "./B28-theme-switch"

const markup = `<root aria-label="Theme"><choice value="light">Light</choice><choice value="dark">Dark</choice><choice value="sepia">Sepia</choice></root>`
type View = ReturnType<typeof mount<typeof themeSwitch>>
const choices = (view: View) => [...view.root.querySelectorAll<HTMLElement>("[data-slot=theme-switch-choice]")]
const choice = (view: View, name: string) => choices(view).find((el) => el.textContent === name)!
const focused = () => document.activeElement?.textContent

afterEach(() => {
  document.documentElement.removeAttribute("dir")
  vi.unstubAllGlobals()
  localStorage.clear()
})

test("keyboard: the arrow keys choose a theme as they move, and the group is 1 tab stop on the chosen one", async () => {
  const view = mount(themeSwitch, { defaultValue: "dark" }, markup)
  try {
    expect(view.root.getAttribute("role")).toBe("radiogroup")
    expect(choices(view).every((el) => el.getAttribute("role") === "radio")).toBe(true)
    expect(choices(view).filter((el) => el.tabIndex === 0)).toEqual([choice(view, "Dark")])
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await view.keys("Tab")
    expect(focused()).toBe("Dark")
    await view.keys("ArrowRight")
    expect(focused()).toBe("Sepia")
    expect(view.state.value).toBe("sepia")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "list-navigation", source: "keyboard" })
    await view.keys("ArrowRight")
    expect(focused()).toBe("Light")
    expect(view.state.value).toBe("light")
    await view.keys("ArrowLeft")
    expect(view.state.value).toBe("sepia")
    await view.keys("ArrowDown")
    expect(view.state.value).toBe("light")
    await view.keys("ArrowUp")
    expect(view.state.value).toBe("sepia")
    await view.keys("Home")
    expect(view.state.value).toBe("light")
    await view.keys("End")
    expect(view.state.value).toBe("sepia")
    expect(choices(view).map((el) => el.getAttribute("aria-checked"))).toEqual(["false", "false", "true"])
    expect(choices(view).filter((el) => el.tabIndex === 0)).toEqual([choice(view, "Sepia")])
    expect(choices(view).filter((el) => el.hasAttribute("data-checked"))).toEqual([choice(view, "Sepia")])
  } finally {
    view.unmount()
  }
})

test("keyboard: Space chooses the focused theme, and a click chooses a theme", async () => {
  const view = mount(themeSwitch, { defaultValue: "light" }, markup)
  try {
    choice(view, "Dark").focus()
    expect(view.state.value).toBe("light")
    await view.keys("Space")
    expect(view.state.value).toBe("dark")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
    const count = view.changes.length
    await view.keys("Space")
    expect(view.changes.length).toBe(count)
    await view.keys("Enter")
    expect(view.state.value).toBe("dark")
    await view.click(choice(view, "Sepia"))
    expect(view.state.value).toBe("sepia")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "mouse" })
  } finally {
    view.unmount()
  }
})

test("keyboard: the group follows the radio group pattern", async () => {
  const view = mount(themeSwitch, { defaultValue: "light" }, markup)
  try {
    await checkPattern(view.root, "radio-group")
  } finally {
    view.unmount()
  }
})

test("server: the theme switch renders with no DOM", () => {
  checkServer(themeSwitch, { defaultValue: "dark" }, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(themeSwitch, { defaultValue: "light" }, markup)
})

test("direction: ArrowRight moves to the next theme in ltr and to the previous theme in rtl", async () => {
  const seen: Record<string, string> = {}
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(themeSwitch, { defaultValue: "dark" }, markup)
    try {
      await view.keys("Tab", "ArrowRight")
      seen[dir] = view.state.value
    } finally {
      view.unmount()
    }
  }
  expect(seen).toEqual({ ltr: "sepia", rtl: "light" })
})

test("agent: the primitive offers setValue for the 3 themes, and a theme that does not exist throws", async () => {
  const view = mount(themeSwitch, { defaultValue: "light" }, markup)
  try {
    expect(view.api.themes()).toEqual([
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
      { value: "sepia", label: "Sepia" },
    ])
    expect(() => view.api.setValue("neon")).toThrow('No theme "neon". Themes: light, dark, sepia.')
    expect(view.state.value).toBe("light")
    expect(view.api.setValue("sepia")).toBe(true)
    expect(view.state.value).toBe("sepia")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "imperative" })
  } finally {
    view.unmount()
  }
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
const status = (root: HTMLElement) => root.querySelector("[data-status]")!.textContent
const panel = (root: HTMLElement) => root.querySelector("ui-preferences")!
const radio = (root: HTMLElement, name: string) => [...root.querySelectorAll<HTMLElement>("b28-theme-choice")].find((el) => el.textContent === name)!
const KEY = "b28-theme"

test("names: the page names the switch, its 3 themes, the chart and the 7 days", async () => {
  const page = mountUI(ui)
  await settle()
  const control = page.root.querySelector("b28-theme-switch")!
  expect(control.getAttribute("role")).toBe("radiogroup")
  expect(control.getAttribute("aria-label")).toBe("Theme")
  expect([...page.root.querySelectorAll("b28-theme-choice")].map((el) => el.textContent)).toEqual(["Light", "Dark", "Sepia"])
  expect(page.root.querySelector("h2")!.textContent).toBe("Lisbon, 7-day forecast")
  expect(page.root.querySelectorAll("[data-days] li").length).toBe(7)
  expect(page.root.querySelector("[data-days]")!.getAttribute("aria-label")).toBe("Daily forecast")
  expect(page.root.querySelector("[data-chart] svg")!.getAttribute("aria-hidden")).toBe("true")
  expect(page.root.querySelectorAll("[data-chart] [data-bar]").length).toBe(7)
  expect(page.root.querySelectorAll("[data-chart] [data-dot]").length).toBe(14)
  for (const kind of ["high", "low"]) {
    const path = page.root.querySelector(`[data-line="${kind}"]`)!.getAttribute("d")!
    expect(path.startsWith("M")).toBe(true)
    expect(path).not.toContain("NaN")
  }
  expect(page.root.querySelector("[data-band]")!.getAttribute("d")).not.toContain("NaN")
  expect(page.live().map((entry) => entry.label)).toEqual(["Theme"])
  page.root.remove()
})

test("storage: with nothing saved, the first theme follows the browser's preference and nothing is written", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("dark"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }))
  const page = mountUI(ui)
  await settle()
  expect(panel(page.root).getAttribute("data-theme")).toBe("dark")
  expect(radio(page.root, "Dark").getAttribute("aria-checked")).toBe("true")
  expect(status(page.root)).toBe("Theme: Dark, from your browser. Nothing is saved.")
  expect(localStorage.getItem(KEY)).toBeNull()
  page.root.remove()
})

test("storage: with nothing saved and no browser preference, the first theme is Light", async () => {
  const page = mountUI(ui)
  await settle()
  expect(panel(page.root).getAttribute("data-theme")).toBe("light")
  expect(status(page.root)).toBe("Theme: Light, from your browser. Nothing is saved.")
  page.root.remove()
})

test("storage: a chosen theme is kept in local storage, and the next mount restores it", async () => {
  const first = mountUI(ui)
  await settle()
  expect(localStorage.getItem(KEY)).toBeNull()
  radio(first.root, "Light").focus()
  await keys("ArrowRight")
  expect(panel(first.root).getAttribute("data-theme")).toBe("dark")
  expect(status(first.root)).toBe("Saved the Dark theme.")
  expect(localStorage.getItem(KEY)).toContain("dark")
  expect(createLocalStorage(KEY).get()).toBe("dark")
  await keys("ArrowRight")
  expect(panel(first.root).getAttribute("data-theme")).toBe("sepia")
  expect(createLocalStorage(KEY).get()).toBe("sepia")
  expect(status(first.root)).toBe("Saved the Sepia theme.")
  first.root.remove()

  const second = mountUI(ui)
  await settle()
  expect(panel(second.root).getAttribute("data-theme")).toBe("sepia")
  expect(radio(second.root, "Sepia").getAttribute("aria-checked")).toBe("true")
  expect(radio(second.root, "Sepia").tabIndex).toBe(0)
  expect(radio(second.root, "Light").tabIndex).toBe(-1)
  expect(status(second.root)).toBe("Restored your saved Sepia theme.")
  expect(ui.task!.done(second.root)).toBe(false)
  second.root.remove()
})

test("storage: a saved theme wins over the browser's preference, and a value that is not a theme is ignored", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("dark"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }))
  createLocalStorage(KEY).set("light")
  const saved = mountUI(ui)
  await settle()
  expect(panel(saved.root).getAttribute("data-theme")).toBe("light")
  expect(status(saved.root)).toBe("Restored your saved Light theme.")
  saved.root.remove()

  createLocalStorage(KEY).set("neon")
  const bad = mountUI(ui)
  await settle()
  expect(panel(bad.root).getAttribute("data-theme")).toBe("dark")
  expect(status(bad.root)).toBe("Theme: Dark, from your browser. Nothing is saved.")
  bad.root.remove()
})

test("keyboard: on the page, Tab enters the switch on the chosen theme, and the chart and the days stay while the theme changes", async () => {
  const page = mountUI(ui)
  await settle()
  const before = page.root.querySelector("[data-chart]")!.innerHTML
  radio(page.root, "Light").focus()
  await keys("Space")
  expect(status(page.root)).toBe("Theme: Light, from your browser. Nothing is saved.")
  await keys("ArrowRight")
  expect(panel(page.root).getAttribute("data-theme")).toBe("dark")
  await keys("ArrowLeft", "ArrowLeft")
  expect(panel(page.root).getAttribute("data-theme")).toBe("sepia")
  expect(radio(page.root, "Sepia").tabIndex).toBe(0)
  expect(page.root.querySelector("[data-chart]")!.innerHTML).toBe(before)
  await keys("Space")
  expect(createLocalStorage(KEY).get()).toBe("sepia")
  page.root.remove()
})

test("agent: an agent chooses the Sepia theme by its name, the page saves it, and an unknown theme is refused", async () => {
  const page = mountUI(ui)
  await settle()
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const control = page.live().find((entry) => entry.label === "Theme")!
  expect(control.actions).toEqual(["setValue"])
  expect(control).toMatchObject({ value: "light" })

  const refused = await page.agent.act({ steps: [{ ref: "Theme", action: "setValue", args: ["Neon"] }] })
  expect(refused.ok).toBe(false)
  expect(panel(page.root).getAttribute("data-theme")).toBe("light")
  expect(localStorage.getItem(KEY)).toBeNull()

  expect(ui.task!.done(page.root)).toBe(false)
  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status(page.root)).toBe("Saved the Sepia theme.")
  expect(panel(page.root).getAttribute("data-theme")).toBe("sepia")
  expect(createLocalStorage(KEY).get()).toBe("sepia")
  expect(page.live().find((entry) => entry.label === "Theme")).toMatchObject({ value: "sepia" })
  expect(ui.task!.done(page.root)).toBe(true)

  const same = await page.agent.act({ steps: [{ ref: "Theme", action: "setValue", args: ["Sepia"] }] })
  expect(same.ok).toBe(true)
  expect(status(page.root)).toBe("Saved the Sepia theme.")
})
