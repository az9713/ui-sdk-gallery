import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A04-hotel-booking-dates"

const { root, agent, live } = mountUI(ui)
const picker = root.querySelector("ui-date-picker")!
const calendar = root.querySelector("ui-calendar")!
const popup = root.querySelector<HTMLElement>("ui-date-picker-content")!
const trigger = root.querySelector<HTMLElement>("ui-date-picker-trigger button")!
const book = root.querySelector<HTMLElement>("[data-book] button")!
const [checkIn, checkOut] = [...root.querySelectorAll("input")]
const summary = () => root.querySelector("[data-summary]")!.textContent
const status = () => root.querySelector("[data-status]")!.textContent
const day = (date: string) => root.querySelector<HTMLElement>(`ui-calendar ui-calendar-day[value="${date}"]`)!
const focused = () => (document.activeElement as HTMLElement | null)?.getAttribute("value")
const fields = () => [checkIn.value, checkOut.value]
const marked = () => [...root.querySelectorAll("ui-calendar ui-calendar-day[data-selected]")].map((el) => el.getAttribute("value"))

async function stay(range: [string, string] | null) {
  picker.api.setOpen(false)
  if (range) picker.api.setValue(range)
  else picker.api.clear()
  calendar.api.setMonth("2026-12")
  await settle()
}

async function type(input: HTMLInputElement, text: string) {
  input.focus()
  input.value = text
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await keys("Enter")
}

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Stay dates", "Stay calendar", "Book this stay"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect([checkIn.getAttribute("aria-label"), checkOut.getAttribute("aria-label")]).toEqual(["Check in", "Check out"])
  expect(trigger.getAttribute("aria-label")).toBe("Choose dates, Monday, December 14, 2026 to Friday, December 18, 2026")
  expect(root.querySelector("ui-calendar ui-calendar-previous button")!.getAttribute("aria-label")).toBe("Previous month")
  expect(root.querySelector("ui-calendar ui-calendar-next button")!.getAttribute("aria-label")).toBe("Next month")
  expect(book.getAttribute("aria-disabled")).toBeNull()
  expect(fields()).toEqual(["12/14/2026", "12/18/2026"])
  expect(summary()).toBe("Your stay: 2026-12-14 to 2026-12-18, 4 nights.")
})

test("keyboard: the month grid is 1 tab stop on the check-in day, across both months", async () => {
  const stops = [...root.querySelectorAll("ui-calendar ui-calendar-day")].filter((el) => el.getAttribute("tabindex") === "0")
  expect(stops.map((el) => el.getAttribute("value"))).toEqual(["2026-12-14"])
  expect(tabbable(calendar).map((el) => el.getAttribute("aria-label") ?? el.getAttribute("value"))).toEqual(["Previous month", "Next month", "Monday, December 14, 2026"])
  expect(marked()).toEqual(["2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18"])
})

test("keyboard: arrows move by day and week, and Enter twice picks a stay that the fields follow", async () => {
  await stay(["2026-12-14", "2026-12-18"])
  day("2026-12-10").focus()
  await keys("ArrowRight")
  expect(focused()).toBe("2026-12-11")
  await keys("ArrowLeft")
  expect(focused()).toBe("2026-12-10")
  await keys("ArrowDown")
  expect(focused()).toBe("2026-12-17")
  await keys("ArrowUp")
  expect(focused()).toBe("2026-12-10")
  await keys("Enter", "ArrowDown", "Enter")
  expect(picker.value).toEqual(["2026-12-10", "2026-12-17"])
  expect(calendar.value).toEqual(["2026-12-10", "2026-12-17"])
  expect(fields()).toEqual(["12/10/2026", "12/17/2026"])
  expect(summary()).toBe("Your stay: 2026-12-10 to 2026-12-17, 7 nights.")
  expect(marked()).toHaveLength(8)
  expect(day("2026-12-10").getAttribute("aria-selected")).toBe("true")
})

test("keyboard: Page Down moves to the next month and Space picks a day", async () => {
  await stay(["2026-12-14", "2026-12-18"])
  day("2026-12-10").focus()
  await keys("PageDown")
  expect(focused()).toBe("2027-01-10")
  await keys("Space", "ArrowRight", "ArrowRight", "Space")
  expect(picker.value).toEqual(["2027-01-10", "2027-01-12"])
  expect(fields()).toEqual(["01/10/2027", "01/12/2027"])
})

test("keyboard: a sold-out night takes focus but cannot be picked", async () => {
  await stay(["2026-12-14", "2026-12-18"])
  const sold = day("2026-12-21")
  expect(sold.hasAttribute("data-unavailable")).toBe(true)
  expect(sold.getAttribute("aria-disabled")).toBe("true")
  sold.focus()
  expect(focused()).toBe("2026-12-21")
  await keys("Enter")
  expect(picker.value).toEqual(["2026-12-14", "2026-12-18"])
  expect(marked()).toHaveLength(5)
  expect(day("2026-12-20").hasAttribute("data-unavailable")).toBe(false)
  expect(day("2026-12-20").getAttribute("aria-disabled")).toBeNull()
})

test("keyboard: Escape drops a start with no end, and the same day twice does not make a stay of 0 nights", async () => {
  await stay(["2026-12-14", "2026-12-18"])
  day("2026-12-10").focus()
  await keys("Enter")
  expect(marked()).toEqual(["2026-12-10"])
  await keys("Escape")
  expect(marked()).toHaveLength(5)
  await keys("Enter", "Enter")
  expect(marked()).toEqual(["2026-12-10"])
  expect(picker.value).toEqual(["2026-12-14", "2026-12-18"])
  expect(summary()).toBe("Your stay: 2026-12-14 to 2026-12-18, 4 nights.")
  await keys("Escape")
})

test("keyboard: Enter on the trigger opens the calendar, 2 picks close it, and focus returns to the trigger", async () => {
  await stay(["2026-12-14", "2026-12-18"])
  trigger.focus()
  await keys("Enter")
  expect(popup.hasAttribute("hidden")).toBe(false)
  expect(trigger.getAttribute("aria-expanded")).toBe("true")
  expect(focused()).toBe("2026-12-14")
  await keys("ArrowRight", "Enter")
  expect(popup.hasAttribute("hidden")).toBe(false)
  await keys("ArrowRight", "ArrowRight", "Enter")
  expect(popup.hasAttribute("hidden")).toBe(true)
  expect(document.activeElement).toBe(trigger)
  expect(picker.value).toEqual(["2026-12-15", "2026-12-17"])
  expect(fields()).toEqual(["12/15/2026", "12/17/2026"])
  expect(calendar.value).toEqual(["2026-12-15", "2026-12-17"])
  expect(trigger.getAttribute("aria-label")).toBe("Choose dates, Tuesday, December 15, 2026 to Thursday, December 17, 2026")
})

test("keyboard: Alt+Down in Check in opens the calendar, and Escape closes it and keeps the stay", async () => {
  await stay(["2026-12-14", "2026-12-18"])
  checkIn.focus()
  checkIn.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true }))
  await settle()
  expect(popup.hasAttribute("hidden")).toBe(false)
  await keys("Escape")
  expect(popup.hasAttribute("hidden")).toBe(true)
  expect(document.activeElement).toBe(checkIn)
  expect(picker.value).toEqual(["2026-12-14", "2026-12-18"])
})

test("keyboard: a check-in after the check-out is invalid and keeps the stay, and a valid date clears it", async () => {
  await stay(["2026-12-14", "2026-12-18"])
  await type(checkIn, "12/24/2026")
  expect(checkIn.getAttribute("aria-invalid")).toBe("true")
  expect(picker.value).toEqual(["2026-12-14", "2026-12-18"])
  expect(summary()).toBe("Your stay: 2026-12-14 to 2026-12-18, 4 nights.")
  await type(checkOut, "12/28/2026")
  expect(checkIn.getAttribute("aria-invalid")).toBeNull()
  expect(picker.value).toEqual(["2026-12-24", "2026-12-28"])
  expect(marked()).toHaveLength(5)
})

test("keyboard: a typed stay over a sold-out night, or past the last bookable day, is invalid", async () => {
  await stay(["2026-12-14", "2026-12-18"])
  await type(checkOut, "12/23/2026")
  expect(checkOut.getAttribute("aria-invalid")).toBe("true")
  expect(picker.value).toEqual(["2026-12-14", "2026-12-18"])
  await type(checkOut, "04/02/2027")
  expect(checkOut.getAttribute("aria-invalid")).toBe("true")
  expect(picker.value).toEqual(["2026-12-14", "2026-12-18"])
  await type(checkOut, "12/19/2026")
  expect(checkOut.getAttribute("aria-invalid")).toBeNull()
  expect(picker.value).toEqual(["2026-12-14", "2026-12-19"])
})

test("keyboard: Enter on Book reports the stay in the status line, in the singular for 1 night", async () => {
  await stay(["2026-12-14", "2026-12-15"])
  book.focus()
  await keys("Enter")
  expect(status()).toBe("Booked: 2026-12-14 to 2026-12-15, 1 night.")
  await stay(null)
  expect(fields()).toEqual(["", ""])
  expect(summary()).toBe("Choose a check-in and a check-out date.")
  await keys("Space")
  expect(status()).toBe("Choose your dates before you book.")
})

test("agent: an agent sets the stay on the picker, the calendar and the fields follow, and Book reports it", async () => {
  await stay(["2026-12-14", "2026-12-18"])
  const result = await agent.act({
    steps: [
      { ref: "Stay dates", action: "setValue", args: [["2026-12-28", "2027-01-02"]] },
      { ref: "Book this stay", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(picker.value).toEqual(["2026-12-28", "2027-01-02"])
  expect(calendar.value).toEqual(["2026-12-28", "2027-01-02"])
  expect(fields()).toEqual(["12/28/2026", "01/02/2027"])
  expect(marked()).toHaveLength(6)
  expect(status()).toBe("Booked: 2026-12-28 to 2027-01-02, 5 nights.")
})

test("agent: a stay in a month that the calendar does not show turns the calendar to it, and a stay it shows does not", async () => {
  await stay(["2026-12-14", "2026-12-18"])
  const result = await agent.act({ steps: [{ ref: "Stay dates", action: "setValue", args: [["2027-02-10", "2027-02-14"]] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(calendar.month).toBe("2027-02")
  expect(marked()).toEqual(["2027-02-10", "2027-02-11", "2027-02-12", "2027-02-13", "2027-02-14"])
  await agent.act({ steps: [{ ref: "Stay dates", action: "setValue", args: [["2027-03-02", "2027-03-04"]] }] })
  expect(calendar.month).toBe("2027-02")
  expect(marked()).toEqual(["2027-03-02", "2027-03-03", "2027-03-04"])
})

test("agent: an agent sets the stay on the calendar, and the picker follows", async () => {
  await stay(["2026-12-14", "2026-12-18"])
  const result = await agent.act({ steps: [{ ref: "Stay calendar", action: "setValue", args: [["2027-01-05", "2027-01-08"]] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(picker.value).toEqual(["2027-01-05", "2027-01-08"])
  expect(fields()).toEqual(["01/05/2027", "01/08/2027"])
  expect(summary()).toBe("Your stay: 2027-01-05 to 2027-01-08, 3 nights.")
})

test("agent: a stay over a sold-out night, past the last day, or over 15 days changes nothing", async () => {
  await stay(["2026-12-14", "2026-12-18"])
  for (const range of [
    ["2026-12-20", "2026-12-23"],
    ["2027-03-30", "2027-04-02"],
    ["2026-12-23", "2027-01-15"],
  ]) {
    const result = await agent.act({ steps: [{ ref: "Stay dates", action: "setValue", args: [range] }] })
    expect(result.steps[0]?.result, range.join(" ")).toBe(false)
    expect(picker.value, range.join(" ")).toEqual(["2026-12-14", "2026-12-18"])
  }
  expect(fields()).toEqual(["12/14/2026", "12/18/2026"])
})

test("agent: an agent turns the calendar to another month, and clears the stay", async () => {
  await stay(["2026-12-14", "2026-12-18"])
  const result = await agent.act({
    steps: [
      { ref: "Stay calendar", action: "setMonth", args: ["2027-02"] },
      { ref: "Stay dates", action: "clear" },
      { ref: "Book this stay", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(day("2027-02-10")).not.toBeNull()
  expect(root.querySelector("ui-calendar ui-calendar-heading")!.textContent).toContain("Feb")
  expect(picker.value).toBeNull()
  expect(calendar.value).toBeNull()
  expect(fields()).toEqual(["", ""])
  expect(status()).toBe("Choose your dates before you book.")
})
