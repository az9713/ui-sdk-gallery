import {
  type ChangeDetails,
  createChange,
  createSpans,
  definePrimitive,
  type Span,
  type SpansDraft,
  type SpansReason,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import type { UI } from "../src/ui"

// A task's start and end count working days from 0, so a task from 0 to 4 runs from day 1 to day 4.
type Task = Span & { title: string }
type Options = {
  tracks: string[]
  locked?: string[]
  value?: Task[]
  defaultValue?: Task[]
  onValueChange?: (value: Task[], details: ChangeDetails<SpansReason>) => void
}
// tracks and locked are options that a task renders from, so the state has a copy.
type State = { value: Task[]; draft: SpansDraft<Task> | null; tracks: string[]; locked: string[] }

const DAYS = 20
const describe = (task: Task) => `${task.title}, ${task.track}, day ${task.start + 1} to day ${task.end}`

const plan = definePrimitive({
  name: "plan",
  options: { tracks: "list", locked: "list", value: "value", defaultValue: "value", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    value: options.value ?? options.defaultValue ?? [],
    draft: null,
    tracks: options.tracks,
    locked: options.locked ?? [],
  }),
  sync: (options) => ({
    tracks: options.tracks,
    locked: options.locked ?? [],
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const spans = createSpans<State, Task>(context, {
      key: "value",
      draft: "draft",
      set: (value, details) => change("value", value, details),
      axis: "x",
      min: () => 0,
      max: () => DAYS,
      step: () => 1,
      tracks: () => store.get().tracks,
      overlap: false,
      disabled: (task) => store.get().locked.includes(task.id),
      label: describe,
    })

    const find = (name: unknown) => {
      const tasks = store.get().value
      const task = tasks.find((t) => t.id === name || t.title.toLowerCase() === String(name).trim().toLowerCase())
      if (!task) throw new Error(`No task "${name}". Tasks: ${tasks.map((t) => t.title).join(", ")}.`)
      if (store.get().locked.includes(task.id)) throw new Error(`${task.title} is locked. Ask the person to move it.`)
      return task
    }
    const whole = (value: unknown, what: string) => {
      const number = Number(value)
      if (!Number.isInteger(number) || number < 1) throw new Error(`${what} is a whole number from 1, like 3. Got "${value}".`)
      return number
    }
    const apply = (task: Task, patch: Partial<Omit<Task, "id">>) => {
      if (!spans.update(task.id, patch))
        throw new Error(`${task.title} does not fit there: it would overlap another task, or leave day 1 to day ${DAYS}.`)
      return true
    }

    return {
      spans,
      tasks: () => store.get().value.map((task) => ({ value: task.id, label: task.title })),
      moveTask: (task: string, track: string, firstDay: number) => {
        const found = find(task)
        const lane = store.get().tracks.find((name) => name.toLowerCase() === String(track).trim().toLowerCase())
        if (!lane) throw new Error(`No track "${track}". Tracks: ${store.get().tracks.join(", ")}.`)
        const start = whole(firstDay, "The first day") - 1
        return apply(found, { track: lane, start, end: start + found.end - found.start })
      },
      resizeTask: (task: string, days: number) => {
        const found = find(task)
        return apply(found, { end: found.start + whole(days, "The length in days") })
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      // A drag ends when the window loses focus.
      bind: (el, { api }) => {
        const view = el.ownerDocument.defaultView!
        view.addEventListener("blur", api.spans.cancel)
        return () => view.removeEventListener("blur", api.spans.cancel)
      },
    }),
    lane: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (_state, { key }) => ({ "data-track": key }),
      bind: (el, { api, key }) => api.spans.bindTrack(el, key),
    }),
    // Tasks sit over the lanes, not in them: the web renderer does not move an element to another lane.
    task: slot<{ value: string }>({
      role: "group",
      focus: "tab-stop",
      props: { value: "string" },
      attrs: (state, { api, key }) => {
        const task = api.spans.spans(state).find((t) => t.id === key)
        const locked = state.locked.includes(key)
        return {
          ...api.spans.spanAttrs(state, key),
          tabindex: "0",
          "aria-roledescription": "task",
          "aria-label": task ? describe(task) : undefined,
          "aria-disabled": locked ? "true" : undefined,
          "data-locked": locked ? "" : undefined,
          // In the browser, spanStyle ends with no semicolon.
          style: task ? `${api.spans.spanStyle(task)}; --row: ${state.tracks.indexOf(task.track)};` : undefined,
        }
      },
      on: {
        pointerdown: (event, { api, key }) => api.spans.spanPointerdown(event, key),
        keydown: (event, { api, key }) => {
          // The set of tasks is fixed, so Delete and Backspace do not remove one.
          if (event.key === "Delete" || event.key === "Backspace") return
          api.spans.keydown(event, key)
        },
      },
      bind: (el, { api, key }) => api.spans.bindSpan(el, key),
    }),
  }),
  agent: { actions: ["moveTask", "resizeTask"], items: (api) => api.tasks() },
})

const TRACKS = ["Design", "Backend", "Frontend", "QA"]
const LOCKED = ["review"]
const TASKS: Task[] = [
  { id: "wireframes", title: "Wireframes", track: "Design", start: 0, end: 4 },
  { id: "visual", title: "Visual design", track: "Design", start: 4, end: 9 },
  { id: "model", title: "Data model", track: "Backend", start: 0, end: 4 },
  { id: "api", title: "API", track: "Backend", start: 4, end: 11 },
  { id: "screens", title: "Screens", track: "Frontend", start: 9, end: 15 },
  { id: "tests", title: "Test plan", track: "QA", start: 5, end: 9 },
  { id: "review", title: "Launch review", track: "QA", start: 16, end: 20 },
]

createParts(plan, {
  root: {
    tag: "b07-plan",
    display: "block",
    options: () => ({ tracks: TRACKS, locked: LOCKED, defaultValue: TASKS }),
  },
  lane: "b07-plan-lane",
  task: "b07-plan-task",
})

const html = `
<h2>Checkout redesign</h2>
<b07-plan aria-label="Project plan" aria-describedby="b07-keys">
  <div data-scale aria-hidden="true"><span></span><span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span></div>
  <div data-body>
    <div data-names>${TRACKS.map((track) => `<span>${track}</span>`).join("")}</div>
    <div data-lanes>
      ${TRACKS.map((track) => `<b07-plan-lane value="${track}"></b07-plan-lane>`).join("")}
      ${TASKS.map(
        (task) =>
          `<b07-plan-task value="${task.id}"><span data-span-edge="start"></span><span data-title>${task.title}</span><span data-span-edge="end"></span></b07-plan-task>`,
      ).join("")}
    </div>
  </div>
</b07-plan>
<p id="b07-keys" data-hint>Drag a task to move it, or drag its left or right edge to change its days. With the keyboard: Tab goes to each task, Left and Right move it 1 day, Shift with Left or Right changes its last day, and Up and Down move it to another track. Tasks on 1 track cannot overlap. Launch review is locked.</p>
<p role="status" data-status>No task has moved.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 880px; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] b07-plan { border: 1px solid var(--ui-border); border-radius: var(--ui-radius); overflow: hidden; }
[data-stage] [data-scale], [data-stage] [data-body] { display: grid; grid-template-columns: 96px minmax(0, 1fr); }
[data-stage] [data-scale] { grid-template-columns: 96px repeat(4, minmax(0, 1fr)); border-bottom: 1px solid var(--ui-border); }
[data-stage] [data-scale] span { padding: 8px 10px; font-size: 0.8125rem; color: var(--ui-muted-foreground); border-inline-start: 1px solid var(--ui-border); }
[data-stage] [data-scale] span:first-child { border-inline-start: 0; }
[data-stage] [data-names] { display: grid; grid-auto-rows: 48px; }
[data-stage] [data-names] span {
  display: flex; align-items: center; padding: 0 12px; font-size: 0.875rem; font-weight: 600;
  border-bottom: 1px solid var(--ui-border);
}
[data-stage] [data-names] span:last-child, [data-stage] b07-plan-lane:last-of-type { border-bottom: 0; }
[data-stage] [data-lanes] { position: relative; border-inline-start: 1px solid var(--ui-border); }
[data-stage] b07-plan-lane {
  display: block; height: 48px; box-sizing: border-box; border-bottom: 1px solid var(--ui-border); background: var(--ui-muted);
  background-image: repeating-linear-gradient(to right, transparent 0 calc(25% - 1px), var(--ui-border) calc(25% - 1px) 25%);
  touch-action: none;
}
[data-stage] b07-plan-task {
  top: calc(var(--row) * 48px + 8px); height: 32px; box-sizing: border-box; display: flex; align-items: center; padding: 0 12px;
  border: 2px solid var(--ui-muted); border-radius: var(--ui-radius); background: var(--ui-primary); color: var(--ui-primary-foreground);
  background-clip: padding-box; outline-offset: 2px;
  font-size: 0.8125rem; font-weight: 600; white-space: nowrap; overflow: hidden;
  cursor: grab; touch-action: none; user-select: none;
}
[data-stage] b07-plan-task:focus-visible { outline: 2px solid var(--ui-ring); z-index: 1; }
[data-stage] b07-plan-task[data-dragging], [data-stage] b07-plan-task[data-resizing] { cursor: grabbing; box-shadow: 0 6px 18px var(--ui-shadow); z-index: 1; }
[data-stage] b07-plan-task[data-locked] {
  border: 1px dashed var(--ui-muted-foreground); background: var(--ui-background); color: var(--ui-foreground); cursor: default;
}
[data-stage] [data-span-edge] { position: absolute; inset-block: 0; width: 8px; cursor: ew-resize; }
[data-stage] [data-span-edge="start"] { inset-inline-start: 0; }
[data-stage] [data-span-edge="end"] { inset-inline-end: 0; }
[data-stage] b07-plan-task[data-locked] [data-span-edge] { cursor: default; }
[data-stage] [data-hint], [data-stage] [data-status] { max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  let tasks = TASKS
  root.querySelector("b07-plan")!.addEventListener("valuechange", (event) => {
    const next = (event as CustomEvent<{ value: Task[] }>).detail.value
    for (const task of next) {
      const old = tasks.find((t) => t.id === task.id)
      if (!old || (old.track === task.track && old.start === task.start && old.end === task.end)) continue
      const verb = old.end - old.start === task.end - task.start ? "Moved" : "Resized"
      status.textContent = `${verb} ${task.title}: ${task.track}, day ${task.start + 1} to day ${task.end}.`
    }
    tasks = next
  })
}

const ui: UI = {
  id: "B07",
  request:
    "Build a project plan with 1 track for each team: a person moves a task along its track or to another track and changes its days, by drag and by keyboard, and tasks on 1 track cannot overlap.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Project plan", action: "moveTask", args: ["Test plan", "QA", 12] },
      { ref: "Project plan", action: "resizeTask", args: ["Screens", 8] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Resized Screens: Frontend, day 10 to day 17." &&
      root.querySelector('b07-plan-task[value="tests"]')!.getAttribute("aria-label") === "Test plan, QA, day 12 to day 15",
  },
  breaks: [
    {
      broke: "Tasks on 1 track can overlap.",
      find: "overlap: false,",
      replace: "",
      caught: "keyboard: a task stops at the task next to it on its track",
    },
    {
      broke: "A locked task moves.",
      find: "disabled: (task) => store.get().locked.includes(task.id),",
      replace: "",
      caught: "keyboard: a locked task does not move or change its days",
    },
    {
      broke: "Delete removes a task, and its element stays in the page.",
      find: 'if (event.key === "Delete" || event.key === "Backspace") return',
      replace: "",
      caught: "keyboard: Delete and Backspace do not remove a task",
    },
    {
      broke: "Up and Down no longer go through the tracks in the order of the plan.",
      find: "tracks: () => store.get().tracks,",
      replace: "tracks: () => [...store.get().tracks].reverse(),",
      caught: "keyboard: Up and Down move a task to the track above or below, and stop at the first and last track",
    },
    {
      broke: "An agent can move a locked task.",
      find: "if (store.get().locked.includes(task.id)) throw",
      replace: "if (false) throw",
      caught: "agent: moveTask and resizeTask check the task, the track and the days, and refuse a locked task or an overlap",
    },
  ],
}

export { plan }
export default ui
