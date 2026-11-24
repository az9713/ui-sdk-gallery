import {
  type ChangeDetails,
  createChange,
  createRovingFocus,
  createSpans,
  definePrimitive,
  keepFocus,
  type Span,
  type SpansDraft,
  type SpansReason,
  stackSpans,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import type { UI } from "../src/ui"

type CalEvent = Span & { title: string }
type Options = {
  value?: CalEvent[]
  defaultValue?: CalEvent[]
  onValueChange?: (value: CalEvent[], details: ChangeDetails<SpansReason>) => void
}
// grabbed is the event that Space picked up, and from is where it was, for Escape.
type State = { value: CalEvent[]; draft: SpansDraft<CalEvent> | null; active: string | null; grabbed: string | null; from: CalEvent | null }

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
const DAY_NAMES: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" }
const OPEN = 9 * 60
const CLOSE = 17 * 60
const STEP = 30

const clock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
const range = (event: CalEvent) => `${clock(event.start)} to ${clock(event.end)}`
const byStart = (a: CalEvent, b: CalEvent) => a.start - b.start || a.end - b.end
const overlaps = (a: CalEvent, b: CalEvent) => a.id !== b.id && a.track === b.track && a.start < b.end && b.start < a.end

const week = definePrimitive({
  name: "week",
  options: { value: "value", defaultValue: "value", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    value: options.value ?? options.defaultValue ?? [],
    draft: null,
    active: null,
    grabbed: null,
    from: null,
  }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    const { store } = context
    const spans = createSpans<State, CalEvent>(context, {
      key: "value",
      draft: "draft",
      set: (value, details) => change("value", value, details),
      min: () => OPEN,
      max: () => CLOSE,
      step: () => STEP,
      minSize: () => STEP,
      tracks: () => DAYS,
      label: (event) => `${event.title}, ${DAY_NAMES[event.track]} ${range(event)}`,
      createAutoScroll: false,
    })
    const day = (state: State, track: string) => spans.spansOn(state, track).slice().sort(byStart)
    const roving = createRovingFocus<State, { value: string }>(context, {
      slot: "event",
      key: "active",
      move: (event, { from, rtl }) => {
        const state = store.get()
        const at = spans.spans(state).find((item) => item.id === from.key)
        if (!at) return undefined
        const list = day(state, at.track)
        const row = list.findIndex((item) => item.id === at.id)
        if (event.key === "ArrowDown") return list[row + 1]?.id ?? from.key
        if (event.key === "ArrowUp") return list[row - 1]?.id ?? from.key
        if (event.key === "Home") return list[0].id
        if (event.key === "End") return list.at(-1)!.id
        const step = ({ ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 } as Record<string, number>)[event.key]
        if (!step) return undefined
        for (let next = DAYS.indexOf(at.track) + step; next >= 0 && next < DAYS.length; next += step) {
          const there = day(state, DAYS[next])
          if (there.length)
            return there.reduce((best, item) => (Math.abs(item.start - at.start) < Math.abs(best.start - at.start) ? item : best)).id
        }
        return from.key
      },
    })
    const find = (ref: string) => {
      const events = store.get().value
      const found = events.find((event) => event.id === ref || event.title.toLowerCase() === String(ref).toLowerCase())
      if (!found) throw new Error(`No event "${ref}". Events: ${events.map((event) => event.title).join(", ")}.`)
      return found
    }
    const release = () => store.set({ grabbed: null, from: null })

    return {
      spans,
      roving,
      events: () => store.get().value.map((event) => ({ value: event.id, label: event.title })),
      // Space or Enter picks an event up and puts it down; while it is up, the arrows move it and Escape puts it back.
      keydown: (event: KeyboardEvent, id: string, el: HTMLElement) => {
        const { grabbed, from } = store.get()
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault()
          if (grabbed === id) release()
          else store.set({ grabbed: id, from: store.get().value.find((item) => item.id === id) ?? null })
          return
        }
        if (grabbed === id && event.key === "Escape") {
          event.preventDefault()
          if (from) spans.update(id, { track: from.track, start: from.start, end: from.end })
          release()
          return
        }
        if (grabbed === id && event.key.startsWith("Arrow")) {
          spans.keydown(event, id)
          return
        }
        roving.keydown(event, el)
      },
      moveEvent: (ref: string, track: string, time: string | number) => {
        const event = find(ref)
        const to = DAYS.find((key) => [key, DAY_NAMES[key]].some((name) => name.toLowerCase() === String(track).toLowerCase()))
        if (!to) throw new Error(`No day "${track}". Days: ${DAYS.map((key) => DAY_NAMES[key]).join(", ")}.`)
        const [hours, minutes = "0"] = String(time).split(":")
        const start = typeof time === "number" ? time : Number(hours) * 60 + Number(minutes)
        const end = start + event.end - event.start
        if (!Number.isFinite(start) || start < OPEN || end > CLOSE)
          throw new Error(`${event.title} must start at ${clock(OPEN)} or later and end by ${clock(CLOSE)}.`)
        if (!spans.update(event.id, { track: to, start, end })) throw new Error(`${event.title} did not move.`)
        return true
      },
      resizeEvent: (ref: string, minutes: number) => {
        const event = find(ref)
        const end = event.start + Number(minutes)
        if (!(Number(minutes) >= STEP) || end > CLOSE)
          throw new Error(`${event.title} lasts at least ${STEP} minutes and ends by ${clock(CLOSE)}.`)
        if (!spans.update(event.id, { end })) throw new Error(`${event.title} did not change.`)
        return true
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      // A custom element keeps its markup, so the root puts each event in the day and the place that the state shows.
      bind: (el, { api, store }) => {
        const place = () => {
          const state = store.get()
          const focused = el.querySelector<HTMLElement>("b08-event:focus")
          for (const track of DAYS) {
            const column = el.querySelector<HTMLElement>(`b08-day[value="${track}"]`)
            if (!column) continue
            api.spans.spansOn(state, track).slice().sort(byStart).forEach((event, index) => {
              const item = el.querySelector<HTMLElement>(`b08-event[value="${event.id}"]`)
              if (!item) return
              const time = item.querySelector("[data-time]")
              if (time && time.textContent !== range(event)) time.textContent = range(event)
              if (column.children[index] !== item) column.insertBefore(item, column.children[index] ?? null)
            })
          }
          if (focused && document.activeElement !== focused) keepFocus(() => focused)
        }
        place()
        return store.subscribe(place)
      },
    }),
    day: slot<{ value: string }>({
      role: "listbox",
      keys: { none: "Each event handles the arrow keys." },
      props: { value: "string" },
      attrs: () => ({ "aria-orientation": "vertical" }),
      bind: (el, { api, key }) => api.spans.bindTrack(el, key),
    }),
    event: slot<{ value: string }>({
      role: "option",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, part) => {
        const all = part.api.spans.spans(state)
        const event = all.find((item) => item.id === part.key)
        const lanes = event ? stackSpans(all.filter((item) => item.track === event.track)) : undefined
        const lane = event ? lanes?.get(event.id) : undefined
        return {
          ...part.api.spans.spanAttrs(state, part.key),
          tabindex: part.api.roving.tabIndex(state, part),
          style: event ? part.api.spans.spanStyle(event, lane) : undefined,
          "aria-roledescription": "event",
          "aria-selected": String(state.grabbed === part.key),
          "data-grabbed": state.grabbed === part.key ? "" : undefined,
          "data-overlap": event && all.some((other) => overlaps(event, other)) ? "" : undefined,
        }
      },
      // A click focuses the event; a drag moves it, and a drag of its lower edge changes its length.
      press: ({ api, key }) => api.roving.focus(key),
      on: {
        keydown: (event, { el, api, key }) => api.keydown(event, key, el!),
        pointerdown: (event, { api, key }) => api.spans.spanPointerdown(event, key),
      },
      bind: (el, part) => {
        const cleanups = [part.api.roving.bind(el, part), part.api.spans.bindSpan(el, part.key)]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
  }),
  agent: { actions: ["moveEvent", "resizeEvent"], items: (api) => api.events() },
})

createParts(week, {
  root: { tag: "b08-week", display: "block", options: () => ({ defaultValue: EVENTS }) },
  day: "b08-day",
  event: "b08-event",
})

const at = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}
const EVENTS: CalEvent[] = [
  ["standup", "Mon", "Standup", "9:00", "10:00"],
  ["roadmap", "Mon", "Roadmap", "9:30", "11:00"],
  ["lunch-talk", "Mon", "Lunch talk", "12:00", "13:00"],
  ["one-on-one", "Tue", "1:1 with Ana", "10:00", "11:00"],
  ["design-review", "Tue", "Design review", "14:00", "15:30"],
  ["budget", "Wed", "Budget", "10:00", "11:30"],
  ["client-call", "Thu", "Client call", "13:00", "14:00"],
  ["sprint-demo", "Thu", "Sprint demo", "13:30", "15:00"],
  ["retro", "Fri", "Retro", "15:00", "16:00"],
].map(([id, track, title, start, end]) => ({ id, track, title, start: at(start), end: at(end) }))

const HOURS = Array.from({ length: (CLOSE - OPEN) / 60 }, (_, i) => clock(OPEN + i * 60))

const html = `
<h2>Week of 7 December</h2>
<b08-week aria-label="Week calendar" aria-describedby="b08-keys">
  <div data-head aria-hidden="true"><span></span>${DAYS.map((key) => `<span>${DAY_NAMES[key]}</span>`).join("")}</div>
  <div data-body>
    <ol data-hours aria-hidden="true">${HOURS.map((hour) => `<li>${hour}</li>`).join("")}</ol>
    ${DAYS.map(
      (key) => `<b08-day value="${key}" aria-label="${DAY_NAMES[key]}">${EVENTS.filter((event) => event.track === key)
        .map(
          (event) =>
            `<b08-event value="${event.id}"><strong>${event.title}</strong> <span data-time>${range(event)}</span><span data-span-edge="end" aria-hidden="true"></span></b08-event>`,
        )
        .join("")}</b08-day>`,
    ).join("")}
  </div>
</b08-week>
<p id="b08-keys" data-hint>Events that overlap sit side by side. Drag an event to move it, or drag its lower edge to change its length. With the keyboard, the arrow keys go from event to event. Space picks an event up: then Up and Down move it by 30 minutes, Shift with Up or Down changes its end, Left and Right move it to another day, and Space puts it down. Escape puts it back.</p>
<p role="status" data-status>No event has moved.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 920px; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] b08-week { --hour: 60px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] [data-head], [data-stage] [data-body] { display: grid; grid-template-columns: 56px repeat(${DAYS.length}, minmax(0, 1fr)); }
[data-stage] [data-head] { border-bottom: 1px solid var(--ui-border); }
[data-stage] [data-head] span { padding: 8px; font-size: 0.875rem; font-weight: 600; }
[data-stage] [data-hours] { margin: 0; padding: 0; list-style: none; }
[data-stage] [data-hours] li {
  height: var(--hour); padding: 2px 8px 0 0; text-align: end;
  color: var(--ui-muted-foreground); font-size: 0.75rem; font-variant-numeric: tabular-nums;
}
[data-stage] b08-day {
  position: relative; display: block; height: calc(var(--hour) * ${HOURS.length});
  border-inline-start: 1px solid var(--ui-border);
  background: repeating-linear-gradient(to bottom, var(--ui-border) 0 1px, transparent 1px var(--hour));
}
[data-stage] b08-event {
  position: absolute; display: flex; flex-direction: column; gap: 2px; overflow: hidden;
  padding: 6px 8px; border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-muted); color: var(--ui-foreground); font-size: 0.75rem; line-height: 1.25;
  cursor: grab; touch-action: none; user-select: none;
}
[data-stage] b08-event strong { font-weight: 600; overflow-wrap: anywhere; }
[data-stage] b08-event [data-time] { color: var(--ui-muted-foreground); font-variant-numeric: tabular-nums; }
[data-stage] b08-event [data-span-edge] { position: absolute; inset-inline: 0; bottom: 0; height: 8px; cursor: ns-resize; }
[data-stage] b08-event[data-overlap] { border-color: var(--ui-primary); }
[data-stage] b08-event:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 1px; z-index: 1; }
[data-stage] b08-event[data-grabbed], [data-stage] b08-event[data-dragging], [data-stage] b08-event[data-resizing] {
  z-index: 1; background: var(--ui-primary); border-color: var(--ui-primary); color: var(--ui-primary-foreground);
}
[data-stage] b08-event[data-grabbed] [data-time], [data-stage] b08-event[data-dragging] [data-time], [data-stage] b08-event[data-resizing] [data-time] {
  color: var(--ui-primary-foreground);
}
[data-stage] [data-hint], [data-stage] [data-status] { max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  let events = EVENTS
  root.querySelector("b08-week")!.addEventListener("valuechange", (change) => {
    const next = (change as CustomEvent<{ value: CalEvent[] }>).detail.value
    const moved = next.find((event) => {
      const before = events.find((old) => old.id === event.id)
      return !before || before.track !== event.track || before.start !== event.start || before.end !== event.end
    })
    events = next
    if (!moved) return
    const beside = next.filter((other) => overlaps(moved, other)).map((other) => other.title)
    status.textContent = `${moved.title}: ${DAY_NAMES[moved.track]} ${range(moved)}${beside.length ? `, side by side with ${beside.join(" and ")}` : ""}.`
  })
}

const ui: UI = {
  id: "B08",
  request:
    "Build a week calendar where events that overlap sit side by side in their day, and a person moves an event or changes its length by drag and by keyboard.",
  css,
  mount,
  task: {
    steps: [{ ref: "Week calendar", action: "moveEvent", args: ["Design review", "Wednesday", "10:30"] }],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Design review: Wednesday 10:30 to 12:00, side by side with Budget.",
  },
  breaks: [
    {
      broke: "Every event is a tab stop.",
      find: "tabindex: part.api.roving.tabIndex(state, part),",
      replace: 'tabindex: "0",',
      caught: "keyboard: the week is 1 tab stop, and the arrow keys move focus without moving an event",
    },
    {
      broke: "Left and Right no longer go to another day.",
      find: "const step = ({ ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 } as Record<string, number>)[event.key]",
      replace: "const step = 0",
      caught: "keyboard: the arrow keys go from event to event, in a day and across days, and Home, End go to the day's ends",
    },
    {
      broke: "The arrow keys no longer move a picked-up event.",
      find: 'if (grabbed === id && event.key.startsWith("Arrow")) {',
      replace: "if (false) {",
      caught: "keyboard: Space picks an event up, Up and Down move it by 30 minutes, and Space puts it down",
    },
    {
      broke: "Escape no longer puts the event back.",
      find: "if (from) spans.update(id, { track: from.track, start: from.start, end: from.end })",
      replace: "",
      caught: "keyboard: Escape puts a picked-up event back where it was",
    },
    {
      broke: "Events that overlap are drawn on top of each other.",
      find: "const lane = event ? lanes?.get(event.id) : undefined",
      replace: "const lane = undefined",
      caught: "lanes: events that overlap share the day's width side by side, and an event alone takes all of it",
    },
    {
      broke: "A pointer press no longer starts a drag.",
      find: "pointerdown: (event, { api, key }) => api.spans.spanPointerdown(event, key),",
      replace: "pointerdown: () => {},",
      caught: "pointer: a drag moves an event, and a drag of its lower edge changes its length",
    },
    {
      broke: "The page does not put a moved event in its new day.",
      find: "if (column.children[index] !== item) column.insertBefore(item, column.children[index] ?? null)",
      replace: "",
      caught: "keyboard: on the page, a picked-up event moves to another day, focus stays on it, and the status line reports it",
    },
    {
      broke: "Focus does not stay on an event that moves to another day.",
      find: "if (focused && document.activeElement !== focused) keepFocus(() => focused)",
      replace: "",
      caught: "keyboard: on the page, a picked-up event moves to another day, focus stays on it, and the status line reports it",
    },
    {
      broke: "moveEvent no longer refuses a day that the week does not have.",
      find: "if (!to) throw",
      replace: "if (false) throw",
      caught: "agent: an agent finds the week and its events, moves an event beside another and changes a length, and gets errors it can act on",
    },
  ],
}

export { week }
export default ui
