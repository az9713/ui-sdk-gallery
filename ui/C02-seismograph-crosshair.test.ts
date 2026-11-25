import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { makeQuakes, type Quake, readout, seismograph } from "./C02-seismograph-crosshair"

// 5 earthquakes, unevenly spaced in the day. The peaks run to 40, so the velocity scale runs from -40 to 40.
const FIVE: Quake[] = [
  { time: "01:00", minute: 60, magnitude: 2.1, depth: 5, peak: 10 },
  { time: "02:00", minute: 120, magnitude: 3.2, depth: 8, peak: 20 },
  { time: "03:00", minute: 180, magnitude: 1.9, depth: 4, peak: 5 },
  { time: "15:00", minute: 900, magnitude: 3.6, depth: 12, peak: 30 },
  { time: "20:00", minute: 1200, magnitude: 4.0, depth: 10, peak: 40 },
]
const markup = `<root aria-label="Seismograph"><plot aria-label="Crosshair"></plot></root>`
const options = { quakes: FIVE, defaultValue: "03:00" }
type View = ReturnType<typeof mount<typeof seismograph>>
const plot = (view: View) => view.part("plot")!
const style = (el: Element, name: string) => (el as HTMLElement).style.getPropertyValue(name)

// jsdom has no layout: the plot is 480 x 300 px, so 1 px is 3 minutes and the 5 earthquakes are at 20, 40, 60, 300 and 400 px.
const place = (el: Element) =>
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300, toJSON: () => ({}) }),
  })
const pointer = (el: Element, type: string, x: number, y: number, pointerType = "mouse") =>
  el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerType, bubbles: true, cancelable: true }))

test("keyboard: the plot is 1 tab stop, arrows step 1 earthquake, Page Up and Page Down 3, Home and End go to the ends", async () => {
  const view = mount(seismograph, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(plot(view))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await view.keys("ArrowRight")
    expect(view.state.value).toBe("15:00")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "step-key", source: "keyboard" })
    await view.keys("ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft")
    expect(view.state.value).toBe("01:00")
    await view.keys("PageUp")
    expect(view.state.value).toBe("15:00")
    await view.keys("PageDown")
    expect(view.state.value).toBe("01:00")
    await view.keys("End", "ArrowUp")
    expect(view.state.value).toBe("20:00")
    expect(plot(view).getAttribute("aria-valuenow")).toBe("5")
    expect(plot(view).getAttribute("aria-valuemax")).toBe("5")
    expect(plot(view).getAttribute("aria-valuetext")).toBe("20:00 UTC: magnitude 4.0, depth 10 km, peak 40.0 µm/s")
    await view.keys("Home", "ArrowDown")
    expect(view.state.value).toBe("01:00")
    expect(plot(view).getAttribute("aria-valuenow")).toBe("1")
  } finally {
    view.unmount()
  }
})

test("keyboard: Escape hides the crosshair, and an arrow shows it again on the latest earthquake", async () => {
  const view = mount(seismograph, options, markup)
  try {
    expect(view.root.hasAttribute("data-crosshair")).toBe(true)
    await view.keys("Tab", "Escape")
    expect(view.state.value).toBe(null)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "escape-key" })
    expect(view.root.hasAttribute("data-crosshair")).toBe(false)
    expect(plot(view).getAttribute("aria-valuetext")).toBe("Crosshair hidden")
    await view.keys("ArrowRight")
    expect(view.state.value).toBe("20:00")
    expect(view.root.hasAttribute("data-crosshair")).toBe(true)
  } finally {
    view.unmount()
  }
})

test("pointer: a hover puts the crosshair on the earthquake nearest in time, the cross line follows the pointer, and leaving hides it", async () => {
  const view = mount(seismograph, options, markup)
  try {
    place(plot(view))
    pointer(plot(view), "pointermove", 33, 30)
    expect(view.state.value).toBe("02:00")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-hover" })
    // 250 px is 12:30. 15:00 is nearest in time; at even steps by order, 03:00 would be.
    pointer(plot(view), "pointermove", 250, 75)
    expect(view.state.value).toBe("15:00")
    await view.settle()
    expect(style(view.root, "--crosshair-x")).toBe("0.625")
    expect(style(view.root, "--crosshair-y")).toBe("0.25")
    expect(view.root.hasAttribute("data-pointer")).toBe(true)
    plot(view).dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }))
    await view.settle()
    expect(view.state.value).toBe(null)
    expect(view.root.hasAttribute("data-crosshair")).toBe(false)
    expect(view.root.hasAttribute("data-pointer")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("pointer: a press shows the crosshair at once, for touch, which has no hover", async () => {
  const view = mount(seismograph, options, markup)
  try {
    place(plot(view))
    await view.api.clear()
    expect(view.state.value).toBe(null)
    pointer(plot(view), "pointerdown", 390, 150, "touch")
    expect(view.state.value).toBe("20:00")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "track-press" })
  } finally {
    view.unmount()
  }
})

test("pointer: with no pointer, the vertical line sits on the earthquake's time and the cross line on its peak", async () => {
  const view = mount(seismograph, options, markup)
  try {
    expect(style(view.root, "--crosshair-x")).toBe("0.125")
    expect(Number(style(view.root, "--crosshair-y"))).toBeCloseTo(35 / 80, 6)
    view.api.setValue("02:00")
    await view.settle()
    expect(Number(style(view.root, "--crosshair-x"))).toBeCloseTo(120 / 1440, 6)
    expect(Number(style(view.root, "--crosshair-y"))).toBeCloseTo(0.25, 6)
    expect(view.api.setValue("05:00")).toBe(false)
    expect(view.state.value).toBe("02:00")
  } finally {
    view.unmount()
  }
})

test("server: the seismograph renders with no DOM", () => {
  checkServer(seismograph, options, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(seismograph, options, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const quakes = makeQuakes()
const status = () => page.root.querySelector("[data-status]")!.textContent!
const chartPlot = () => page.root.querySelector<HTMLElement>("c02-plot")!
const tags = () => [...page.root.querySelectorAll("[data-tag]")].map((tag) => tag.textContent)

test("names: the page names the seismograph and the crosshair, describes its keys, and draws the trace and 12 earthquakes", async () => {
  page = mountUI(ui)
  await settle()
  const chart = page.root.querySelector("c02-seismograph")!
  expect(chart.getAttribute("aria-label")).toBe("Seismograph")
  expect(chart.getAttribute("role")).toBe("group")
  expect(chart.getAttribute("dir")).toBe("ltr")
  expect(chartPlot().getAttribute("role")).toBe("slider")
  expect(chartPlot().getAttribute("aria-label")).toBe("Crosshair")
  expect(chartPlot().getAttribute("aria-roledescription")).toBe("crosshair")
  expect(page.root.querySelector(`#${chartPlot().getAttribute("aria-describedby")}`)!.textContent).toContain("Escape hides the crosshair")
  expect(chartPlot().hasAttribute("aria-disabled")).toBe(false)
  expect(quakes.map((q) => q.time)).toEqual([
    "01:18", "02:51", "04:06", "06:42", "07:15", "09:58", "14:02", "14:19", "14:51", "17:26", "19:37", "22:14",
  ])
  expect(page.root.querySelectorAll("[data-quake]").length).toBe(12)
  expect(page.root.querySelectorAll("[data-quake][data-strong]").length).toBe(2)
  const wave = page.root.querySelector("[data-wave]")!.getAttribute("d")!
  expect(wave.startsWith("M0,")).toBe(true)
  expect(wave).not.toContain("NaN")
  expect(page.root.querySelectorAll("[data-time-axis] [data-tick]").length).toBe(6)
  expect([...page.root.querySelectorAll("[data-amplitude-axis] [data-tick]")].map((t) => t.textContent)).toEqual(["-40", "-20", "0", "20", "40"])
  // The crosshair opens on the main shock at 14:02, between the time labels of 12:00 and 16:00, and covers neither.
  expect(status()).toBe("14:02 UTC: magnitude 5.2, depth 17 km, peak 33.1 µm/s")
  expect(chart.hasAttribute("data-crosshair")).toBe(true)
  expect(tags()).toEqual(["33.1", "14:02"])
  expect(page.root.querySelectorAll("[data-tick][data-covered]").length).toBe(0)
})

test("keyboard: on the page, arrows move the crosshair and the status line reads each earthquake", async () => {
  chartPlot().focus()
  await keys("ArrowLeft")
  expect(status()).toBe(readout(quakes, "09:58"))
  expect(tags()).toEqual([quakes[5].peak.toFixed(1), "09:58"])
  await keys("PageDown")
  expect(status()).toBe(readout(quakes, "04:06"))
  await keys("Home")
  expect(status().startsWith("01:18 UTC: magnitude 2.4")).toBe(true)
  // The time tag covers the 00:00 label, which is hidden under it.
  expect(page.root.querySelector("[data-time-axis] [data-tick]")!.hasAttribute("data-covered")).toBe(true)
  await keys("Escape")
  expect(status()).toBe("Crosshair hidden.")
  expect(page.root.querySelectorAll("[data-tick][data-covered]").length).toBe(0)
  await keys("End")
  expect(status().startsWith("22:14 UTC: magnitude 2.5")).toBe(true)
})

test("pointer: on the page, a hover moves the crosshair and the velocity tag reads the ground velocity under the pointer", async () => {
  place(chartPlot())
  pointer(chartPlot(), "pointermove", 5, 0)
  await settle()
  expect(status().startsWith("01:18 UTC: ")).toBe(true)
  expect(tags()).toEqual(["40.0", "01:18"])
  pointer(chartPlot(), "pointermove", 6, 300)
  await settle()
  expect(tags()).toEqual(["-40.0", "01:18"])
  pointer(chartPlot(), "pointermove", 6, 150)
  await settle()
  expect(tags()[0]).toBe("0.0")
  chartPlot().dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }))
  await settle()
  expect(status()).toBe("Crosshair hidden.")
})

test("agent: an agent finds the seismograph, lists its earthquakes, moves the crosshair to 06:42, is refused 05:00, and hides it", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const chart = page.live().find((entry) => entry.label === "Seismograph")!
  expect(chart.actions).toEqual(["setValue", "clear"])
  const found = await page.agent.query({ within: "Seismograph", text: "06:42" })
  if ("error" in found) throw new Error(found.error)
  expect(found[0].items).toEqual([{ value: "06:42", label: "06:42" }])

  const moved = await page.agent.act({ steps: [{ ref: "Seismograph", action: "setValue", args: ["06:42"] }] })
  expect(moved.ok, moved.error?.message).toBe(true)
  expect(status()).toBe("06:42 UTC: magnitude 4.3, depth 21 km, peak 17.7 µm/s")
  expect(page.root.querySelector("c02-seismograph")!.hasAttribute("data-crosshair")).toBe(true)

  const none = await page.agent.act({ steps: [{ ref: "Seismograph", action: "setValue", args: ["05:00"] }] })
  expect(none.ok).toBe(false)
  expect(none.error?.message).toContain("05:00")
  expect(status()).toBe(readout(quakes, "06:42"))

  const hidden = await page.agent.act({ steps: [{ ref: "Seismograph", action: "clear" }] })
  expect(hidden.ok, hidden.error?.message).toBe(true)
  expect(status()).toBe("Crosshair hidden.")
})
