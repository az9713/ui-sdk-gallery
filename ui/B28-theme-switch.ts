import {
  type ChangeDetails,
  createChange,
  createColorScheme,
  createLocalStorage,
  createPreference,
  createRovingFocus,
  definePrimitive,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/preferences"
import { area, curveMonotoneX, line, max, min, scaleBand, scaleLinear } from "d3"
import type { UI } from "../src/ui"

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "sepia", label: "Sepia" },
] as const
type Theme = (typeof THEMES)[number]["value"]
const VALUES = THEMES.map((theme) => theme.value)
const KEY = "b28-theme"

type Reason = "item-press" | "list-navigation" | "imperative"
type Options = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, details: ChangeDetails<Reason>) => void
}
type State = { focused: string | null; value: string }

// A radio group of themes: 1 tab stop on the chosen theme, the arrow keys choose as they move, Space chooses.
const themeSwitch = definePrimitive({
  name: "theme-switch",
  options: { value: "string", defaultValue: "string", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({ focused: null, value: options.value ?? options.defaultValue ?? VALUES[0] }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus<State, { value: string }>(context, {
      slot: "choice",
      key: "focused",
      remember: false,
      preferred: (choice) => choice.key === context.store.get().value,
      claims: (state, choice) => choice.key === (VALUES.includes(state.value as Theme) ? state.value : VALUES[0]),
      orientation: () => "both",
      loop: () => true,
    })
    const pick = (value: string, reason: Reason, event?: Event) => {
      if (!VALUES.includes(value as Theme)) return false
      return change("value", value, { reason, event })
    }
    return {
      roving,
      themes: () => THEMES.map(({ value, label }) => ({ value, label })),
      setValue: (value: string) => {
        if (!VALUES.includes(value as Theme)) throw new Error(`No theme "${value}". Themes: ${VALUES.join(", ")}.`)
        return pick(value, "imperative")
      },
      press: (value: string, event?: Event) => void pick(value, "item-press", event),
      keydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (event.defaultPrevented) return
        const moved = roving.keydown(event, el)
        if (moved) return void pick(moved.key, "list-navigation", event)
        if (event.key === " ") {
          event.preventDefault()
          pick(key, "item-press", event)
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({ role: "radiogroup", keys: { none: "Each radio handles the arrow keys." } }),
    choice: slot<{ value: string }>({
      role: "radio",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, { key, props, api }) => ({
        tabindex: api.roving.tabIndex(state, { key, props }),
        "aria-checked": String(state.value === key),
        "data-checked": state.value === key ? "" : undefined,
      }),
      press: ({ api, key }, event) => api.press(key, event),
      on: {
        // A radio is not a button, so press hears only its clicks.
        keydown: (event, { el, api, key }) => api.keydown(event, el!, key),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
  agent: { actions: ["setValue"], closed: true, items: (api) => api.themes() },
})

createParts(themeSwitch, {
  root: { tag: "b28-theme-switch", display: "block" },
  choice: { tag: "b28-theme-choice", display: "block" },
})

type Day = { name: string; sky: string; high: number; low: number; rain: number }

// Mulberry32: the same 7 days on each run.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
// The rain of a day comes first, then its sky and its temperatures follow from it.
const forecast = (): Day[] => {
  const next = seeded(28)
  return NAMES.map((name, i) => {
    const wet = next() < 0.45
    const rain = wet ? Math.round((2 + next() * 10) * 10) / 10 : 0
    const sky = rain > 6 ? "Rain" : rain > 0 ? "Showers" : next() < 0.5 ? "Sunny" : "Cloudy"
    const high = Math.round(24 + 3 * Math.sin(i * 0.9) - rain * 0.4 + next() * 2)
    const low = Math.round(high - 8 - next() * 3)
    return { name, sky, high, low, rain }
  })
}

const W = 700
const H = 240
const TOP = 52
const BOTTOM = 112
const BARS = 78
const RAIN_MAX = 12

function chart(days: Day[]) {
  const x = scaleBand<string>().domain(days.map((day) => day.name)).range([0, W])
  const temp = scaleLinear()
    .domain([min(days, (day) => day.low)! - 1, max(days, (day) => day.high)! + 1])
    .range([BOTTOM, TOP])
  const rain = scaleLinear().domain([0, RAIN_MAX]).range([0, BARS])
  const at = (day: Day) => x(day.name)! + x.bandwidth() / 2
  const path = (value: (day: Day) => number) =>
    line<Day>().x(at).y((day) => temp(value(day))).curve(curveMonotoneX)(days)!
  const band = area<Day>().x(at).y0((day) => temp(day.low)).y1((day) => temp(day.high)).curve(curveMonotoneX)(days)!
  const grid = temp.ticks(3).map((tick) => `<line x1="0" x2="${W}" y1="${temp(tick)}" y2="${temp(tick)}"/>`).join("")
  const bars = days
    .map((day) => {
      const height = rain(Math.min(day.rain, RAIN_MAX))
      return `<rect data-bar x="${at(day) - 22}" y="${H - height}" width="44" height="${height}" rx="3"/>`
    })
    .join("")
  const dots = (value: (day: Day) => number, kind: string) =>
    days.map((day) => `<circle data-dot="${kind}" cx="${at(day)}" cy="${temp(value(day))}" r="4.5"/>`).join("")
  const label = (day: Day, kind: "high" | "low") =>
    `<span data-point="${kind}" style="left:${((at(day) / W) * 100).toFixed(2)}%;top:${((temp(day[kind]) / H) * 100).toFixed(2)}%">${day[kind]}°</span>`
  return `
  <div data-chart>
    <svg viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">
      <g data-grid>${grid}</g>
      ${bars}
      <path data-band d="${band}"/>
      <path data-line="high" d="${path((day) => day.high)}"/>
      <path data-line="low" d="${path((day) => day.low)}"/>
      ${dots((day) => day.high, "high")}${dots((day) => day.low, "low")}
    </svg>
    <div data-points aria-hidden="true">${days.map((day) => label(day, "high") + label(day, "low")).join("")}</div>
  </div>`
}

const html = (days: Day[], theme: string) => {
  const today = days[0]
  return `
<ui-preferences>
<div data-panel>
  <header data-head>
    <div>
      <h2>Lisbon, 7-day forecast</h2>
      <p data-now>Now <strong>${today.high - 2}°</strong> and ${today.sky.toLowerCase()}</p>
    </div>
    <b28-theme-switch aria-label="Theme" value="${theme}">
      ${THEMES.map(({ value, label }) => `<b28-theme-choice value="${value}"><span data-swatch aria-hidden="true"></span>${label}</b28-theme-choice>`).join("")}
    </b28-theme-switch>
  </header>
  <p data-legend aria-hidden="true"><span data-key="high">High</span><span data-key="low">Low</span><span data-key="rain">Rain, mm</span></p>
  ${chart(days)}
  <ul data-days aria-label="Daily forecast">
    ${days
      .map(
        (day) => `<li>
      <span data-day>${day.name}</span>
      <span data-sky>${day.sky}</span>
      <span><span data-sr>High </span><b>${day.high}°</b></span>
      <span data-muted><span data-sr>Low </span>${day.low}°</span>
      <span data-muted>${day.rain} mm<span data-sr> rain</span></span>
    </li>`,
      )
      .join("")}
  </ul>
  <p role="status" data-status></p>
</div>
</ui-preferences>`
}

const css = `
[data-stage] { display: block; width: min(100%, 760px); }
[data-stage] h2, [data-stage] p, [data-stage] ul { margin: 0; }
[data-stage] ui-preferences {
  --b28-bg: #eef2f7; --b28-card: #ffffff; --b28-text: #0f1b2d; --b28-muted: #475569; --b28-edge: #64748b; --b28-line: #cbd5e1;
  --b28-high: #c2410c; --b28-low: #0e7490; --b28-rain: #2563eb; --b28-accent: #1d4ed8; --b28-on-accent: #ffffff;
  display: block;
}
[data-stage] [data-panel] {
  display: grid; gap: 16px; padding: 20px; border: 1px solid var(--b28-line); border-radius: 12px;
  background: var(--b28-bg); color: var(--b28-text); transition: background-color 0.25s, color 0.25s;
}
[data-stage] ui-preferences[data-theme="dark"] {
  --b28-bg: #0b1220; --b28-card: #162033; --b28-text: #e6edf7; --b28-muted: #a8b5c9; --b28-edge: #8190a8; --b28-line: #2c3a52;
  --b28-high: #fb923c; --b28-low: #5eead4; --b28-rain: #60a5fa; --b28-accent: #93c5fd; --b28-on-accent: #0b1220;
}
[data-stage] ui-preferences[data-theme="sepia"] {
  --b28-bg: #ead9b8; --b28-card: #f5ebd3; --b28-text: #3a2a18; --b28-muted: #5c4630; --b28-edge: #8a7355; --b28-line: #cdb88e;
  --b28-high: #a3340f; --b28-low: #4d6b3a; --b28-rain: #3b6a8f; --b28-accent: #7c2d12; --b28-on-accent: #fdf6e3;
}
[data-stage] [data-head] { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 12px 20px; }
[data-stage] h2 { font-size: 1.125rem; font-weight: 600; }
[data-stage] [data-now] { margin-top: 4px; color: var(--b28-muted); }
[data-stage] [data-now] strong { color: var(--b28-text); font-size: 1.5rem; }
[data-stage] b28-theme-switch { display: flex; gap: 6px; }
[data-stage] b28-theme-choice {
  display: flex; align-items: center; gap: 8px; padding: 6px 14px 6px 8px; min-height: 36px; box-sizing: border-box;
  border: 1px solid var(--b28-edge); border-radius: 999px; background: var(--b28-card); color: var(--b28-text);
  font-size: 0.875rem; cursor: pointer; user-select: none;
}
[data-stage] b28-theme-choice[data-checked] { border-color: var(--b28-accent); background: var(--b28-accent); color: var(--b28-on-accent); font-weight: 600; }
[data-stage] b28-theme-choice:focus-visible { outline: 2px solid var(--b28-text); outline-offset: 2px; }
[data-stage] [data-swatch] {
  width: 20px; height: 20px; box-sizing: border-box; border: 6px solid #1d4ed8; border-radius: 50%; background: #ffffff;
}
[data-stage] b28-theme-choice[value="dark"] [data-swatch] { border-color: #fb923c; background: #0b1220; }
[data-stage] b28-theme-choice[value="sepia"] [data-swatch] { border-color: #7c2d12; background: #ead9b8; }
[data-stage] [data-legend] { display: flex; flex-wrap: wrap; gap: 6px 16px; color: var(--b28-muted); font-size: 0.8125rem; }
[data-stage] [data-key]::before { content: ""; display: inline-block; width: 12px; height: 12px; margin-inline-end: 6px; vertical-align: -1px; border-radius: 3px; background: var(--b28-rain); }
[data-stage] [data-key="high"]::before { background: var(--b28-high); }
[data-stage] [data-key="low"]::before { background: var(--b28-low); }
[data-stage] [data-chart] {
  position: relative; aspect-ratio: ${W} / ${H}; border: 1px solid var(--b28-line); border-radius: 10px; background: var(--b28-card);
}
[data-stage] [data-chart] svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
[data-stage] [data-grid] line { stroke: var(--b28-line); stroke-width: 1; stroke-dasharray: 4 6; }
[data-stage] [data-bar] { fill: var(--b28-rain); fill-opacity: 0.55; }
[data-stage] [data-band] { fill: var(--b28-high); fill-opacity: 0.14; }
[data-stage] [data-line] { fill: none; stroke-width: 3; stroke-linecap: round; }
[data-stage] [data-line="high"] { stroke: var(--b28-high); }
[data-stage] [data-line="low"] { stroke: var(--b28-low); }
[data-stage] [data-dot] { stroke: var(--b28-card); stroke-width: 2; }
[data-stage] [data-dot="high"] { fill: var(--b28-high); }
[data-stage] [data-dot="low"] { fill: var(--b28-low); }
[data-stage] [data-points] { position: absolute; inset: 0; }
[data-stage] [data-point] { position: absolute; transform: translate(-50%, -150%); padding: 0 4px; border-radius: 4px; background: var(--b28-card); font-size: 0.8125rem; font-weight: 600; color: var(--b28-text); }
[data-stage] [data-point="low"] { transform: translate(-50%, 50%); }
[data-stage] [data-days] { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(7, 1fr); }
[data-stage] [data-days] li { display: grid; gap: 2px; justify-items: center; text-align: center; font-size: clamp(0.6875rem, 2.6vw, 0.8125rem); white-space: nowrap; font-variant-numeric: tabular-nums; }
[data-stage] [data-day] { font-weight: 600; }
[data-stage] [data-muted], [data-stage] [data-sky] { color: var(--b28-muted); }
[data-stage] [data-sr] { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
[data-stage] [data-status] { color: var(--b28-muted); }
@media (prefers-reduced-motion: reduce) { [data-stage] [data-panel] { transition: none; } }
`

const nameOf = (value: string) => THEMES.find((theme) => theme.value === value)?.label ?? value

function mount(root: HTMLElement) {
  const storage = createLocalStorage(KEY)
  const saved = storage.get()
  // Before anything is saved, the theme follows the browser's preference once.
  const system = createColorScheme()
  const stopSystem = system.subscribe(() => {})
  const fallback: Theme = system.get().resolved === "dark" ? "dark" : "light"
  stopSystem()
  const kept = VALUES.find((value) => value === saved)
  const theme = createPreference({ values: VALUES, defaultValue: fallback, attribute: "data-theme", storage })

  root.innerHTML = html(forecast(), kept ?? fallback)
  const status = root.querySelector("[data-status]")!
  const panel = root.querySelector("ui-preferences")!
  const control = root.querySelector("b28-theme-switch")!
  status.textContent = kept
    ? `Restored your saved ${nameOf(kept)} theme.`
    : `Theme: ${nameOf(fallback)}, from your browser. Nothing is saved.`
  panel.preferences = [theme]

  const stop = theme.subscribe(() => control.setAttribute("value", theme.get().value))
  const change = (event: Event) => {
    const next = (event as CustomEvent<{ value: Theme }>).detail.value
    if (next === theme.get().value) return
    theme.set(next, { reason: "item-press" })
    status.textContent = `Saved the ${nameOf(next)} theme.`
  }
  control.addEventListener("valuechange", change)
  return () => {
    stop()
    control.removeEventListener("valuechange", change)
    panel.preferences = []
  }
}

const ui: UI = {
  id: "B28",
  request:
    "Build a weather forecast page with a Light, Dark and Sepia theme switch that the page remembers, so the theme is still set on the next visit.",
  css,
  mount,
  task: {
    steps: [{ ref: "Theme", action: "setValue", args: ["Sepia"] }],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Saved the Sepia theme." &&
      root.querySelector("ui-preferences")!.getAttribute("data-theme") === "sepia",
  },
  breaks: [
    {
      broke: "The arrow keys move focus but no longer choose a theme.",
      find: 'if (moved) return void pick(moved.key, "list-navigation", event)',
      replace: "if (moved) return",
      caught: "keyboard: the arrow keys choose a theme as they move, and the group is 1 tab stop on the chosen one",
    },
    {
      broke: "Space no longer chooses a theme.",
      find: 'if (event.key === " ") {',
      replace: "if (false) {",
      caught: "keyboard: Space chooses the focused theme, and a click chooses a theme",
    },
    {
      broke: "A choice is not written to local storage.",
      find: "theme.set(next, { reason: \"item-press\" })",
      replace: "void next",
      caught: "storage: a chosen theme is kept in local storage, and the next mount restores it",
    },
    {
      broke: "A saved theme is not read back on the next visit.",
      find: "const kept = VALUES.find((value) => value === saved)",
      replace: "const kept = undefined",
      caught: "storage: a chosen theme is kept in local storage, and the next mount restores it",
    },
    {
      broke: "The browser's preference no longer sets the first theme.",
      find: 'const fallback: Theme = system.get().resolved === "dark" ? "dark" : "light"',
      replace: 'const fallback: Theme = "light"',
      caught: "storage: with nothing saved, the first theme follows the browser's preference and nothing is written",
    },
    {
      broke: "An agent can set a theme that does not exist.",
      find: "if (!VALUES.includes(value as Theme)) throw",
      replace: "if (false) throw",
      caught: "agent: the primitive offers setValue for the 3 themes, and a theme that does not exist throws",
    },
  ],
}

export { themeSwitch }
export default ui
