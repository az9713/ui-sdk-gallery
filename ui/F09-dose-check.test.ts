import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui, { doseCheck } from "./F09-dose-check"

const markup = `<root aria-label="Safety check"><error></error><fix></fix></root>`
const setup = () => {
  const sent: string[] = []
  const view = mount(doseCheck, { min: 25, max: 90, unit: "mg/kg/day", input: () => ({ setValue: (v: string) => sent.push(v) }) }, markup)
  return { view, sent }
}
const shown = (el: Element | null | undefined) => !!el && el.isConnected && !(el as HTMLElement).hidden

test("keyboard: above the maximum, Enter on the fix button sets the maximum and clears the error", async () => {
  const { view, sent } = setup()
  try {
    view.api.check(120)
    await view.settle()
    expect(view.state.errors).toEqual(["120 mg/kg/day is above the maximum, 90 mg/kg/day."])
    const fix = view.part("fix")!
    expect(shown(view.part("error"))).toBe(true)
    expect(view.part("error")!.textContent).toBe("120 mg/kg/day is above the maximum, 90 mg/kg/day.")
    expect(view.root.hasAttribute("data-invalid")).toBe(true)
    expect(fix.textContent).toBe("Use 90 mg/kg/day")
    await view.keys("Tab")
    expect(document.activeElement).toBe(fix)
    await view.keys("Enter")
    expect(sent).toEqual(["90"])
    expect(view.state.errors).toEqual([])
    expect(view.root.hasAttribute("data-invalid")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: below the minimum, Space on the fix button sets the minimum", async () => {
  const { view, sent } = setup()
  try {
    view.api.check(10)
    await view.settle()
    expect(view.state.errors).toEqual(["10 mg/kg/day is below the minimum, 25 mg/kg/day."])
    expect(view.part("fix")!.textContent).toBe("Use 25 mg/kg/day")
    await view.keys("Tab", "Space")
    expect(sent).toEqual(["25"])
    expect(view.state.errors).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: a dose in range has no error part and no fix button to Tab to", async () => {
  const { view } = setup()
  try {
    view.api.check(45)
    await view.settle()
    expect(view.state.errors).toEqual([])
    expect(shown(view.part("error"))).toBe(false)
    expect(shown(view.part("fix"))).toBe(false)
    expect(tabbable(view.root).length).toBe(0)
  } finally {
    view.unmount()
  }
})

test("keyboard: text that is not a number is an error with no fix, and an empty dose is not an error", async () => {
  const { view } = setup()
  try {
    view.api.check(Number("12a"))
    await view.settle()
    expect(view.state.errors).toEqual(["Write the dose as a number."])
    expect(shown(view.part("error"))).toBe(true)
    expect(shown(view.part("fix"))).toBe(false)
    view.api.check(null)
    await view.settle()
    expect(view.state.errors).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: useLimit with no error throws and sends nothing", () => {
  const { view, sent } = setup()
  try {
    expect(() => view.api.useLimit()).toThrow("The dose has no error, so there is no limit to use.")
    expect(sent).toEqual([])
  } finally {
    view.unmount()
  }
})

test("server: the safety check renders with no DOM", () => {
  checkServer(doseCheck, { min: 25, max: 90, unit: "mg/kg/day" }, markup)
})

// The check has no arrow keys, so checkDirection has nothing to compare: the same keys must do the same in both directions.
test("direction: Tab and Enter on the fix button do the same in left to right and right to left", async () => {
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const { view, sent } = setup()
    try {
      view.api.check(150)
      await view.settle()
      await view.keys("Tab", "Enter")
      expect(sent, dir).toEqual(["90"])
      expect(view.state.errors, dir).toEqual([])
    } finally {
      view.unmount()
    }
  }
  document.documentElement.dir = ""
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const dose = () => page.root.querySelector<HTMLInputElement>("#f09-dose")!
const field = () => page.root.querySelector<HTMLElement & { api: { check: (v: number | null) => string[] } }>("f09-dose-check")!
const doseApi = () => dose().closest<HTMLElement & { api: { setValue: (v: string) => void } }>("ui-input")!.api

test("names: the page names both inputs, the safety check and the button", async () => {
  page = mountUI(ui)
  await settle()
  expect(page.root.querySelector("f09-dose-check")!.getAttribute("aria-label")).toBe("Safety check")
  expect(page.root.querySelector("f09-dose-check")!.getAttribute("role")).toBe("group")
  expect(page.root.querySelector("[data-calc] button")!.textContent).toBe("Calculate")
  const labels = page.live().map((entry) => entry.label)
  expect(labels).toEqual(expect.arrayContaining(["Patient weight (kg)", "Daily dose (mg/kg)", "Calculate"]))
  expect(page.root.querySelector("[data-value]")!.textContent).toBe("45")
})

test("keyboard: on the page, the dose input is invalid and described by the error while it is out of range", async () => {
  doseApi().setValue("120")
  await settle()
  expect(dose().getAttribute("aria-invalid")).toBe("true")
  const error = page.root.querySelector("f09-dose-error")!
  expect(dose().getAttribute("aria-describedby")).toBe(error.id)
  expect(error.textContent).toBe("120 mg/kg/day is above the maximum, 90 mg/kg/day.")
  expect(page.root.querySelector(".f09-gauge")!.getAttribute("data-zone")).toBe("over")
  page.root.querySelector<HTMLElement>("[data-calc] button")!.focus()
  await keys("Enter")
  expect(status()).toBe("Not calculated. 120 mg/kg/day is above the maximum, 90 mg/kg/day.")
  const stops = tabbable(page.root)
  expect(stops.map((el) => el.textContent || el.id)).toEqual(["f09-weight", "f09-dose", "Use 90 mg/kg/day", "Calculate"])
  page.root.querySelector<HTMLElement>("f09-dose-fix button")!.focus()
  await keys("Enter")
  expect(dose().value).toBe("90")
  expect(dose().hasAttribute("aria-invalid")).toBe(false)
  expect(dose().hasAttribute("aria-describedby")).toBe(false)
  expect(tabbable(page.root).length).toBe(3)
  page.root.querySelector<HTMLElement>("[data-calc] button")!.focus()
  await keys("Space")
  expect(status()).toBe("1,620 mg a day: 810 mg (16.2 mL) every 12 hours.")
})

test("agent: the safety check is in the snapshot only while the dose has an error", async () => {
  doseApi().setValue("45")
  await settle()
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  expect(page.live().some((entry) => entry.component === "dose-check")).toBe(false)
  const missing = await page.agent.act({ steps: [{ ref: "Safety check", action: "useLimit" }] })
  expect(missing.ok).toBe(false)

  const set = await page.agent.act({ steps: [{ ref: "Daily dose", action: "setValue", args: ["200"] }] })
  expect(set.ok, set.error?.message).toBe(true)
  const entry = page.live().find((e) => e.component === "dose-check")!
  expect(entry).toMatchObject({ label: "Safety check", actions: ["useLimit"] })
  expect(JSON.stringify(entry)).toContain("200 mg/kg/day is above the maximum, 90 mg/kg/day.")

  const fixed = await page.agent.act({ steps: [{ ref: "Safety check", action: "useLimit" }] })
  expect(fixed.ok, fixed.error?.message).toBe(true)
  expect(dose().value).toBe("90")
  expect(page.live().some((e) => e.component === "dose-check")).toBe(false)

  // While the check is shown, "Daily dose" still names only the input, and a dose in range removes the check.
  await page.agent.act({ steps: [{ ref: "Daily dose", action: "setValue", args: ["10"] }] })
  expect(page.live().some((e) => e.component === "dose-check")).toBe(true)
  const typed = await page.agent.act({ steps: [{ ref: "Daily dose", action: "setValue", args: ["60"] }] })
  expect(typed.ok, typed.error?.message).toBe(true)
  expect(page.live().some((e) => e.component === "dose-check")).toBe(false)
  expect(status()).toBe("Press Calculate for the amount in each dose.")
})

test("agent: the task sets a dose above the maximum, uses the limit through the shown check, and calculates", async () => {
  doseApi().setValue("45")
  await settle()
  await page.agent.act({ steps: [{ ref: "Calculate", action: "press" }] })
  expect(status()).toBe("810 mg a day: 405 mg (8.1 mL) every 12 hours.")
  expect(ui.task!.done(page.root)).toBe(false)
  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(ui.task!.done(page.root)).toBe(true)
  expect(field().api.check(91)).toEqual(["91 mg/kg/day is above the maximum, 90 mg/kg/day."])
})
