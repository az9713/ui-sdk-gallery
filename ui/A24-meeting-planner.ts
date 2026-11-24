import "@ui-sdk/web/button"
import "@ui-sdk/web/date-input"
import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import "@ui-sdk/web/time-input"
import { addDays, dateParts, daysBetween, formatDate, isISODate } from "@ui-sdk/core/date"
import type { UI } from "../src/ui"

const start = { date: "2026-12-02", time: "16:00", locale: "en-US" }

const html = `
<ui-field>
  <ui-field-label>Meeting date</ui-field-label>
  <ui-date-input locale="en-US" default-value="${start.date}"></ui-date-input>
  <ui-field-description>London date.</ui-field-description>
</ui-field>
<ui-field>
  <ui-field-label>Start time</ui-field-label>
  <ui-time-input locale="en-US" hour-cycle="24" default-value="${start.time}"></ui-time-input>
  <ui-field-description>London time, 24-hour clock.</ui-field-description>
</ui-field>
<ui-field>
  <ui-field-label>Label language</ui-field-label>
  <ui-select default-value="${start.locale}">
    <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
    <ui-select-content>
      <ui-select-item value="en-US">English</ui-select-item>
      <ui-select-item value="de-DE">Deutsch</ui-select-item>
      <ui-select-item value="ja-JP">日本語</ui-select-item>
    </ui-select-content>
  </ui-select>
</ui-field>
<ui-button data-next><button>Next day</button></ui-button>
<h2 data-heading>Local times</h2>
<ul data-zones aria-label="Local times"></ul>
<ui-button data-send><button>Send invite</button></ui-button>
<p role="status" data-status>No invite is sent.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 560px; justify-items: start; }
[data-stage] ui-field { width: 100%; }
[data-stage] ui-select { display: block; }
[data-stage] h2 { margin: 0; font-size: 1.125rem; }
[data-stage] [data-zones] { list-style: none; margin: 0; padding: 0; width: 100%; display: grid; gap: 8px; }
[data-stage] [data-zones] li { display: grid; grid-template-columns: 6rem 1fr auto; gap: 4px 12px; align-items: baseline; padding: 10px 12px; border: 1px solid var(--ui-border); border-radius: 8px; }
[data-stage] [data-zones] li[data-hours="outside"] { border-style: dashed; }
[data-stage] [data-zones] [data-city] { font-weight: 600; }
[data-stage] [data-zones] [data-clock] { font-variant-numeric: tabular-nums; font-weight: 600; }
[data-stage] [data-zones] [data-shift], [data-stage] [data-zones] [data-note] { grid-column: 2 / -1; color: var(--ui-muted-foreground); }
[data-stage] [data-zones] [data-none] { display: block; }
[data-stage] p { margin: 0; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

const zones = [
  { city: "New York", zone: "America/New_York" },
  { city: "London", zone: "Europe/London" },
  { city: "Tokyo", zone: "Asia/Tokyo" },
]

const base = "Europe/London"
const opens = "08:00"
const closes = "18:00"

const clock = (ms: number, zone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(ms)
      .map((part) => [part.type, part.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    wall: Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute),
  }
}

// Intl only converts an instant to a wall time, so the offset is found twice to settle a daylight saving change.
const instant = (date: string, time: string, zone: string) => {
  const { year, month, day } = dateParts(date)!
  const [hour, minute] = time.split(":").map(Number)
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const first = guess - (clock(guess, zone).wall - guess)
  return guess - (clock(first, zone).wall - first)
}

const plan = (date: string, time: string) => {
  const at = instant(date, time, base)
  return zones.map((place) => {
    const local = clock(at, place.zone)
    return { ...place, date: local.date, time: local.time, shift: daysBetween(date, local.date), working: local.time >= opens && local.time < closes }
  })
}

const shiftText = (days: number) => (days === 0 ? "same day" : days === 1 ? "next day" : days === -1 ? "previous day" : `${days} days`)

type Meeting = { date: string | null; time: string | null; locale: string }
type Input = HTMLElement & { api: { setValue(value: string): boolean } }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const dateInput = root.querySelector("ui-date-input") as Input
  const timeInput = root.querySelector("ui-time-input") as Input
  const list = root.querySelector("[data-zones]")!
  const status = root.querySelector("[data-status]")!
  const meeting: Meeting = { ...start }

  const ready = () => !!meeting.date && !!meeting.time && isISODate(meeting.date)

  const show = () => {
    if (!ready()) {
      list.innerHTML = `<li data-none>Enter a date and a start time.</li>`
      return
    }
    list.innerHTML = plan(meeting.date!, meeting.time!)
      .map(
        (row) => `
      <li data-zone="${row.zone}" data-hours="${row.working ? "working" : "outside"}">
        <span data-city>${row.city}</span>
        <span data-when>${formatDate(row.date, meeting.locale)}</span>
        <span data-clock>${row.time}</span>
        <span data-shift>${shiftText(row.shift)}</span>
        <span data-note>${row.working ? "Within working hours" : "Outside working hours"}, ${opens} to ${closes}.</span>
      </li>`,
      )
      .join("")
  }

  const follow = (key: "date" | "time") => (e: Event) => {
    meeting[key] = (e as CustomEvent).detail.value
    show()
  }
  dateInput.addEventListener("valuechange", follow("date"))
  timeInput.addEventListener("valuechange", follow("time"))
  root.querySelector("ui-select")!.addEventListener("valuechange", (e) => {
    meeting.locale = (e as CustomEvent).detail.value
    show()
  })
  root.querySelector("[data-next]")!.addEventListener("action", () => {
    if (meeting.date && isISODate(meeting.date)) dateInput.api.setValue(addDays(meeting.date, 1))
    else status.textContent = "Enter a date and a start time first."
  })
  root.querySelector("[data-send]")!.addEventListener("action", () => {
    if (!ready()) {
      status.textContent = "Enter a date and a start time first."
      return
    }
    const rows = plan(meeting.date!, meeting.time!).map((row) => `${row.city} ${row.date} ${row.time}`)
    status.textContent = `Invite sent: ${rows.join(", ")}.`
  })
  show()
}

const ui: UI = {
  id: "A24",
  request:
    "Build a meeting planner for 3 time zones: a London meeting date and start time, the local date and time in New York, London and Tokyo with a day shift and a working-hours note, a label language, and a Send invite button.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Meeting date", action: "setValue", args: ["2026-12-15"] },
      { ref: "Start time", action: "setValue", args: ["02:30"] },
      { ref: "Label language", action: "setValue", args: ["Deutsch"] },
      { ref: "Send invite", action: "press" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Invite sent: New York 2026-12-14 21:30, London 2026-12-15 02:30, Tokyo 2026-12-15 11:30." &&
      root.querySelector('[data-zone="America/New_York"] [data-when]')!.textContent === "Montag, 14. Dezember 2026",
  },
}

export default ui
