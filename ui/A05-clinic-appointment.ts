import "@ui-sdk/web/button"
import "@ui-sdk/web/date-input"
import "@ui-sdk/web/field"
import "@ui-sdk/web/textarea"
import "@ui-sdk/web/time-input"
import type { UI } from "../src/ui"

const html = `
<ui-field>
  <ui-field-label>Visit date</ui-field-label>
  <ui-date-input name="date" locale="en-US" min="2026-11-23" max="2027-03-31" default-value="2026-12-02"></ui-date-input>
  <ui-field-description>Weekdays only.</ui-field-description>
</ui-field>
<ui-field>
  <ui-field-label>Visit time</ui-field-label>
  <ui-time-input name="time" locale="en-US" hour-cycle="24" default-value="09:30"></ui-time-input>
</ui-field>
<ui-field>
  <ui-field-label>Visit notes</ui-field-label>
  <ui-textarea auto-resize><textarea rows="3" placeholder="Symptoms, questions, allergies"></textarea></ui-textarea>
</ui-field>
<ui-button data-book><button>Book appointment</button></ui-button>
<p role="status" data-status>No appointment is booked.</p>`

const css = `
[data-stage] { display: grid; gap: 20px; max-width: 420px; justify-items: start; }
[data-stage] ui-field { width: 100%; }
[data-stage] ui-textarea { display: block; }
[data-stage] ui-textarea textarea { width: 100%; min-height: 72px; max-height: 160px; box-sizing: border-box; }
[data-stage] [data-status] { margin: 0; color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const dateInput = root.querySelector("ui-date-input")! as HTMLElement & { value: string | null; unavailable: unknown }
  const timeInput = root.querySelector("ui-time-input")! as HTMLElement & { value: string | null }
  const notes = root.querySelector("ui-textarea")! as HTMLElement & { value: string }
  const status = root.querySelector("[data-status]")!
  const visit = { date: dateInput.value as string | null, time: timeInput.value as string | null }
  dateInput.unavailable = { weekday: [0, 6] }
  dateInput.addEventListener("valuechange", (e) => {
    visit.date = (e as CustomEvent).detail.value
  })
  timeInput.addEventListener("valuechange", (e) => {
    visit.time = (e as CustomEvent).detail.value
  })
  root.querySelector("[data-book]")!.addEventListener("action", () => {
    if (!visit.date || !visit.time || dateInput.hasAttribute("data-invalid")) {
      status.textContent = "Enter a valid weekday and a time first."
      return
    }
    const note = notes.value.trim()
    status.textContent = `Booked: ${visit.date} at ${visit.time}${note ? `, notes: ${note}` : ", no notes"}.`
  })
}

const ui: UI = {
  id: "A05",
  request: "Build a clinic appointment form: a visit date typed in parts, a visit time typed in parts, a notes field, and a Book appointment button.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Visit date", action: "setValue", args: ["2026-12-15"] },
      { ref: "Visit time", action: "setValue", args: ["14:45"] },
      { ref: "Visit notes", action: "setValue", args: ["Sore throat"] },
      { ref: "Book appointment", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Booked: 2026-12-15 at 14:45, notes: Sore throat.",
  },
}

export default ui
