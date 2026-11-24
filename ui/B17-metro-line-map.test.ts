import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { metroLine } from "./B17-metro-line-map"

// 5 stations. Mill Park and Museum both start with M, and Old Market has a space in its name.
const NAMES = ["Harbour", "Old Market", "Mill Park", "Museum", "Stadium"]
const markup = `<root aria-label="Metro stations">${NAMES.map((n) => `<station value="${n}">${n}</station>`).join("")}</root>`
type View = ReturnType<typeof mount<typeof metroLine>>
const stations = (view: View) => [...view.root.querySelectorAll<HTMLElement>("[data-slot=metro-line-station]")]
const station = (view: View, name: string) => stations(view).find((el) => el.textContent === name)!
const focused = () => document.activeElement?.textContent

test("keyboard: the line is 1 tab stop, and Left and Right, Home and End move focus only", async () => {
  const view = mount(metroLine, {}, markup)
  try {
    expect(view.root.getAttribute("role")).toBe("listbox")
    expect(view.root.getAttribute("aria-orientation")).toBe("horizontal")
    expect(stations(view).every((el) => el.getAttribute("role") === "option")).toBe(true)
    expect(stations(view).filter((el) => el.tabIndex === 0)).toEqual([station(view, "Harbour")])
    await view.keys("Tab")
    expect(focused()).toBe("Harbour")
    await view.keys("ArrowRight", "ArrowRight")
    expect(focused()).toBe("Mill Park")
    expect(stations(view).filter((el) => el.tabIndex === 0)).toEqual([station(view, "Mill Park")])
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await view.keys("ArrowLeft")
    expect(focused()).toBe("Old Market")
    await view.keys("End")
    expect(focused()).toBe("Stadium")
    await view.keys("ArrowRight")
    expect(focused()).toBe("Stadium")
    await view.keys("Home")
    expect(focused()).toBe("Harbour")
    expect(view.changes.length).toBe(0)
    expect(stations(view).some((el) => el.getAttribute("aria-selected") === "true")).toBe(false)
    expect(stations(view).every((el) => el.getAttribute("aria-selected") === "false")).toBe(true)
  } finally {
    view.unmount()
  }
})

test("keyboard: typing a name moves focus to that station and picks nothing", async () => {
  const view = mount(metroLine, {}, markup)
  try {
    await view.keys("Tab", "s")
    expect(focused()).toBe("Stadium")
    await view.keys("Home", "m")
    expect(focused()).toBe("Mill Park")
    // The same letter again steps to the next station that starts with it.
    await view.keys("m")
    expect(focused()).toBe("Museum")
    expect(stations(view).filter((el) => el.tabIndex === 0)).toEqual([station(view, "Museum")])
    await view.keys("Home", "m", "u")
    expect(focused()).toBe("Museum")
    await view.keys("z")
    expect(focused()).toBe("Museum")
    expect(view.changes.length).toBe(0)
    expect(view.state.value).toBe(null)
  } finally {
    view.unmount()
  }
})

test("keyboard: Space continues a name that is being typed, and picks the focused station when none is", async () => {
  const view = mount(metroLine, {}, markup)
  try {
    await view.keys("Tab", "o", "l", "d", "Space", "m")
    expect(focused()).toBe("Old Market")
    expect(view.state.value).toBe(null)
    expect(view.changes.length).toBe(0)
    await view.keys("Escape", "Space")
    expect(view.state.value).toBe("Old Market")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
  } finally {
    view.unmount()
  }
})

test("keyboard: Space and Enter pick the focused station, and the arrow keys do not", async () => {
  const view = mount(metroLine, {}, markup)
  try {
    await view.keys("Tab", "ArrowRight", "ArrowRight")
    expect(view.state.value).toBe(null)
    await view.keys("Space")
    expect(view.state.value).toBe("Mill Park")
    expect(station(view, "Mill Park").getAttribute("aria-selected")).toBe("true")
    expect(station(view, "Mill Park").hasAttribute("data-selected")).toBe(true)
    await view.keys("ArrowRight", "Enter")
    expect(view.state.value).toBe("Museum")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
    expect(station(view, "Museum").getAttribute("aria-selected")).toBe("true")
    expect(station(view, "Mill Park").getAttribute("aria-selected")).toBe("false")
    expect(station(view, "Mill Park").hasAttribute("data-selected")).toBe(false)
    expect(stations(view).filter((el) => el.getAttribute("aria-selected") === "true").length).toBe(1)
  } finally {
    view.unmount()
  }
})

test("keyboard: a click picks a station", async () => {
  const view = mount(metroLine, { defaultValue: "Harbour" }, markup)
  try {
    await view.click(station(view, "Stadium"))
    expect(view.state.value).toBe("Stadium")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press" })
  } finally {
    view.unmount()
  }
})

test("server: the metro line renders with no DOM", () => {
  checkServer(metroLine, {}, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(metroLine, {}, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const onPage = () => [...page.root.querySelectorAll<HTMLElement>("b17-station")]

test("names: the page names the line, each station and the button", async () => {
  page = mountUI(ui)
  await settle()
  expect(page.root.querySelector("b17-line")!.getAttribute("aria-label")).toBe("Metro stations")
  expect(page.root.querySelector("b17-line")!.getAttribute("role")).toBe("listbox")
  expect(onPage().map((el) => el.textContent)).toEqual([
    "Harbour",
    "Old Market",
    "Cathedral",
    "Museum",
    "Mill Park",
    "Stadium",
    "Airport",
  ])
  expect(page.root.querySelector("button")!.textContent).toBe("Plan trip")
  expect(page.root.querySelector("h2")!.textContent).toBe("Line 4")
})

test("keyboard: on the page, typing finds a station, Space picks it and the status line reports it", async () => {
  page.root.querySelector<HTMLElement>("button")!.focus()
  await keys("Enter")
  expect(status()).toBe("Pick a destination first.")
  expect(onPage().filter((el) => el.tabIndex === 0).length).toBe(1)
  onPage()[0].focus()
  await keys("a", "i")
  expect(document.activeElement?.textContent).toBe("Airport")
  await keys("Escape", "Space")
  expect(status()).toBe("Destination: Airport.")
  expect(onPage().filter((el) => el.getAttribute("aria-selected") === "true").map((el) => el.textContent)).toEqual(["Airport"])
  await keys("ArrowLeft", "Enter")
  expect(status()).toBe("Destination: Stadium.")
  page.root.querySelector<HTMLElement>("button")!.focus()
  await keys("Enter")
  expect(status()).toBe("Trip to Stadium: 5 stops from Harbour.")
})

test("agent: an agent picks Museum and plans the trip, and a station that is not on the line is refused", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const line = page.live().find((entry) => entry.label === "Metro stations")!
  expect(line.actions).toEqual(["pick"])
  const found = await page.agent.query({ within: "Metro stations" })
  expect(JSON.stringify(found)).toContain("Museum")
  expect(JSON.stringify(found)).toContain("Airport")

  const refused = await page.agent.act({ steps: [{ ref: "Metro stations", action: "pick", args: ["Atlantis"] }] })
  expect(refused.ok).toBe(true)
  expect(refused.steps[0].result).toBe(false)
  expect(status()).toBe("Trip to Stadium: 5 stops from Harbour.")

  const result = await page.agent.act({
    steps: [
      { ref: "Metro stations", action: "pick", args: ["Museum"] },
      { ref: "Plan trip", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Trip to Museum: 3 stops from Harbour.")
  expect(onPage().filter((el) => el.hasAttribute("data-selected")).map((el) => el.textContent)).toEqual(["Museum"])
})
