import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A24-meeting-planner"

const { root, agent, live } = mountUI(ui)
type Api<T> = HTMLElement & { value: T; api: { setValue(v: string): boolean; clear(): boolean } }
const dateInput = root.querySelector("ui-date-input") as Api<string | null>
const timeInput = root.querySelector("ui-time-input") as Api<string | null>
const select = root.querySelector("ui-select") as Api<string>
const seg = (unit: string) => root.querySelector<HTMLInputElement>(`input[data-type="${unit}"]`)!
const button = (text: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === text)!
const status = () => root.querySelector("[data-status]")!.textContent
const row = (zone: string) => {
  const li = root.querySelector(`[data-zone="${zone}"]`)!
  const text = (name: string) => li.querySelector(`[data-${name}]`)!.textContent
  return { when: text("when"), clock: text("clock"), shift: text("shift"), hours: li.getAttribute("data-hours") }
}
const ny = () => row("America/New_York")
const london = () => row("Europe/London")
const tokyo = () => row("Asia/Tokyo")

async function plan(date: string | null, time: string, locale = "en-US") {
  select.api.setValue(locale)
  if (date) dateInput.api.setValue(date)
  else dateInput.api.clear()
  timeInput.api.setValue(time)
  await settle()
}

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Meeting date", "Start time", "Label language", "Next day", "Send invite"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(root.querySelector("[data-zones]")!.getAttribute("aria-label")).toBe("Local times")
})

test("keyboard: the page has 8 tab stops in reading order, and the zone list takes none", () => {
  const stops = tabbable(root)
  expect(stops.map((el) => el.getAttribute("aria-label") ?? el.tagName.toLowerCase())).toEqual(["month", "day", "year", "hour", "minute", "button", "button", "button"])
  expect(stops.slice(5).map((el) => el.textContent)).toEqual([expect.any(String), "Next day", "Send invite"])
  expect(tabbable(root.querySelector("[data-zones]")!)).toEqual([])
})

test("keyboard: the first rows show the London meeting in 3 zones, with the day shift and the working hours", async () => {
  await plan("2026-12-02", "16:00")
  expect(ny()).toEqual({ when: "Wednesday, December 2, 2026", clock: "11:00", shift: "same day", hours: "working" })
  expect(london()).toEqual({ when: "Wednesday, December 2, 2026", clock: "16:00", shift: "same day", hours: "working" })
  expect(tokyo()).toEqual({ when: "Thursday, December 3, 2026", clock: "01:00", shift: "next day", hours: "outside" })
  expect([...root.querySelectorAll("[data-zones] [data-city]")].map((el) => el.textContent)).toEqual(["New York", "London", "Tokyo"])
})

test("keyboard: ArrowUp on the day steps the meeting date, and every row follows", async () => {
  await plan("2026-12-02", "16:00")
  seg("day").focus()
  await keys("ArrowUp")
  expect(dateInput.value).toBe("2026-12-03")
  expect(ny().when).toBe("Thursday, December 3, 2026")
  expect(tokyo().when).toBe("Friday, December 4, 2026")
  await keys("ArrowDown", "ArrowDown")
  expect(london().when).toBe("Tuesday, December 1, 2026")
})

test("keyboard: ArrowUp on the hour steps the start time, and Tokyo passes midnight at 15:00 in London", async () => {
  await plan("2026-12-02", "14:59")
  expect(tokyo()).toMatchObject({ clock: "23:59", shift: "same day" })
  seg("hour").focus()
  await keys("ArrowUp")
  expect(timeInput.value).toBe("15:59")
  expect(tokyo()).toMatchObject({ clock: "00:59", shift: "next day", when: "Thursday, December 3, 2026" })
  expect(ny().clock).toBe("10:59")
})

test("keyboard: New York is on the previous day before 05:00 in London", async () => {
  await plan("2026-12-15", "02:30")
  expect(ny()).toMatchObject({ when: "Monday, December 14, 2026", clock: "21:30", shift: "previous day" })
  expect(london()).toMatchObject({ clock: "02:30", shift: "same day" })
  expect(tokyo()).toMatchObject({ clock: "11:30", shift: "same day" })
  await plan("2026-12-15", "05:00")
  expect(ny()).toMatchObject({ clock: "00:00", shift: "same day" })
})

test("keyboard: the working hours include 08:00 and end before 18:00 in each zone", async () => {
  await plan("2026-12-02", "23:00")
  expect(tokyo()).toMatchObject({ clock: "08:00", hours: "working" })
  await plan("2026-12-02", "22:59")
  expect(tokyo()).toMatchObject({ clock: "07:59", hours: "outside" })
  await plan("2026-12-02", "08:59")
  expect(tokyo()).toMatchObject({ clock: "17:59", hours: "working" })
  await plan("2026-12-02", "09:00")
  expect(tokyo()).toMatchObject({ clock: "18:00", hours: "outside" })
  expect(ny()).toMatchObject({ clock: "04:00", hours: "outside" })
  expect(london().hours).toBe("working")
})

test("keyboard: New York follows its own daylight saving change, 2 weeks before London's", async () => {
  await plan("2026-12-02", "16:00")
  expect(ny().clock).toBe("11:00")
  await plan("2027-03-20", "16:00")
  expect(ny()).toMatchObject({ clock: "12:00", shift: "same day" })
  expect(tokyo()).toMatchObject({ clock: "01:00", shift: "next day", when: "Sunday, March 21, 2027" })
  await plan("2027-03-29", "16:00")
  expect(ny()).toMatchObject({ clock: "11:00" })
  expect(tokyo()).toMatchObject({ clock: "00:00", shift: "next day", when: "Tuesday, March 30, 2027" })
})

test("keyboard: Enter on Next day adds 1 day, across the end of a month and a year", async () => {
  await plan("2026-12-02", "16:00")
  button("Next day").focus()
  await keys("Enter")
  expect(dateInput.value).toBe("2026-12-03")
  expect(london().when).toBe("Thursday, December 3, 2026")
  await plan("2026-12-31", "16:00")
  await keys("Space")
  expect(dateInput.value).toBe("2027-01-01")
  expect(london().when).toBe("Friday, January 1, 2027")
  expect(tokyo().when).toBe("Saturday, January 2, 2027")
})

test("keyboard: Enter on Send invite reports each zone in the status line", async () => {
  await plan("2026-12-02", "16:00")
  expect(status()).toBe("No invite is sent.")
  button("Send invite").focus()
  await keys("Enter")
  expect(status()).toBe("Invite sent: New York 2026-12-02 11:00, London 2026-12-02 16:00, Tokyo 2026-12-03 01:00.")
})

test("keyboard: an erased date empties the rows, and Send invite and Next day wait for a date", async () => {
  await plan(null, "16:00")
  expect(root.querySelectorAll("[data-zone]")).toHaveLength(0)
  expect(root.querySelector("[data-none]")!.textContent).toBe("Enter a date and a start time.")
  button("Send invite").focus()
  await keys("Enter")
  expect(status()).toBe("Enter a date and a start time first.")
  button("Next day").focus()
  await keys("Enter")
  expect(dateInput.value).toBeNull()
  await plan("2026-12-02", "16:00")
  expect(root.querySelectorAll("[data-zone]")).toHaveLength(3)
})

test("keyboard: the label language changes the date labels and leaves the clocks alone", async () => {
  await plan("2026-12-15", "16:00", "de-DE")
  expect(ny().when).toBe("Dienstag, 15. Dezember 2026")
  expect(tokyo().when).toBe("Mittwoch, 16. Dezember 2026")
  await plan("2026-12-15", "16:00", "ja-JP")
  expect(ny().when).toContain("2026年12月15日")
  expect(tokyo().when).toContain("2026年12月16日")
  expect([ny().clock, london().clock, tokyo().clock]).toEqual(["11:00", "16:00", "01:00"])
  await plan("2026-12-15", "16:00")
  expect(ny().when).toBe("Tuesday, December 15, 2026")
})

test("keyboard: Enter on the language list opens it, ArrowDown and Enter choose Deutsch", async () => {
  await plan("2026-12-15", "16:00")
  const trigger = root.querySelector<HTMLElement>("ui-select-trigger button")!
  trigger.focus()
  await keys("Enter", "ArrowDown", "Enter")
  expect(select.value).toBe("de-DE")
  expect(ny().when).toBe("Dienstag, 15. Dezember 2026")
  await plan("2026-12-15", "16:00")
})

test("agent: an agent sets the date, the time and the language, and Send invite reports the 3 zones", async () => {
  await plan("2026-12-02", "16:00")
  const result = await agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(dateInput.value).toBe("2026-12-15")
  expect(timeInput.value).toBe("02:30")
  expect(select.value).toBe("de-DE")
  expect(ny()).toMatchObject({ when: "Montag, 14. Dezember 2026", clock: "21:30", shift: "previous day" })
  expect(status()).toBe("Invite sent: New York 2026-12-14 21:30, London 2026-12-15 02:30, Tokyo 2026-12-15 11:30.")
  expect(ui.task!.done(root)).toBe(true)
})

test("agent: the Next day button moves a date that the agent set, across a year end", async () => {
  await plan("2026-12-02", "16:00")
  const result = await agent.act({
    steps: [
      { ref: "Meeting date", action: "setValue", args: ["2026-12-31"] },
      { ref: "Next day", action: "press" },
      { ref: "Send invite", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(dateInput.value).toBe("2027-01-01")
  expect(status()).toBe("Invite sent: New York 2027-01-01 11:00, London 2027-01-01 16:00, Tokyo 2027-01-02 01:00.")
})
