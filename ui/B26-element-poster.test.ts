import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { poster } from "./B26-element-poster"

// 3 elements and the data sources. Neon is open at the start.
const SYMBOLS = ["H", "Ne", "Au"]
const NAMES: Record<string, string> = { H: "Hydrogen", Ne: "Neon", Au: "Gold" }
const markup = `<root aria-label="Chemical elements">${SYMBOLS.map(
  (s) => `<element value="${s}"><trigger value="${s}">${NAMES[s]}</trigger><panel value="${s}">Facts about ${NAMES[s]}</panel></element>`,
).join("")}<notes aria-label="Mass notes">Standard values</notes></root>`
const options = { defaultValue: ["Ne"] }
type View = ReturnType<typeof mount<typeof poster>>
const trigger = (view: View, key: string) => view.part("trigger", key)!
const panel = (view: View, key: string) => view.part("panel", key)!
const found = (el: Element) => el.dispatchEvent(new Event("beforematch", { bubbles: true }))

test("keyboard: Tab visits each trigger, and each trigger is 1 tab stop", async () => {
  const view = mount(poster, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(trigger(view, "H"))
    await view.keys("Tab")
    expect(document.activeElement).toBe(trigger(view, "Ne"))
    await view.keys("Tab")
    expect(document.activeElement).toBe(trigger(view, "Au"))
    expect(view.root.querySelectorAll("button:not([tabindex='-1'])").length).toBe(3)
  } finally {
    view.unmount()
  }
})

test("keyboard: Space and Enter open and close a panel, and the panels are independent", async () => {
  const view = mount(poster, options, markup)
  try {
    await view.keys("Tab", "Space")
    expect(view.state.value).toEqual(["Ne", "H"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
    await view.keys("Tab", "Tab", "Enter")
    expect(view.state.value).toEqual(["Ne", "H", "Au"])
    await view.keys("Shift+Tab", "Enter")
    expect(view.state.value).toEqual(["H", "Au"])
    await view.keys("Shift+Tab", "Space")
    expect(view.state.value).toEqual(["Au"])
  } finally {
    view.unmount()
  }
})

test("keyboard: a click opens a panel and a second click closes it", async () => {
  const view = mount(poster, options, markup)
  try {
    await view.click(trigger(view, "Au"))
    expect(view.state.value).toEqual(["Ne", "Au"])
    await view.click(trigger(view, "Au"))
    expect(view.state.value).toEqual(["Ne"])
  } finally {
    view.unmount()
  }
})

test("keyboard: a trigger reports its panel in aria-expanded and aria-controls", async () => {
  const view = mount(poster, options, markup)
  try {
    await settle()
    for (const key of SYMBOLS) {
      const open = key === "Ne"
      expect(trigger(view, key).getAttribute("aria-expanded"), key).toBe(String(open))
      expect(trigger(view, key).getAttribute("aria-controls"), key).toBe(panel(view, key).id)
      expect(panel(view, key).getAttribute("aria-labelledby"), key).toBe(trigger(view, key).id)
      expect(panel(view, key).getAttribute("role"), key).toBe("group")
    }
    await view.keys("Tab", "Space")
    expect(trigger(view, "H").getAttribute("aria-expanded")).toBe("true")
  } finally {
    view.unmount()
  }
})

test("keyboard: a closed panel is hidden until found, and an open panel is shown", async () => {
  const view = mount(poster, options, markup)
  try {
    await settle()
    expect(panel(view, "H").getAttribute("hidden")).toBe("until-found")
    expect(panel(view, "Au").getAttribute("hidden")).toBe("until-found")
    expect(panel(view, "Ne").hasAttribute("hidden")).toBe(false)
    expect(view.part("notes")!.getAttribute("hidden")).toBe("until-found")
    expect(panel(view, "H").isConnected).toBe(true)
    expect(panel(view, "H").textContent).toBe("Facts about Hydrogen")
  } finally {
    view.unmount()
  }
})

test("keyboard: a closed panel leaves the exiting list and is hidden until found again", async () => {
  const view = mount(poster, options, markup)
  try {
    await settle()
    await view.click(trigger(view, "Ne"))
    await settle()
    expect(view.state.value).toEqual([])
    expect(view.state.exiting).toEqual([])
    expect(panel(view, "Ne").getAttribute("hidden")).toBe("until-found")
    await view.click(trigger(view, "Ne"))
    await settle()
    expect(panel(view, "Ne").hasAttribute("hidden")).toBe(false)
    expect(view.state.exiting).toEqual([])
  } finally {
    view.unmount()
  }
})

test("find: a beforematch event on a closed panel opens it, at once", async () => {
  const view = mount(poster, options, markup)
  try {
    await settle()
    found(panel(view, "Au"))
    await settle()
    expect(view.state.value).toEqual(["Ne", "Au"])
    expect(view.state.opening).toBe("instant")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "find-in-page" })
    expect(trigger(view, "Au").getAttribute("aria-expanded")).toBe("true")
    expect(panel(view, "Au").hasAttribute("hidden")).toBe(false)
    // The other closed panel stays closed and findable.
    expect(panel(view, "H").getAttribute("hidden")).toBe("until-found")
  } finally {
    view.unmount()
  }
})

test("find: a beforematch event on an open panel changes nothing", async () => {
  const view = mount(poster, options, markup)
  try {
    await settle()
    const before = view.changes.length
    found(panel(view, "Ne"))
    await settle()
    expect(view.changes.length).toBe(before)
    expect(view.state.value).toEqual(["Ne"])
  } finally {
    view.unmount()
  }
})

test("find: a beforematch event on the data sources opens them with no panel", async () => {
  const view = mount(poster, options, markup)
  try {
    await settle()
    found(view.part("notes")!)
    await settle()
    expect(view.state.value).toEqual(["Ne", "notes"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "find-in-page" })
    expect(view.part("notes")!.hasAttribute("hidden")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("find: a panel opened by a press animates, and the state follows at once", async () => {
  const view = mount(poster, options, markup)
  try {
    await view.click(trigger(view, "H"))
    expect(view.state.opening).toBe("animate")
    expect(view.state.value).toContain("H")
    view.root.dispatchEvent(new Event("noop"))
  } finally {
    view.unmount()
  }
})

test("find: with reduced motion a closing panel is hidden at once", async () => {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia
  const view = mount(poster, options, markup)
  try {
    await settle()
    await view.click(trigger(view, "Ne"))
    await settle()
    expect(view.state.exiting).toEqual([])
    expect(panel(view, "Ne").getAttribute("hidden")).toBe("until-found")
  } finally {
    view.unmount()
    window.matchMedia = original
  }
})

test("server: the poster renders with no DOM", () => {
  checkServer(poster, options, markup)
})

// This poster has no arrow key to mirror. Direction still changes the order of the tiles in a row, so the keys must do the same in both.
test("direction: Tab order and Space work the same in left-to-right and right-to-left", async () => {
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(poster, options, markup)
    try {
      await view.keys("Tab", "Tab", "Space")
      expect(document.activeElement, dir).toBe(trigger(view, "Ne"))
      expect(view.state.value, dir).toEqual([])
    } finally {
      view.unmount()
      document.documentElement.dir = "ltr"
    }
  }
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const panelOf = (symbol: string) => page.root.querySelector(`b26-panel[value="${symbol}"]`)!
const triggerOf = (symbol: string) => page.root.querySelector<HTMLButtonElement>(`b26-trigger[value="${symbol}"] button`)!

test("names: the page names the poster, each tile, each panel and each button", async () => {
  page = mountUI(ui)
  await settle()
  const grid = page.root.querySelector("b26-poster")!
  expect(grid.getAttribute("aria-label")).toBe("Chemical elements")
  expect(grid.getAttribute("role")).toBe("group")
  expect(page.root.querySelectorAll("b26-trigger").length).toBe(8)
  expect(page.root.querySelectorAll("b26-panel").length).toBe(8)
  expect([...page.root.querySelectorAll("b26-trigger button")].map((b) => b.textContent)).toEqual([
    "Hydrogen", "Helium", "Lithium", "Neon", "Sodium", "Chlorine", "Iron", "Gold",
  ])
  expect([...page.root.querySelectorAll("[data-actions] button")].map((b) => b.textContent)).toEqual([
    "Open all panels", "Close all panels", "Data sources",
  ])
  // 2 panels are open at the start, and the 6 closed panels wait for find in page.
  expect([...page.root.querySelectorAll("b26-panel")].filter((el) => el.hasAttribute("hidden")).length).toBe(6)
  expect(page.root.querySelectorAll('b26-panel[hidden="until-found"]').length).toBe(6)
  expect(page.root.querySelector("b26-notes")!.getAttribute("hidden")).toBe("until-found")
  expect(status()).toBe("Open panels: Neon, Sodium.")
})

test("keyboard: on the page, Space opens the focused tile and the status line reports it", async () => {
  triggerOf("Au").focus()
  await keys("Space")
  expect(status()).toBe("Open panels: Neon, Sodium, Gold.")
  expect(triggerOf("Au").getAttribute("aria-expanded")).toBe("true")
  expect(panelOf("Au").hasAttribute("hidden")).toBe(false)
  expect(page.root.querySelector('b26-element[value="Au"]')!.hasAttribute("data-open")).toBe(true)
  await keys("Enter")
  await settle()
  expect(status()).toBe("Open panels: Neon, Sodium.")
  expect(panelOf("Au").getAttribute("hidden")).toBe("until-found")
  expect(page.root.querySelector('b26-element[value="Au"]')!.hasAttribute("data-open")).toBe(false)
})

test("find: on the page, a match in a closed panel opens it and the status line says so", async () => {
  found(panelOf("Cl"))
  await settle()
  expect(status()).toBe("Find in page opened Chlorine. Open panels: Neon, Sodium, Chlorine.")
  expect(triggerOf("Cl").getAttribute("aria-expanded")).toBe("true")
  expect(panelOf("Cl").hasAttribute("hidden")).toBe(false)
  // A second match in the same panel changes nothing.
  found(panelOf("Cl"))
  await settle()
  expect(status()).toBe("Find in page opened Chlorine. Open panels: Neon, Sodium, Chlorine.")
})

test("find: on the page, Close all closes the panels and Open all opens them at once", async () => {
  const button = (text: string) => [...page.root.querySelectorAll<HTMLButtonElement>("[data-actions] button")].find((b) => b.textContent === text)!
  button("Close all panels").focus()
  await keys("Enter")
  await settle()
  expect(status()).toBe("No panel is open.")
  expect(page.root.querySelectorAll('b26-panel[hidden="until-found"]').length).toBe(8)
  button("Open all panels").focus()
  await keys("Enter")
  await settle()
  expect(status()).toBe("Open panels: Hydrogen, Helium, Lithium, Neon, Sodium, Chlorine, Iron, Gold.")
  expect(page.root.querySelectorAll("b26-panel[hidden]").length).toBe(0)
})

test("find: on the page, the data sources open from their button and from find in page", async () => {
  const sources = page.root.querySelector<HTMLButtonElement>("[data-sources] button")!
  expect(sources.getAttribute("aria-expanded")).toBe("false")
  sources.focus()
  await keys("Space")
  expect(status().endsWith("Data sources are shown.")).toBe(true)
  expect(sources.getAttribute("aria-expanded")).toBe("true")
  expect(page.root.querySelector("b26-notes")!.hasAttribute("hidden")).toBe(false)
  await keys("Space")
  await settle()
  expect(sources.getAttribute("aria-expanded")).toBe("false")
  expect(page.root.querySelector("b26-notes")!.getAttribute("hidden")).toBe("until-found")
  found(page.root.querySelector("b26-notes")!)
  await settle()
  expect(status()).toContain("Find in page opened the data sources. ")
  expect(sources.getAttribute("aria-expanded")).toBe("true")
  sources.focus()
  await keys("Space")
  await settle()
  expect(sources.getAttribute("aria-expanded")).toBe("false")
})

test("agent: an agent toggles tiles by name, and cannot open an unknown panel", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const labels = page.live().map((entry) => entry.label)
  for (const name of ["Chemical elements", "Open all panels", "Close all panels", "Data sources"]) expect(labels).toContain(name)
  // The bridge lists the 8 tiles as buttons of the poster.
  const grid = page.live().find((entry) => entry.label === "Chemical elements")!
  expect(grid.actions).toEqual(["toggle"])
  expect(JSON.stringify(grid)).toContain('"buttons":["Hydrogen","Helium","Lithium","Neon","Sodium","Chlorine","Iron","Gold"]')

  // Reset: Close all, then open Neon and Sodium again with the agent. The agent names a tile, and the bridge passes its symbol.
  await page.agent.act({ steps: [{ ref: "Close all panels", action: "press" }] })
  await settle()
  const toggle = (name: string) => ({ ref: "Chemical elements", action: "toggle", args: [name] })
  const result = await page.agent.act({
    steps: [toggle("Neon"), toggle("Sodium"), toggle("Gold"), toggle("Chlorine"), toggle("Gold")],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Open panels: Neon, Sodium, Chlorine.")
  expect(triggerOf("Au").getAttribute("aria-expanded")).toBe("false")
  expect(triggerOf("Cl").getAttribute("aria-expanded")).toBe("true")

  // The root takes a symbol too, and refuses a name that its items do not list.
  const viaRoot = await page.agent.act({ steps: [{ ref: "Chemical elements", action: "toggle", args: ["Fe"] }] })
  expect(viaRoot.ok, viaRoot.error?.message).toBe(true)
  expect(status()).toBe("Open panels: Neon, Sodium, Chlorine, Iron.")
  const unknown = await page.agent.act({ steps: [{ ref: "Chemical elements", action: "toggle", args: ["Uranium"] }] })
  expect(unknown.ok).toBe(false)
  expect(status()).toBe("Open panels: Neon, Sodium, Chlorine, Iron.")
})
