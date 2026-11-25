import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { type Candle, candleChart, makeCandles, readout } from "./C01-candle-crosshair"

// 5 days. The price scale runs from 98 to 110, so a close of 103 sits 7/12 down the plot.
const FIVE: Candle[] = [
  { date: "2026-10-05", open: 100, high: 104, low: 99, close: 103 },
  { date: "2026-10-06", open: 103, high: 105, low: 101, close: 102 },
  { date: "2026-10-07", open: 102, high: 108, low: 102, close: 107 },
  { date: "2026-10-08", open: 107, high: 109, low: 104, close: 105 },
  { date: "2026-10-09", open: 105, high: 106, low: 100, close: 101 },
]
const markup = `<root aria-label="Price chart"><plot aria-label="Crosshair"></plot></root>`
const options = { candles: FIVE, defaultValue: "2026-10-07" }
type View = ReturnType<typeof mount<typeof candleChart>>
const plot = (view: View) => view.part("plot")!
const style = (el: Element, name: string) => (el as HTMLElement).style.getPropertyValue(name)

// jsdom has no layout: the plot is 500 x 300 px, so the 5 candle centers are at 50, 150, 250, 350 and 450 px.
const place = (el: Element) =>
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 500, bottom: 300, width: 500, height: 300, toJSON: () => ({}) }),
  })
const pointer = (el: Element, type: string, x: number, y: number, pointerType = "mouse") =>
  el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerType, bubbles: true, cancelable: true }))

test("keyboard: the plot is 1 tab stop, arrows step 1 candle, Page Up and Page Down a week, Home and End go to the ends", async () => {
  const view = mount(candleChart, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(plot(view))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await view.keys("ArrowRight")
    expect(view.state.value).toBe("2026-10-08")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "step-key", source: "keyboard" })
    await view.keys("ArrowLeft", "ArrowLeft", "ArrowLeft")
    expect(view.state.value).toBe("2026-10-05")
    await view.keys("PageUp")
    expect(view.state.value).toBe("2026-10-09")
    await view.keys("PageDown")
    expect(view.state.value).toBe("2026-10-05")
    await view.keys("End", "ArrowUp")
    expect(view.state.value).toBe("2026-10-09")
    expect(plot(view).getAttribute("aria-valuenow")).toBe("5")
    expect(plot(view).getAttribute("aria-valuemax")).toBe("5")
    expect(plot(view).getAttribute("aria-valuetext")).toBe("Oct 9: open 105.00, high 106.00, low 100.00, close 101.00, down 3.81%")
    await view.keys("Home", "ArrowDown")
    expect(view.state.value).toBe("2026-10-05")
    expect(plot(view).getAttribute("aria-valuenow")).toBe("1")
  } finally {
    view.unmount()
  }
})

test("keyboard: Escape hides the crosshair, and an arrow shows it again on the latest candle", async () => {
  const view = mount(candleChart, options, markup)
  try {
    expect(view.root.hasAttribute("data-crosshair")).toBe(true)
    await view.keys("Tab", "Escape")
    expect(view.state.value).toBe(null)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "escape-key" })
    expect(view.root.hasAttribute("data-crosshair")).toBe(false)
    expect(plot(view).getAttribute("aria-valuetext")).toBe("Crosshair hidden")
    expect(plot(view).getAttribute("aria-valuenow")).toBe("5")
    await view.keys("ArrowRight")
    expect(view.state.value).toBe("2026-10-09")
    expect(view.root.hasAttribute("data-crosshair")).toBe(true)
  } finally {
    view.unmount()
  }
})

test("pointer: a hover puts the crosshair on the nearest candle, the cross line follows the pointer, and leaving hides it", async () => {
  const view = mount(candleChart, options, markup)
  try {
    place(plot(view))
    pointer(plot(view), "pointermove", 160, 30)
    expect(view.state.value).toBe("2026-10-06")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-hover" })
    pointer(plot(view), "pointermove", 399, 75)
    expect(view.state.value).toBe("2026-10-08")
    await view.settle()
    expect(style(view.root, "--crosshair-x")).toBe("0.7")
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
  const view = mount(candleChart, options, markup)
  try {
    place(plot(view))
    await view.api.clear()
    expect(view.state.value).toBe(null)
    pointer(plot(view), "pointerdown", 40, 150, "touch")
    expect(view.state.value).toBe("2026-10-05")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "track-press" })
  } finally {
    view.unmount()
  }
})

test("pointer: the vertical line sits on the candle's center and, with no pointer, the cross line on its close", async () => {
  const view = mount(candleChart, options, markup)
  try {
    expect(style(view.root, "--crosshair-x")).toBe("0.5")
    view.api.setValue("2026-10-05")
    await view.settle()
    expect(style(view.root, "--crosshair-x")).toBe("0.1")
    expect(Number(style(view.root, "--crosshair-y"))).toBeCloseTo(7 / 12, 6)
    expect(view.api.setValue("2026-10-10")).toBe(false)
    expect(view.state.value).toBe("2026-10-05")
  } finally {
    view.unmount()
  }
})

test("server: the candle chart renders with no DOM", () => {
  checkServer(candleChart, options, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(candleChart, options, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const candles = makeCandles()
const status = () => page.root.querySelector("[data-status]")!.textContent!
const chartPlot = () => page.root.querySelector<HTMLElement>("c01-plot")!
const tags = () => [...page.root.querySelectorAll("[data-tag]")].map((tag) => tag.textContent)
const closeOf = (date: string) => candles.find((c) => c.date === date)!.close.toFixed(2)

test("names: the page names the chart and the crosshair, describes its keys, and draws 50 candles", async () => {
  page = mountUI(ui)
  await settle()
  const chart = page.root.querySelector("c01-candle-chart")!
  expect(chart.getAttribute("aria-label")).toBe("Price chart")
  expect(chart.getAttribute("role")).toBe("group")
  expect(chart.getAttribute("dir")).toBe("ltr")
  expect(chartPlot().getAttribute("role")).toBe("slider")
  expect(chartPlot().getAttribute("aria-label")).toBe("Crosshair")
  expect(chartPlot().getAttribute("aria-roledescription")).toBe("crosshair")
  expect(page.root.querySelector(`#${chartPlot().getAttribute("aria-describedby")}`)!.textContent).toContain("Escape hides the crosshair")
  expect(chartPlot().hasAttribute("aria-disabled")).toBe(false)
  expect(page.root.querySelectorAll("[data-candle]").length).toBe(50)
  expect(page.root.querySelectorAll("[data-candle][data-up]").length).toBe(candles.filter((c) => c.close >= c.open).length)
  expect(page.root.querySelectorAll("[data-date-axis] [data-tick]").length).toBe(5)
  expect(candles[0].date).toBe("2026-09-14")
  expect(candles.at(-1)!.date).toBe("2026-11-20")
  // The crosshair opens on Monday 2 November, between the date labels of Oct 26 and Nov 9, and covers neither.
  expect(status()).toBe(readout(candles, "2026-11-02"))
  expect(chart.hasAttribute("data-crosshair")).toBe(true)
  expect(tags()).toEqual([closeOf("2026-11-02"), "Nov 2"])
  expect(page.root.querySelectorAll("[data-date-axis] [data-tick][data-covered]").length).toBe(0)
})

test("keyboard: on the page, arrows move the crosshair and the status line reads each candle", async () => {
  chartPlot().focus()
  await keys("ArrowLeft")
  expect(status()).toBe(readout(candles, "2026-10-30"))
  expect(tags()).toEqual([closeOf("2026-10-30"), "Oct 30"])
  await keys("PageDown")
  expect(status()).toBe(readout(candles, "2026-10-23"))
  await keys("Home")
  expect(status().startsWith("Sep 14: open ")).toBe(true)
  // The date tag covers the first date label, which is hidden under it.
  expect(page.root.querySelector("[data-date-axis] [data-tick]")!.hasAttribute("data-covered")).toBe(true)
  await keys("Escape")
  expect(status()).toBe("Crosshair hidden.")
  expect(page.root.querySelectorAll("[data-tick][data-covered]").length).toBe(0)
  await keys("End")
  expect(status().startsWith("Nov 20: open ")).toBe(true)
})

test("pointer: on the page, a hover moves the crosshair and the price tag reads the price under the pointer", async () => {
  place(chartPlot())
  pointer(chartPlot(), "pointermove", 5, 0)
  await settle()
  expect(status().startsWith("Sep 14: open ")).toBe(true)
  const [top] = tags()
  pointer(chartPlot(), "pointermove", 6, 300)
  await settle()
  const [bottom] = tags()
  expect(Number(top)).toBeGreaterThan(Number(bottom))
  expect(top).toMatch(/^\d+\.\d\d$/)
  chartPlot().dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }))
  await settle()
  expect(status()).toBe("Crosshair hidden.")
})

test("agent: an agent finds the chart, lists its days, moves the crosshair to Oct 15, is refused a Saturday, and hides it", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const chart = page.live().find((entry) => entry.label === "Price chart")!
  expect(chart.actions).toEqual(["setValue", "clear"])
  const found = await page.agent.query({ within: "Price chart", text: "Oct 15" })
  if ("error" in found) throw new Error(found.error)
  expect(found[0].items).toEqual([{ value: "2026-10-15", label: "Oct 15" }])

  const moved = await page.agent.act({ steps: [{ ref: "Price chart", action: "setValue", args: ["Oct 15"] }] })
  expect(moved.ok, moved.error?.message).toBe(true)
  expect(status()).toBe(readout(candles, "2026-10-15"))
  expect(page.root.querySelector("c01-candle-chart")!.hasAttribute("data-crosshair")).toBe(true)

  const saturday = await page.agent.act({ steps: [{ ref: "Price chart", action: "setValue", args: ["Oct 17"] }] })
  expect(saturday.ok).toBe(false)
  expect(saturday.error?.message).toContain("Oct 17")
  expect(status()).toBe(readout(candles, "2026-10-15"))

  const hidden = await page.agent.act({ steps: [{ ref: "Price chart", action: "clear" }] })
  expect(hidden.ok, hidden.error?.message).toBe(true)
  expect(status()).toBe("Crosshair hidden.")
})
