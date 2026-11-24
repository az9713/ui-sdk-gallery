import "@ui-sdk/web/slider"
import "@ui-sdk/web/toggle"
import type { Agent, UI } from "../src/ui"

const CHANNELS = ["Kick", "Snare", "Hats", "Toms", "Bass", "Keys", "Guitar", "Vocal", "Choir", "Brass"]
const CAPS = ["#e5484d", "#f76b15", "#ffc53d", "#46a758", "#12a594", "#0090ff", "#8e4ec6", "#d6409f", "#a18072", "#cbd5e1"]
const KNOBS = [
  { name: "gain", text: "Gain", min: 0, max: 60 },
  { name: "high", text: "High", min: -12, max: 12 },
  { name: "mid", text: "Mid", min: -12, max: 12 },
  { name: "low", text: "Low", min: -12, max: 12 },
  { name: "pan", text: "Pan", min: -50, max: 50 },
  { name: "reverb", text: "Reverb", min: 0, max: 100 },
  { name: "delay", text: "Delay", min: 0, max: 100 },
]
const SWITCHES = [
  { name: "filter", text: "Filter", lamp: "green" },
  { name: "phase", text: "Phase", lamp: "green" },
  { name: "comp", text: "Comp", lamp: "green" },
  { name: "gate", text: "Gate", lamp: "green" },
  { name: "mute", text: "Mute", lamp: "red" },
  { name: "solo", text: "Solo", lamp: "amber" },
  { name: "record", text: "Record", lamp: "red" },
]
const SEGMENTS = 12

// A fixed seed gives the same console, and the same screenshot, on each run.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function strip(channel: string, index: number, random: () => number) {
  const knob = (k: (typeof KNOBS)[number]) => {
    const value = Math.round(k.min + (k.max - k.min) * (k.name === "pan" ? 0.3 + random() * 0.4 : 0.25 + random() * 0.5))
    return `
      <div class="f03-knob">
        <span class="f03-legend">${k.text}</span>
        <ui-slider min="${k.min}" max="${k.max}" step="1" default-value="${value}" data-name="${channel} ${k.name}" aria-label="${channel} ${k.name}">
          <ui-slider-control><ui-slider-track><ui-slider-indicator></ui-slider-indicator><ui-slider-thumb aria-label="${channel} ${k.name}"></ui-slider-thumb></ui-slider-track></ui-slider-control>
        </ui-slider>
      </div>`
  }
  const button = (s: (typeof SWITCHES)[number]) => {
    const on = (s.name === "filter" && random() > 0.4) || (s.name === "comp" && random() > 0.5)
    return `<ui-toggle${on ? " default-pressed" : ""} data-name="${channel} ${s.name}" data-lamp="${s.lamp}"><button><span class="f03-hidden">${channel} </span>${s.text}</button></ui-toggle>`
  }
  const level = 55 + Math.round(random() * 30)
  return `
    <section class="f03-strip" aria-labelledby="f03-ch-${index}" style="--cap: ${CAPS[index]}">
      <h3 class="f03-scribble" id="f03-ch-${index}">${index + 1} ${channel}</h3>
      <div class="f03-knobs">${KNOBS.map(knob).join("")}</div>
      <div class="f03-buttons">${SWITCHES.map(button).join("")}</div>
      <div class="f03-fader-bay">
        <div class="f03-meter" aria-hidden="true">${Array.from({ length: SEGMENTS }, (_, i) => `<i data-zone="${i >= 10 ? "red" : i >= 8 ? "amber" : "green"}"></i>`).join("")}</div>
        <ui-slider orientation="vertical" min="0" max="100" step="1" default-value="${level}" data-name="${channel} fader" aria-label="${channel} fader" data-fader>
          <ui-slider-control><ui-slider-track><ui-slider-indicator></ui-slider-indicator><ui-slider-thumb aria-label="${channel} fader"></ui-slider-thumb></ui-slider-track></ui-slider-control>
          <ui-slider-value></ui-slider-value>
        </ui-slider>
      </div>
    </section>`
}

const css = `
[data-stage] { display: grid; gap: 16px; }
[data-stage] .f03-desk { display: grid; gap: 12px; padding: 16px; border: 1px solid #3f4650; border-radius: 10px; background: #1b1e23; color: #e2e8f0; box-shadow: 0 10px 30px rgb(0 0 0 / 0.45), inset 0 1px 0 #4a525e; }
[data-stage] .f03-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 24px; }
[data-stage] .f03-head h2 { margin: 0; font-size: 1.125rem; font-weight: 600; }
[data-stage] .f03-bridge { margin: 0; max-width: 60ch; padding: 6px 10px; border: 1px solid #3f4650; border-radius: 4px; background: #0b0d10; color: #f5c46b; font-family: var(--ui-font-mono); font-size: 0.8125rem; }
[data-stage] .f03-channels { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 6px; }
[data-stage] .f03-strip { display: grid; gap: 10px; align-content: start; padding: 8px 6px 10px; border: 1px solid #3a4049; border-radius: 6px; background: #2a2f36; }
[data-stage] .f03-scribble { margin: 0; padding: 5px 8px; border: 1px solid #c9c2a8; border-radius: 2px; background: #f1ebd4; color: #1b1e23; font-size: 0.8125rem; font-weight: 600; white-space: nowrap; text-align: center; }
[data-stage] .f03-knobs { display: grid; gap: 4px; }
[data-stage] .f03-knob { display: grid; gap: 1px; }
[data-stage] .f03-legend { color: #cbd5e1; font-size: 0.75rem; }
[data-stage] .f03-knob [data-slot="slider"] { min-width: 0; }
[data-stage] .f03-knob [data-slot="slider-control"] { height: 1rem; }
[data-stage] [data-slot="slider-track"] { background: #0b0d10; box-shadow: inset 0 1px 2px #000; }
[data-stage] .f03-knob [data-slot="slider-track"] { height: 6px; }
[data-stage] [data-slot="slider-indicator"] { background: var(--cap); }
[data-stage] .f03-knob [data-slot="slider-thumb"] { width: 10px; height: 16px; border: 1px solid #111; border-radius: 2px; background: linear-gradient(90deg, #6b7380, #d5dae1 45%, #8a929e); }
[data-stage] .f03-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
[data-stage] .f03-buttons [data-slot="toggle"] { height: auto; min-width: 0; padding: 5px 4px; border: 1px solid #111; border-radius: 3px; background: #3b424c; color: #e2e8f0; font-size: 0.75rem; box-shadow: 0 2px 0 #111; }
[data-stage] .f03-buttons [data-slot="toggle"]:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 1px; }
[data-stage] [data-lamp="green"] [data-slot="toggle"][data-pressed] { background: #3ddc84; color: #0b0d10; }
[data-stage] [data-lamp="amber"] [data-slot="toggle"][data-pressed] { background: #ffc53d; color: #0b0d10; }
[data-stage] [data-lamp="red"] [data-slot="toggle"][data-pressed] { background: #ff6b6b; color: #0b0d10; }
[data-stage] .f03-fader-bay { display: flex; justify-content: center; gap: 10px; }
[data-stage] .f03-meter { display: flex; flex-direction: column-reverse; gap: 2px; padding: 3px; border: 1px solid #111; border-radius: 2px; background: #0b0d10; }
[data-stage] .f03-meter i { width: 6px; flex: 1; border-radius: 1px; background: #1f2a22; }
[data-stage] .f03-meter i[data-lit][data-zone="green"] { background: #3ddc84; }
[data-stage] .f03-meter i[data-lit][data-zone="amber"] { background: #ffc53d; }
[data-stage] .f03-meter i[data-lit][data-zone="red"] { background: #ff6b6b; }
[data-stage] [data-fader] { width: auto; min-width: 0; align-items: center; }
[data-stage] [data-fader] [data-slot="slider-control"] { height: 11rem; }
[data-stage] [data-fader] [data-slot="slider-track"] { width: 6px; }
[data-stage] [data-fader] [data-slot="slider-thumb"] { width: 30px; height: 16px; border: 1px solid #111; border-radius: 2px; background: linear-gradient(#e8ebef, #9aa2ad 44%, #1b1e23 44% 56%, #9aa2ad 56%, #5b636e); }
[data-stage] [data-fader] [data-slot="slider-value"] { min-width: 3ch; padding: 2px 6px; border-radius: 2px; background: #0b0d10; color: #f5c46b; font-size: 0.75rem; text-align: center; }
[data-stage] .f03-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
[data-stage] [data-status] { margin: 0; color: var(--ui-muted-foreground); }
@media (max-width: 1100px) { [data-stage] .f03-channels { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
`

function bridgeText(agent: Agent) {
  const snapshot = agent.snapshot()
  const last = snapshot.at(-1) as { component: string; more?: number } | undefined
  const listed = snapshot.filter((e) => e.component !== "more").length
  return last?.component === "more"
    ? `Snapshot lists ${listed} controls, then the more entry: ${last.more} more, found with query.`
    : `Snapshot lists ${listed} controls and no more entry.`
}

function mount(root: HTMLElement, { agent }: { agent: Agent }) {
  const random = seeded(150)
  root.innerHTML = `
    <div class="f03-desk">
      <div class="f03-head">
        <h2>Studio A mixing console, 150 controls</h2>
        <p class="f03-bridge" data-bridge>Snapshot not read yet.</p>
      </div>
      <div class="f03-channels">${CHANNELS.map((c, i) => strip(c, i, random)).join("")}</div>
    </div>
    <p role="status" data-status>No control has changed.</p>`
  const status = root.querySelector("[data-status]")!
  const bridge = root.querySelector("[data-bridge]")!
  const meter = (fader: HTMLElement, value: number) => {
    const lit = Math.round((value / 100) * SEGMENTS)
    fader.parentElement!.querySelectorAll("i").forEach((seg, i) => seg.toggleAttribute("data-lit", i < lit))
  }
  const report = (name: string, value: string) => {
    bridge.textContent = bridgeText(agent)
    status.textContent = `${name}: ${value}. ${bridge.textContent}`
  }
  for (const slider of root.querySelectorAll<HTMLElement>("ui-slider")) {
    if (slider.hasAttribute("data-fader")) meter(slider, Number(slider.getAttribute("default-value")))
    slider.addEventListener("valuechange", (e) => {
      const value = (e as CustomEvent<{ value: number }>).detail.value
      if (slider.hasAttribute("data-fader")) meter(slider, value)
      report(slider.dataset.name!, String(value))
    })
  }
  for (const toggle of root.querySelectorAll<HTMLElement>("ui-toggle"))
    toggle.addEventListener("pressedchange", (e) => report(toggle.dataset.name!, (e as CustomEvent<{ value: boolean }>).detail.value ? "on" : "off"))
  setTimeout(() => (bridge.textContent = bridgeText(agent)))
}

const ui: UI = {
  id: "F03",
  request: "Build a mixing console with 10 channel strips of 15 controls each, and show what the agent bridge lists for 150 controls.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Brass fader", action: "setValue", args: [85] },
      { ref: "Brass mute", action: "setPressed", args: [true] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent ===
      "Brass mute: on. Snapshot lists 100 controls, then the more entry: 50 more, found with query.",
  },
}

export default ui
