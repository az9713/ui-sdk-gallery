import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A05-clinic-appointment"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const seg = (unit: string) => root.querySelector<HTMLInputElement>(`input[data-type="${unit}"]`)!
const dateInput = () => root.querySelector("ui-date-input") as HTMLElement & { value: string | null; api: { setValue(v: string): boolean } }
const timeInput = () => root.querySelector("ui-time-input") as HTMLElement & { value: string | null; api: { setValue(v: string): boolean } }
const notes = () => root.querySelector("textarea")!
const book = () => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Book appointment")!
const type = (el: HTMLInputElement | HTMLTextAreaElement, text: string) => {
  el.value = text
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }))
}

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Visit date", "Visit time", "Visit notes", "Book appointment"]) expect(labels).toContain(label)
})

test("keyboard: the date is 3 spinbuttons, and ArrowUp and ArrowDown step the day", async () => {
  await settle()
  expect([...root.querySelectorAll("ui-date-input input")].map((i) => i.getAttribute("role"))).toEqual(["spinbutton", "spinbutton", "spinbutton"])
  seg("day").focus()
  await keys("ArrowUp")
  expect(seg("day").value).toBe("03")
  await keys("ArrowDown", "ArrowDown")
  expect(seg("day").value).toBe("01")
  expect(dateInput().value).toBe("2026-12-01")
})

test("keyboard: Tab moves through the month, day and year, then to the time", async () => {
  seg("month").focus()
  await keys("Tab")
  expect(document.activeElement).toBe(seg("day"))
  await keys("Tab")
  expect(document.activeElement).toBe(seg("year"))
  await keys("Tab")
  expect(document.activeElement).toBe(seg("hour"))
  await keys("Shift+Tab")
  expect(document.activeElement).toBe(seg("year"))
})

test("keyboard: the page has 7 tab stops, in reading order", () => {
  const stops = tabbable(root)
  expect(stops.map((el) => el.getAttribute("aria-label") ?? el.tagName.toLowerCase())).toEqual([
    "month",
    "day",
    "year",
    "hour",
    "minute",
    "textarea",
    "button",
  ])
})

test("keyboard: a day past the end of a month is moved back, and a weekend date is invalid", async () => {
  dateInput().value = "2026-01-31"
  await settle()
  seg("month").focus()
  await keys("ArrowUp")
  expect(dateInput().value).toBe("2026-02-28")
  dateInput().value = "2026-12-05"
  await settle()
  expect(dateInput().hasAttribute("data-invalid")).toBe(true)
  dateInput().value = "2026-12-07"
  await settle()
  expect(dateInput().hasAttribute("data-invalid")).toBe(false)
})

test("keyboard: ArrowUp steps the hour and minute, and the hour wraps from 23 to 0", async () => {
  timeInput().value = "23:59"
  await settle()
  seg("hour").focus()
  await keys("ArrowUp")
  expect(seg("hour").value).toBe("00")
  seg("minute").focus()
  await keys("ArrowUp")
  expect(seg("minute").value).toBe("00")
  await keys("ArrowDown")
  expect(seg("minute").value).toBe("59")
})

test("keyboard: Enter in the notes field is left to add a line, and does not book", async () => {
  const field = notes()
  field.focus()
  type(field, "Cough")
  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
  field.dispatchEvent(enter)
  await settle()
  expect(enter.defaultPrevented).toBe(false)
  expect(status()).toBe("No appointment is booked.")
})

test("keyboard: Enter on Book appointment reports the visit", async () => {
  dateInput().api.setValue("2026-12-08")
  timeInput().api.setValue("10:15")
  type(notes(), "Check-up")
  await settle()
  book().focus()
  await keys("Enter")
  expect(status()).toBe("Booked: 2026-12-08 at 10:15, notes: Check-up.")
})

test("keyboard: Book appointment refuses a weekend date", async () => {
  dateInput().api.setValue("2026-12-12")
  await settle()
  book().focus()
  await keys("Enter")
  expect(status()).toBe("Enter a valid weekday and a time first.")
})

test("agent: an agent sets the date, the time and the notes, and the page reports them", async () => {
  const result = await agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(seg("day").value).toBe("15")
  expect(seg("hour").value).toBe("14")
  expect(seg("minute").value).toBe("45")
  expect(notes().value).toBe("Sore throat")
  expect(status()).toBe("Booked: 2026-12-15 at 14:45, notes: Sore throat.")
  expect(ui.task!.done(root)).toBe(true)
})
