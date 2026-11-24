import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/progress"
import "@ui-sdk/web/radio"
import "@ui-sdk/web/textarea"
import type { UI } from "../src/ui"

const ratings = [
  { value: "poor", label: "Poor" },
  { value: "fair", label: "Fair" },
  { value: "good", label: "Good" },
  { value: "excellent", label: "Excellent" },
]
const QUESTIONS = 3

const html = `
<h2>Workshop feedback</h2>
<p>All 3 questions need an answer.</p>
<ui-progress value="0" min="0" max="${QUESTIONS}">
  <ui-progress-label>Survey progress</ui-progress-label>
  <ui-progress-value></ui-progress-value>
  <ui-progress-track><ui-progress-indicator></ui-progress-indicator></ui-progress-track>
</ui-progress>
<form data-survey>
  <ui-field name="name">
    <ui-field-label>Your name</ui-field-label>
    <ui-input><input required autocomplete="name" /></ui-input>
    <ui-field-error match="valueMissing">Enter your name.</ui-field-error>
  </ui-field>
  <ui-field>
    <ui-field-label>Overall rating</ui-field-label>
    <ui-radio-group name="rating" required>
      ${ratings
        .map(
          (r) => `
      <label data-slot="label">
        <ui-radio value="${r.value}"><ui-radio-indicator></ui-radio-indicator></ui-radio>
        ${r.label}
      </label>`,
        )
        .join("")}
    </ui-radio-group>
    <ui-field-error>Choose a rating.</ui-field-error>
  </ui-field>
  <ui-field name="improve">
    <ui-field-label>What should we improve?</ui-field-label>
    <ui-textarea><textarea required rows="3"></textarea></ui-textarea>
    <ui-field-error match="valueMissing">Write 1 suggestion.</ui-field-error>
  </ui-field>
  <div data-actions>
    <ui-button><button type="submit">Send answers</button></ui-button>
    <ui-button><button type="reset">Clear answers</button></ui-button>
  </div>
</form>
<p role="status" data-status>No answers are sent.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 520px; }
[data-stage] h2 { margin: 0; font-size: 1.125rem; }
[data-stage] p { margin: 0; }
[data-stage] form { display: grid; gap: 20px; }
[data-stage] [data-actions] { display: flex; gap: 12px; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

type Value = { value: unknown }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const form = root.querySelector("form")!
  const status = root.querySelector("[data-status]")!
  const progress = root.querySelector("ui-progress") as HTMLElement & { format: (value: number) => string }
  const name = root.querySelector("input")!
  const rating = root.querySelector("ui-radio-group") as unknown as HTMLElement & Value
  const improve = root.querySelector("textarea")!
  progress.format = (value) => `${value} of ${QUESTIONS} answered`

  const count = () => [name.value.trim(), rating.value, improve.value.trim()].filter(Boolean).length
  const update = () => progress.setAttribute("value", String(count()))
  for (const tag of ["ui-input", "ui-radio-group", "ui-textarea"])
    root.querySelector(tag)!.addEventListener("valuechange", () => queueMicrotask(update))
  form.addEventListener("input", update)

  let blocked = false
  form.addEventListener(
    "invalid",
    () => {
      if (blocked) return
      blocked = true
      queueMicrotask(() => {
        blocked = false
        status.textContent = `Not sent: ${QUESTIONS - count()} of ${QUESTIONS} questions have no answer.`
      })
    },
    true,
  )

  let sent = ""
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const label = ratings.find((r) => r.value === data.get("rating"))?.label ?? "no rating"
    sent = `${data.get("name")}, ${label}, "${data.get("improve")}"`
    status.textContent = `Sent: ${sent}.`
  })
  form.addEventListener("reset", () => {
    status.textContent = sent ? `Sent: ${sent}. Answers cleared.` : "Answers cleared."
    setTimeout(update)
  })
}

const ui: UI = {
  id: "A22",
  request:
    "Build a 3-question survey form with a progress bar, required-field errors, a native submit that reads FormData, and a reset button.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Send answers", action: "press" },
      { ref: "Your name", action: "setValue", args: ["Ada Lovelace"] },
      { ref: "Overall rating", action: "setValue", args: ["Good"] },
      { ref: "improve", action: "setValue", args: ["Longer breaks"] },
      { ref: "Send answers", action: "press" },
      { ref: "Clear answers", action: "press" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === 'Sent: Ada Lovelace, Good, "Longer breaks". Answers cleared.' &&
      root.querySelector("input")!.value === "" &&
      (root.querySelector("ui-radio-group") as unknown as Value).value == null &&
      root.querySelector("ui-progress")!.getAttribute("value") === "0",
  },
}

export default ui
