import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { timeWheel } from "./B14-time-wheel"

// 1 wheel of 5 hours.
const markup = `<root aria-label="Hour wheel">${["00", "01", "02", "03", "04"].map((v) => `<option value="${v}">${v}</option>`).join("")}</root>`
type View = ReturnType<typeof mount<typeof timeWheel>>
const options = (view: View) => [...view.root.querySelectorAll<HTMLElement>("[data-slot=time-wheel-option]")]
const option = (view: View, value: string) => options(view).find((el) => el.textContent === value)!

test("keyboard: arrow keys, Home and End pick the option that gets focus", async () => {
  const view = mount(timeWheel, { defaultValue: "01" }, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(option(view, "01"))
    await view.keys("ArrowDown", "ArrowDown")
    expect(document.activeElement).toBe(option(view, "03"))
    expect(view.state.value).toBe("03")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "list-navigation", source: "keyboard" })
    await view.keys("ArrowUp")
    expect(view.state.value).toBe("02")
    await view.keys("End")
    expect(view.state.value).toBe("04")
    expect(document.activeElement).toBe(option(view, "04"))
    const count = view.changes.length
    await view.keys("ArrowDown")
    expect(view.state.value).toBe("04")
    expect(view.changes.length).toBe(count)
    await view.keys("Home")
    expect(view.state.value).toBe("00")
    expect(document.activeElement).toBe(option(view, "00"))
  } finally {
    view.unmount()
  }
})

test("keyboard: the wheel is 1 tab stop, and it is the picked option", async () => {
  const view = mount(timeWheel, { defaultValue: "02" }, markup)
  try {
    expect(view.root.getAttribute("role")).toBe("listbox")
    expect(options(view).every((el) => el.getAttribute("role") === "option")).toBe(true)
    expect(options(view).filter((el) => el.tabIndex === 0)).toEqual([option(view, "02")])
    expect(options(view).filter((el) => el.getAttribute("aria-selected") === "true")).toEqual([option(view, "02")])
    expect(options(view).filter((el) => el.hasAttribute("data-selected"))).toEqual([option(view, "02")])
    await view.keys("Tab", "ArrowDown")
    expect(options(view).filter((el) => el.tabIndex === 0)).toEqual([option(view, "03")])
    expect(option(view, "02").getAttribute("aria-selected")).toBe("false")
    expect(option(view, "02").hasAttribute("data-selected")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: a wheel with no pick has 1 tab stop on its first option", () => {
  const view = mount(timeWheel, {}, markup)
  try {
    expect(options(view).filter((el) => el.tabIndex === 0)).toEqual([option(view, "00")])
    expect(options(view).some((el) => el.getAttribute("aria-selected") === "true")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: a click picks an option and focuses it", async () => {
  const view = mount(timeWheel, { defaultValue: "01" }, markup)
  try {
    await view.click(option(view, "04"))
    expect(document.activeElement).toBe(option(view, "04"))
    await view.keys("ArrowUp")
    expect(view.state.value).toBe("03")
    await view.click(option(view, "04"))
    expect(view.state.value).toBe("04")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press" })
    expect(option(view, "04").getAttribute("aria-selected")).toBe("true")
    expect(options(view).filter((el) => el.tabIndex === 0)).toEqual([option(view, "04")])
  } finally {
    view.unmount()
  }
})

// mount() gives every element a box, so the same option is at the center each time.
test("keyboard: scrolling the wheel picks the option at the center", async () => {
  const view = mount(timeWheel, { defaultValue: "01" }, markup)
  try {
    view.root.dispatchEvent(new Event("scroll"))
    await view.settle()
    expect(view.state.value).not.toBe("01")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "scroll" })
    const picked = options(view).filter((el) => el.getAttribute("aria-selected") === "true")
    expect(picked.length).toBe(1)
    expect(picked[0].textContent).toBe(view.state.value)
    expect(options(view).filter((el) => el.tabIndex === 0)).toEqual(picked)
  } finally {
    view.unmount()
  }
})

test("server: the wheel renders with no DOM", () => {
  checkServer(timeWheel, { defaultValue: "01" }, markup)
})

test("direction: Up and Down pick the same options in left to right and right to left text, and Left and Right change nothing", async () => {
  const results: (string | null)[] = []
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(timeWheel, { defaultValue: "01" }, markup)
    try {
      await view.keys("Tab", "ArrowLeft", "ArrowRight")
      expect(view.state.value, dir).toBe("01")
      await view.keys("ArrowDown", "ArrowDown", "ArrowUp")
      expect(view.state.value, dir).toBe("02")
      results.push(view.state.value)
    } finally {
      view.unmount()
      document.documentElement.removeAttribute("dir")
    }
  }
  expect(results[1]).toBe(results[0])
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const wheel = (label: string) => page.root.querySelector<HTMLElement>(`b14-wheel[aria-label="${label}"]`)!
const stopOf = (label: string) => [...wheel(label).querySelectorAll<HTMLElement>("b14-option")].filter((el) => el.tabIndex === 0)

test("names: the page names both wheels and the button, and each wheel starts on its default", async () => {
  page = mountUI(ui)
  await settle()
  expect(wheel("Hour wheel").getAttribute("role")).toBe("listbox")
  expect(wheel("Minute wheel").getAttribute("role")).toBe("listbox")
  expect(wheel("Hour wheel").querySelectorAll("b14-option").length).toBe(24)
  expect(wheel("Minute wheel").querySelectorAll("b14-option").length).toBe(12)
  expect(page.root.querySelector("button")!.textContent).toBe("Set alarm")
  expect(stopOf("Hour wheel").map((el) => el.textContent)).toEqual(["06"])
  expect(stopOf("Minute wheel").map((el) => el.textContent)).toEqual(["00"])
  expect(status()).toBe("Time: 06:00.")
})

test("keyboard: on the page, arrow keys move each wheel, Tab goes from wheel to wheel to the button, and the status line reports the time", async () => {
  stopOf("Hour wheel")[0].focus()
  await keys("ArrowDown")
  expect(status()).toBe("Time: 07:00.")
  expect(document.activeElement).toBe(stopOf("Hour wheel")[0])
  expect(stopOf("Hour wheel")[0].textContent).toBe("07")
  await keys("Tab")
  expect(document.activeElement).toBe(stopOf("Minute wheel")[0])
  await keys("End")
  expect(status()).toBe("Time: 07:55.")
  await keys("Tab")
  expect(document.activeElement).toBe(page.root.querySelector("button"))
  await keys("Enter")
  expect(status()).toBe("Alarm set for 07:55.")
  await keys("Shift+Tab", "Home")
  expect(status()).toBe("Time: 07:00.")
})

test("agent: an agent picks 07:30 and sets the alarm, and a number that is not on the wheel is refused", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const hours = page.live().find((entry) => entry.label === "Hour wheel")!
  expect(hours.actions).toEqual(["pick"])
  expect(page.live().map((entry) => entry.label)).toEqual(expect.arrayContaining(["Hour wheel", "Minute wheel", "Set alarm"]))
  const found = JSON.stringify(await page.agent.query({ within: "Hour wheel" }))
  for (const hour of ["00", "07", "23"]) expect(found).toContain(hour)

  const refused = await page.agent.act({ steps: [{ ref: "Hour wheel", action: "pick", args: ["25"] }] })
  expect(refused.steps[0].result).toBe(false)
  expect(status()).toBe("Time: 07:00.")

  const result = await page.agent.act(ui.task!)
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Alarm set for 07:30.")
  expect(stopOf("Hour wheel")[0].textContent).toBe("07")
  expect(stopOf("Minute wheel")[0].textContent).toBe("30")
})
