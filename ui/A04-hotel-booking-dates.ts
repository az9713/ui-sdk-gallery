import "@ui-sdk/web/button"
import "@ui-sdk/web/calendar"
import "@ui-sdk/web/date-picker"
import { addMonths } from "@ui-sdk/core/date"
import type { UI } from "../src/ui"

const nav = `
  <div data-slot="row">
    <ui-calendar-previous><button type="button" data-variant="ghost"></button></ui-calendar-previous>
    <ui-calendar-heading></ui-calendar-heading>
    <ui-calendar-next><button type="button" data-variant="ghost"></button></ui-calendar-next>
  </div>`

const grid = (offset = 0) => `
  <ui-calendar-grid offset="${offset}">
    <ui-calendar-weekdays><template><ui-calendar-weekday></ui-calendar-weekday></template></ui-calendar-weekdays>
    <ui-calendar-weeks><template><ui-calendar-day></ui-calendar-day></template></ui-calendar-weeks>
  </ui-calendar-grid>`

const rules = `today="2026-11-23" min="2026-11-23" max="2027-03-31" min-days="2" max-days="15" default-value="2026-12-14,2026-12-18"`

const html = `
<ui-date-picker mode="range" aria-label="Stay dates" ${rules}>
  <div data-slot="row">
    <ui-date-picker-input><input aria-label="Check in" placeholder="Check in" /></ui-date-picker-input>
    <span data-slot="hint" aria-hidden="true">–</span>
    <ui-date-picker-input end><input aria-label="Check out" placeholder="Check out" /></ui-date-picker-input>
    <ui-date-picker-trigger><button type="button" data-variant="ghost"></button></ui-date-picker-trigger>
  </div>
  <ui-date-picker-content hidden>${nav}${grid()}</ui-date-picker-content>
</ui-date-picker>
<ui-calendar mode="range" aria-label="Stay calendar" months="2" month-format="short" default-month="2026-12" ${rules}>
  ${nav}
  <div data-slot="row">${grid(0)}${grid(1)}</div>
</ui-calendar>
<p data-summary></p>
<p data-note>Sold out: 2026-12-21 to 2026-12-22.</p>
<ui-button data-book><button>Book this stay</button></ui-button>
<p role="status" data-status>Nothing is booked.</p>`

const css = `
[data-stage] { display: grid; gap: 20px; max-width: 640px; justify-items: start; }
[data-stage] p { margin: 0; }
[data-stage] [data-note], [data-stage] [data-status] { color: var(--ui-muted-foreground); }
[data-stage] ui-calendar-day[data-unavailable] { opacity: 1; }
[data-stage] ui-date-picker { width: auto; }
[data-stage] ui-date-picker > [data-slot="row"] > [data-slot="hint"] { margin-inline: 8px; }
[data-stage] ui-date-picker-input { display: block; width: 10rem; }
[data-stage] [data-slot="row"]:has(> ui-calendar-previous) { display: contents; }
[data-stage] ui-calendar > [data-slot="row"]:last-child { display: flex; gap: 24px; align-items: flex-start; }
`

type Range = [string, string] | null

const soldOut = { from: "2026-12-21", to: "2026-12-22" }

const nights = (range: NonNullable<Range>) => {
  const count = (Date.parse(range[1]) - Date.parse(range[0])) / 86_400_000
  return `${count} night${count === 1 ? "" : "s"}`
}

const describe = (range: Range) => (range ? `${range[0]} to ${range[1]}, ${nights(range)}` : null)

function mount(root: HTMLElement) {
  root.innerHTML = html
  const picker = root.querySelector("ui-date-picker")!
  const calendar = root.querySelector("ui-calendar")!
  const summary = root.querySelector("[data-summary]")!
  const status = root.querySelector("[data-status]")!
  let stay: Range = ["2026-12-14", "2026-12-18"]

  picker.unavailable = [soldOut]
  calendar.unavailable = [soldOut]

  const show = () => {
    summary.textContent = stay ? `Your stay: ${describe(stay)}.` : "Choose a check-in and a check-out date."
  }
  const follow = (to: typeof picker | typeof calendar) => (e: CustomEvent<{ value: unknown }>) => {
    stay = e.detail.value as Range
    show()
    if (String(to.value) !== String(stay)) to.api.setValue(stay)
  }
  const showStart = () => {
    const first = calendar.month
    const month = stay?.[0].slice(0, 7)
    if (month && month !== first && month !== addMonths(`${first}-01`, 1).slice(0, 7)) calendar.api.setMonth(month)
  }
  picker.addEventListener("valuechange", (e) => {
    follow(calendar)(e)
    showStart()
  })
  calendar.addEventListener("valuechange", follow(picker))
  root.querySelector("[data-book]")!.addEventListener("action", () => {
    status.textContent = stay ? `Booked: ${describe(stay)}.` : "Choose your dates before you book."
  })
  show()
}

const ui: UI = {
  id: "A04",
  request: "Build a hotel booking form: a check-in and check-out date picker, a month calendar that shows the same stay, and a Book button.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Stay dates", action: "setValue", args: [["2026-12-28", "2027-01-02"]] },
      { ref: "Book this stay", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Booked: 2026-12-28 to 2027-01-02, 5 nights.",
  },
}

export default ui
