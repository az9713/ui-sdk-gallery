import { type ChangeDetails, createChange, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import { line, max, randomLcg, randomNormal, scaleLinear, select } from "d3"
import { type CrosshairPointer, type CrosshairReason, createCrosshair } from "../src/behaviors/crosshair"
import type { UI } from "../src/ui"

// time is the UTC time of day as HH:MM, minute the same time in minutes. peak is the ground velocity of the S wave, in µm/s.
type Quake = { time: string; minute: number; magnitude: number; depth: number; peak: number }
type Options = {
  quakes?: Quake[]
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null, details: ChangeDetails<CrosshairReason>) => void
}
// quakes is an option that the plot renders from, so the state has a copy: a part must not read an option.
type State = { value: string | null; quakes: Quake[]; pointer: CrosshairPointer | null }

const DAY = 1440
const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
const velocity = (value: number) => value.toFixed(1)
// Where a ground velocity sits on the plot, from 0 at the top to 1 at the bottom. The scale is symmetric around 0.
const levelOf = (quakes: Quake[]) => {
  const top = max(quakes, (q) => q.peak) ?? 1
  const [low, high] = scaleLinear().domain([-top, top]).nice(4).domain()
  return scaleLinear().domain([low, high]).range([1, 0])
}
const readout = (quakes: Quake[], time: string) => {
  const q = quakes.find((quake) => quake.time === time)
  if (!q) return time
  return `${time} UTC: magnitude ${q.magnitude.toFixed(1)}, depth ${q.depth} km, peak ${velocity(q.peak)} µm/s`
}

const seismograph = definePrimitive({
  name: "seismograph",
  options: { quakes: "value", value: "string", defaultValue: "string", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    value: options.value ?? options.defaultValue ?? null,
    quakes: options.quakes ?? [],
    pointer: null,
  }),
  sync: (options) => ({
    quakes: options.quakes ?? [],
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: (context) => {
    const change = createChange(context)
    const quakes = () => context.store.get().quakes
    const quake = (time: string) => quakes().find((q) => q.time === time)
    const crosshair = createCrosshair(context, {
      key: "value",
      pointer: "pointer",
      set: (value, details) => change("value", value, details),
      // The earthquakes sit at their time of day, so the spacing is uneven.
      points: () => quakes().map((q) => ({ value: q.time, at: q.minute / DAY })),
      cross: (time) => levelOf(quakes())(quake(time)?.peak ?? 0),
      label: (time) => readout(quakes(), time),
      empty: () => "Crosshair hidden",
      page: () => 3,
    })
    return {
      crosshair,
      times: () => quakes().map((q) => ({ value: q.time, label: q.time })),
      // Returns false for a time with no earthquake, so the bridge's closed list is what refuses it.
      setValue: (time: string) => crosshair.show(time),
      clear: () => crosshair.hide(),
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state, { api }) => api.crosshair.lineAttrs(state),
      bind: (el, { api, store }) => draw(el, store.get().quakes, () => api.crosshair.position(store.get()), store),
    }),
    plot: slot({
      role: "slider",
      focus: "tab-stop",
      keys: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", "Escape"],
      attrs: (state, { api }) => api.crosshair.surfaceAttrs(state),
      on: {
        keydown: (event, { el, api }) => void api.crosshair.keydown(event, el!),
        pointermove: (event, { el, api }) => api.crosshair.pointermove(event, el!),
        pointerdown: (event, { el, api }) => api.crosshair.pointerdown(event, el!),
        pointerleave: (event, { api }) => api.crosshair.pointerleave(event),
      },
    }),
  }),
  agent: { actions: ["setValue", "clear"], closed: true, items: (api) => api.times() },
})

createParts(seismograph, {
  root: {
    tag: "c02-seismograph",
    display: "block",
    options: (el) => ({ quakes: JSON.parse(el.getAttribute("data-quakes") ?? "[]") as Quake[] }),
  },
  plot: { tag: "c02-plot", display: "block" },
})

const WIDTH = 640
const HEIGHT = 280
// 1 sample each 30 seconds.
const SAMPLES = DAY * 2 + 1
// The crosshair opens on the main shock, between the time labels of 12:00 and 16:00, so the first view shows both of its lines.
const OPEN_TIME = "14:02"

// A seeded seismogram: background noise, and for each earthquake a small P wave, then the S wave, which decays.
function makeTrace(quakes: Quake[]) {
  const random = randomLcg(0.4127)
  const noise = randomNormal.source(random)(0, 0.3)
  const trace = Array.from({ length: SAMPLES }, () => noise())
  for (const q of quakes) {
    const s = q.minute + 0.4 + q.depth / 30
    const decay = 1 + q.magnitude * 1.1
    for (let i = Math.ceil(q.minute * 2); i < SAMPLES; i++) {
      const t = i / 2
      const envelope = t < s ? 0.3 * q.peak * Math.exp(-(t - q.minute) / 2) : 0.9 * q.peak * Math.exp(-(t - s) / decay)
      if (envelope < 0.05) break
      trace[i] += envelope * (i % 2 ? -1 : 1) * (0.45 + 0.55 * random())
    }
    const peakAt = Math.ceil(s * 2)
    if (peakAt < SAMPLES) trace[peakAt] = q.peak
  }
  return trace
}

// Draws the trace, the earthquake marks and the axis labels with d3, and keeps the 2 axis tags on the crosshair.
function draw(
  el: HTMLElement,
  quakes: Quake[],
  position: () => { x: number; y: number | undefined } | null,
  store: { get: () => State; subscribe: (listener: () => void) => () => void },
) {
  const svg = el.querySelector<SVGSVGElement>("[data-chart]")
  const amplitudes = el.querySelector<HTMLElement>("[data-amplitude-axis]")
  const times = el.querySelector<HTMLElement>("[data-time-axis]")
  if (!svg || !amplitudes || !times || !quakes.length) return
  const level = levelOf(quakes)
  const y = (value: number) => level(value) * HEIGHT
  const ticks = level.ticks(4)
  const trace = makeTrace(quakes)

  select(svg)
    .selectAll("line[data-grid]")
    .data(ticks)
    .join("line")
    .attr("data-grid", "")
    .attr("data-zero", (v) => (v === 0 ? "" : null))
    .attr("x1", 0)
    .attr("x2", WIDTH)
    .attr("y1", y)
    .attr("y2", y)
  select(svg)
    .append("path")
    .attr("data-wave", "")
    .attr(
      "d",
      line<number>()
        .x((_, i) => (i / (SAMPLES - 1)) * WIDTH)
        .y((v) => y(v))(trace),
    )
  select(svg)
    .selectAll("line[data-quake]")
    .data(quakes, (q) => (q as Quake).time)
    .join("line")
    .attr("data-quake", "")
    .attr("data-strong", (q) => (q.magnitude >= 4 ? "" : null))
    .attr("x1", (q) => (q.minute / DAY) * WIDTH)
    .attr("x2", (q) => (q.minute / DAY) * WIDTH)
    .attr("y1", 0)
    .attr("y2", (q) => 6 + q.magnitude * 3)

  const label = (axis: HTMLElement, at: number, text: string) =>
    select(axis).append("span").attr("data-tick", "").attr("data-at", at).style("--at", at).text(text)
  for (const value of ticks) label(amplitudes, level(value), String(value))
  // 1 label each 4 hours.
  for (let hour = 0; hour < 24; hour += 4) label(times, (hour * 60) / DAY, hhmm(hour * 60))

  const amplitudeTag = select(amplitudes).append("span").attr("data-tag", "").node()!
  const timeTag = select(times).append("span").attr("data-tag", "").node()!
  const update = () => {
    const at = position()
    const { value } = store.get()
    if (at && value) {
      amplitudeTag.textContent = velocity(level.invert(at.y ?? 0.5))
      timeTag.textContent = value
    }
    // An axis label under a tag is hidden, so the 2 never overlap.
    for (const [axis, near, place] of [
      [amplitudes, 0.08, at?.y],
      [times, 0.075, at?.x],
    ] as const)
      for (const tick of axis.querySelectorAll<HTMLElement>("[data-tick]"))
        tick.toggleAttribute("data-covered", place !== undefined && Math.abs(Number(tick.dataset.at) - place) < near)
  }
  update()
  const stop = store.subscribe(update)
  return () => {
    stop()
    select(svg).selectAll("*").remove()
    select(amplitudes).selectAll("*").remove()
    select(times).selectAll("*").remove()
  }
}

// 12 earthquakes on 23 November 2026, UTC: minute of the day, magnitude, depth in km. The main shock at 14:02 has 2 aftershocks.
const CATALOG: [number, number, number][] = [
  [78, 2.4, 8],
  [171, 3.1, 14],
  [246, 2.2, 6],
  [402, 4.3, 21],
  [435, 3.0, 19],
  [598, 2.7, 11],
  [842, 5.2, 17],
  [859, 3.8, 15],
  [891, 3.4, 12],
  [1046, 2.9, 9],
  [1177, 3.6, 24],
  [1334, 2.5, 7],
]

function makeQuakes(): Quake[] {
  return CATALOG.map(([minute, magnitude, depth]) => ({
    time: hhmm(minute),
    minute,
    magnitude,
    depth,
    peak: Math.round(9 * 2 ** magnitude) / 10,
  }))
}

const html = (quakes: Quake[]) => `
<div data-card>
  <header>
    <h2>Station SN-04, vertical ground motion</h2>
    <p data-sub>23 Nov 2026, 00:00 to 24:00 UTC, ${quakes.length} earthquakes, ground velocity in µm/s</p>
  </header>
  <p role="status" data-status></p>
  <c02-seismograph aria-label="Seismograph" dir="ltr" default-value="${OPEN_TIME}" data-quakes='${JSON.stringify(quakes)}'>
    <div data-frame>
      <c02-plot aria-label="Crosshair" aria-describedby="c02-help">
        <svg data-chart viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" aria-hidden="true" focusable="false"></svg>
        <span data-line="x"></span><span data-line="y"></span>
      </c02-plot>
      <div data-amplitude-axis aria-hidden="true"></div>
      <div data-time-axis aria-hidden="true"></div>
    </div>
  </c02-seismograph>
  <p id="c02-help">Point at the trace, or focus it and use the arrow keys to step between earthquakes. Page Up and Page Down move 3 earthquakes, Home and End go to the first and last, and Escape hides the crosshair.</p>
</div>`

const css = `
[data-stage] { display: block; width: min(100%, 760px); }
[data-stage] [data-card] {
  display: grid; gap: 16px; padding: 20px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius);
  background: var(--ui-muted); color: var(--ui-foreground);
}
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1.125rem; font-weight: 600; }
[data-stage] [data-sub] { margin-top: 4px; }
[data-stage] [data-sub], [data-stage] #c02-help { color: var(--ui-muted-foreground); max-width: 60ch; }
[data-stage] [data-status] { max-width: 60ch; font-variant-numeric: tabular-nums; }
[data-stage] [data-frame] { display: grid; grid-template-columns: minmax(0, 1fr) 64px; grid-template-rows: 280px 28px; }
[data-stage] c02-plot {
  position: relative; grid-column: 1; grid-row: 1; cursor: crosshair; touch-action: none;
  box-shadow: inset 0 0 0 1px var(--ui-border);
}
[data-stage] c02-plot:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] c02-plot > svg { display: block; width: 100%; height: 100%; }
[data-stage] [data-grid] { stroke: var(--ui-border); stroke-width: 1; vector-effect: non-scaling-stroke; }
[data-stage] [data-grid][data-zero] { stroke: var(--ui-muted-foreground); stroke-opacity: 0.5; }
[data-stage] [data-wave] { fill: none; stroke: var(--ui-primary); stroke-width: 1; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
[data-stage] [data-quake] { stroke: var(--ui-muted-foreground); stroke-width: 2; vector-effect: non-scaling-stroke; }
[data-stage] [data-quake][data-strong] { stroke: var(--ui-destructive); }
[data-stage] [data-line] { position: absolute; pointer-events: none; visibility: hidden; }
[data-stage] [data-line="x"] { inset-block: 0; inset-inline-start: calc(var(--crosshair-x) * 100%); border-inline-start: 1px dashed var(--ui-ring); }
[data-stage] [data-line="y"] { inset-inline: 0; top: calc(var(--crosshair-y) * 100%); border-top: 1px dashed var(--ui-ring); }
[data-stage] [data-amplitude-axis], [data-stage] [data-time-axis] { position: relative; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
[data-stage] [data-amplitude-axis] { grid-column: 2; grid-row: 1; }
[data-stage] [data-time-axis] { grid-column: 1; grid-row: 2; }
[data-stage] [data-tick] { position: absolute; color: var(--ui-muted-foreground); white-space: nowrap; }
[data-stage] [data-amplitude-axis] [data-tick] { inset-inline-start: 8px; top: calc(var(--at) * 100%); transform: translateY(-50%); }
[data-stage] [data-time-axis] [data-tick] { top: 6px; inset-inline-start: calc(var(--at) * 100%); transform: translateX(-50%); }
[data-stage] [data-tick][data-covered] { visibility: hidden; }
[data-stage] [data-tag] {
  position: absolute; visibility: hidden; display: grid; place-items: center; height: 22px; padding: 0 6px;
  border-radius: 4px; background: var(--ui-ring); color: var(--ui-background); font-weight: 600; white-space: nowrap;
}
[data-stage] [data-amplitude-axis] [data-tag] { inset-inline-start: 4px; top: clamp(0px, calc(var(--crosshair-y) * 100% - 11px), calc(100% - 22px)); }
[data-stage] [data-time-axis] [data-tag] { top: 3px; width: 56px; padding: 0; inset-inline-start: clamp(0px, calc(var(--crosshair-x) * 100% - 28px), calc(100% - 56px)); }
[data-stage] c02-seismograph[data-crosshair] :is([data-line], [data-tag]) { visibility: visible; }
`

function mount(root: HTMLElement) {
  const quakes = makeQuakes()
  root.innerHTML = html(quakes)
  const chart = root.querySelector("c02-seismograph")!
  const status = root.querySelector("[data-status]")!
  const say = (time: string | null) => (status.textContent = time ? readout(quakes, time) : "Crosshair hidden.")
  say(OPEN_TIME)
  chart.addEventListener("valuechange", (event) => say((event as CustomEvent<{ value: string | null }>).detail.value))
}

const ui: UI = {
  id: "C02",
  request:
    "Build a seismograph timeline of a day's earthquakes with the same crosshair as the price chart: hovering or the arrow keys put it on the nearest earthquake and read out its time, magnitude, depth and peak ground velocity.",
  css,
  mount,
  task: {
    steps: [{ ref: "Seismograph", action: "setValue", args: ["06:42"] }],
    done: (root) => root.querySelector("[data-status]")!.textContent!.startsWith("06:42 UTC: magnitude 4.3"),
  },
  breaks: [
    {
      broke: "The arrow keys no longer move the crosshair.",
      find: "keydown: (event, { el, api }) => void api.crosshair.keydown(event, el!),",
      replace: "keydown: () => {},",
      caught: "keyboard: the plot is 1 tab stop, arrows step 1 earthquake, Page Up and Page Down 3, Home and End go to the ends",
    },
    {
      broke: "A hover no longer moves the crosshair.",
      find: "pointermove: (event, { el, api }) => api.crosshair.pointermove(event, el!),",
      replace: "",
      caught: "pointer: a hover puts the crosshair on the earthquake nearest in time, the cross line follows the pointer, and leaving hides it",
    },
    {
      broke: "The crosshair stays on the trace after the pointer leaves it.",
      find: "pointerleave: (event, { api }) => api.crosshair.pointerleave(event),",
      replace: "",
      caught: "pointer: a hover puts the crosshair on the earthquake nearest in time, the cross line follows the pointer, and leaving hides it",
    },
    {
      broke: "The earthquakes sit at even steps by their order, not at their time of day.",
      find: "quakes().map((q) => ({ value: q.time, at: q.minute / DAY }))",
      replace: "quakes().map((q, i, all) => ({ value: q.time, at: (i + 0.5) / all.length }))",
      caught: "pointer: a hover puts the crosshair on the earthquake nearest in time, the cross line follows the pointer, and leaving hides it",
    },
    {
      broke: "With no pointer, the cross line no longer sits on the peak ground velocity.",
      find: "cross: (time) => levelOf(quakes())(quake(time)?.peak ?? 0),",
      replace: "",
      caught: "pointer: with no pointer, the vertical line sits on the earthquake's time and the cross line on its peak",
    },
    {
      broke: "An agent can no longer move or hide the crosshair.",
      find: 'actions: ["setValue", "clear"],',
      replace: "actions: [],",
      caught: "agent: an agent finds the seismograph, lists its earthquakes, moves the crosshair to 06:42, is refused 05:00, and hides it",
    },
    {
      broke: "The bridge no longer refuses a time with no earthquake.",
      find: "closed: true,",
      replace: "",
      caught: "agent: an agent finds the seismograph, lists its earthquakes, moves the crosshair to 06:42, is refused 05:00, and hides it",
    },
    {
      broke: "The status line no longer follows the crosshair.",
      find: 'chart.addEventListener("valuechange", (event) => say((event as CustomEvent<{ value: string | null }>).detail.value))',
      replace: "void chart",
      caught: "keyboard: on the page, arrows move the crosshair and the status line reads each earthquake",
    },
  ],
}

export { type Quake, makeQuakes, readout, seismograph }
export default ui
