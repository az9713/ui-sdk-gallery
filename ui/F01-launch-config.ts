import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/radio"
import "@ui-sdk/web/select"
import "@ui-sdk/web/slider"
import { gsap } from "gsap"
import type { UI } from "../src/ui"

const vehicles = [
  { value: "corvid-1", label: "Corvid 1", capacity: { leo: 1200, sso: 900, gto: 400 }, lift: 0.8 },
  { value: "corvid-9", label: "Corvid 9", capacity: { leo: 16000, sso: 12500, gto: 5500 }, lift: 1 },
  { value: "corvid-heavy", label: "Corvid Heavy", capacity: { leo: 52000, sso: 40000, gto: 21000 }, lift: 1.15 },
] as const
const orbits = [
  { value: "leo", label: "Low Earth", short: "LEO", altitude: "400 km", height: 110 },
  { value: "sso", label: "Sun-synchronous", short: "SSO", altitude: "550 km", height: 140 },
  { value: "gto", label: "Geostationary transfer", short: "GTO", altitude: "35,786 km apogee", height: 185 },
] as const
type Orbit = (typeof orbits)[number]["value"]

const START = { name: "Perigee-6", vehicle: "corvid-9", orbit: "leo" as Orbit, mass: 3000 }
const MIN_MASS = 500
const MAX_MASS = 20000
const STEP_MASS = 500

const W = 480
const H = 260
const PAD_X = 36
const GROUND = 226

const kg = (n: number) => `${n.toLocaleString("en-US")} kg`

// Seeded so the star field is the same in each screenshot.
function stars(count: number) {
  let seed = 7
  const next = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  return Array.from({ length: count }, () => {
    const x = (next() * W).toFixed(1)
    const y = (next() * (GROUND - 40)).toFixed(1)
    const r = (0.6 + next() * 1.1).toFixed(2)
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#cbd5e1" fill-opacity="${(0.35 + next() * 0.5).toFixed(2)}"/>`
  }).join("")
}

type Config = typeof START
type Shape = { h: number; range: number }

const vehicleOf = (config: Config) => vehicles.find((v) => v.value === config.vehicle)!
const orbitOf = (config: Config) => orbits.find((o) => o.value === config.orbit)!
const capacityOf = (config: Config) => vehicleOf(config).capacity[config.orbit]

function shapeOf(config: Config): Shape {
  const spare = Math.min(1, Math.max(0, 1 - config.mass / capacityOf(config)))
  return { h: orbitOf(config).height * vehicleOf(config).lift, range: 170 + 230 * spare }
}

const curve = ({ h, range }: Shape) => {
  const top = GROUND - Math.min(h, GROUND - 24)
  const end = Math.min(PAD_X + range, W - 16)
  return [PAD_X, GROUND, PAD_X, GROUND - (GROUND - top) * 0.7, PAD_X + (end - PAD_X) * 0.3, top, end, top] as const
}
const pathOf = (shape: Shape) => {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = curve(shape)
  return `M${x0} ${y0} C${x1} ${y1.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}, ${x3.toFixed(1)} ${y3.toFixed(1)}`
}
const pointAt = (shape: Shape, t: number) => {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = curve(shape)
  const u = 1 - t
  const at = (a: number, b: number, c: number, d: number) => u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
  const slope = (a: number, b: number, c: number, d: number) => 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c)
  return { x: at(x0, x1, x2, x3), y: at(y0, y1, y2, y3), angle: (Math.atan2(slope(y0, y1, y2, y3), slope(x0, x1, x2, x3)) * 180) / Math.PI }
}

const scene = () => `
<svg data-trajectory viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">
  <rect width="${W}" height="${H}" fill="#0b1220"/>
  <g>${stars(60)}</g>
  <path d="M0 ${GROUND + 8} Q${W / 2} ${GROUND - 14} ${W} ${GROUND + 8} V${H} H0 Z" fill="#1e3a5f"/>
  <path d="M0 ${GROUND + 8} Q${W / 2} ${GROUND - 14} ${W} ${GROUND + 8}" fill="none" stroke="#2dd4bf" stroke-opacity="0.5" stroke-width="1.5"/>
  <path d="M${PAD_X - 10} ${GROUND} h20 M${PAD_X - 6} ${GROUND} v-16 M${PAD_X + 6} ${GROUND} v-16" stroke="#94a3b8" stroke-width="2"/>
  <line data-orbit-line x1="0" x2="${W}" stroke="#2dd4bf" stroke-width="1.5" stroke-dasharray="6 6"/>
  <path data-path fill="none" stroke="#fb923c" stroke-width="3" stroke-linecap="round"/>
  <circle data-insertion r="5" fill="#0b1220" stroke="#2dd4bf" stroke-width="2"/>
  <g data-rocket><path d="M10 0 L-6 -5 L-3 0 L-6 5 Z" fill="#f8fafc"/><path d="M-6 -2 L-12 0 L-6 2 Z" fill="#fb923c"/></g>
</svg>`

const html = `
<div data-console>
  <section data-form aria-labelledby="f01-form-title">
    <h2 id="f01-form-title">Launch configuration</h2>
    <ui-field>
      <ui-field-label>Mission name</ui-field-label>
      <ui-input><input value="${START.name}" /></ui-input>
    </ui-field>
    <ui-field>
      <ui-field-label>Launch vehicle</ui-field-label>
      <ui-select default-value="${START.vehicle}">
        <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
        <ui-select-content>
          ${vehicles.map((v) => `<ui-select-item value="${v.value}">${v.label}</ui-select-item>`).join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
    <ui-field>
      <ui-field-label>Target orbit</ui-field-label>
      <ui-radio-group default-value="${START.orbit}">
        ${orbits.map((o) => `<label data-slot="label"><ui-radio value="${o.value}"><ui-radio-indicator></ui-radio-indicator></ui-radio>${o.label}</label>`).join("")}
      </ui-radio-group>
    </ui-field>
    <ui-field>
      <ui-slider aria-label="Payload mass" default-value="${START.mass}" min="${MIN_MASS}" max="${MAX_MASS}" step="${STEP_MASS}">
        <div data-row>
          <ui-field-label>Payload mass</ui-field-label>
          <span data-mass>${kg(START.mass)}</span>
        </div>
        <ui-slider-control>
          <ui-slider-track>
            <ui-slider-indicator></ui-slider-indicator>
            <ui-slider-thumb></ui-slider-thumb>
          </ui-slider-track>
        </ui-slider-control>
      </ui-slider>
    </ui-field>
    <p role="status" data-status></p>
  </section>
  <section data-control aria-labelledby="f01-control-title">
    <h2 id="f01-control-title">Mission control</h2>
    ${scene()}
    <dl data-telemetry>
      <div><dt>Orbit</dt><dd data-read="orbit"></dd></div>
      <div><dt>Capacity</dt><dd data-read="capacity"></dd></div>
      <div><dt>Margin</dt><dd data-read="margin"></dd></div>
      <div><dt>Changes</dt><dd data-read="changes"></dd></div>
    </dl>
    <ol data-log aria-label="Change log"></ol>
  </section>
</div>`

const css = `
[data-stage] [data-console] { display: flex; flex-wrap: wrap; gap: 24px; align-items: start; }
[data-stage] h2 { margin: 0; font-size: 1.125rem; font-weight: 600; }
[data-stage] p, [data-stage] dl, [data-stage] dd, [data-stage] ol { margin: 0; }
[data-stage] [data-form] { display: grid; gap: 18px; width: min(100%, 320px); }
[data-stage] ui-radio-group { display: grid; gap: 8px; }
[data-stage] ui-slider { display: grid; gap: 8px; }
[data-stage] [data-row] { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
[data-stage] [data-mass] { font-variant-numeric: tabular-nums; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); max-width: 60ch; }
[data-stage] [data-control] {
  display: grid; gap: 14px; width: min(100%, 520px); padding: 18px;
  border: 1px solid #334155; border-radius: 10px; background: #0f172a; color: #e2e8f0;
}
[data-stage] [data-trajectory] { display: block; width: 100%; height: auto; border-radius: 6px; }
[data-stage] [data-telemetry] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px; }
[data-stage] [data-telemetry] dt { color: #94a3b8; font-size: 0.875rem; }
[data-stage] [data-telemetry] dd { font-variant-numeric: tabular-nums; font-weight: 600; }
[data-stage] [data-read="margin"][data-short] { color: #fda4af; }
[data-stage] [data-log] { display: grid; gap: 4px; padding-left: 20px; color: #cbd5e1; font-size: 0.875rem; }
[data-stage] [data-log]:empty { display: none; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  const config: Config = { ...START }
  const counts = { agent: 0, person: 0 }
  const status = root.querySelector("[data-status]")!
  const log = root.querySelector("[data-log]")!
  const read = (key: string) => root.querySelector<HTMLElement>(`[data-read="${key}"]`)!
  const svg = root.querySelector<SVGSVGElement>("[data-trajectory]")!
  const path = svg.querySelector("[data-path]")!
  const orbitLine = svg.querySelector("[data-orbit-line]")!
  const insertion = svg.querySelector("[data-insertion]")!
  const rocket = svg.querySelector("[data-rocket]")!
  const shown: Shape = shapeOf(config)
  const flight = { t: calm() ? 1 : 0.55 }

  const place = () => {
    const [, , , , , top, end] = curve(shown)
    path.setAttribute("d", pathOf(shown))
    orbitLine.setAttribute("y1", top.toFixed(1))
    orbitLine.setAttribute("y2", top.toFixed(1))
    insertion.setAttribute("cx", end.toFixed(1))
    insertion.setAttribute("cy", top.toFixed(1))
    const p = pointAt(shown, flight.t)
    rocket.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.angle.toFixed(1)})`)
  }

  const report = () => {
    const capacity = capacityOf(config)
    const margin = capacity - config.mass
    const orbit = orbitOf(config)
    read("orbit").textContent = `${orbit.short}, ${orbit.altitude}`
    read("capacity").textContent = kg(capacity)
    read("margin").textContent = margin >= 0 ? kg(margin) : `${kg(-margin)} short`
    read("margin").toggleAttribute("data-short", margin < 0)
    read("changes").textContent = `Agent ${counts.agent}, person ${counts.person}`
    root.querySelector("[data-mass]")!.textContent = kg(config.mass)
    const fit = margin >= 0 ? `${kg(margin)} margin` : `${kg(-margin)} over capacity`
    status.textContent = `${config.name} on ${vehicleOf(config).label} to ${orbit.short}, ${kg(config.mass)} payload, ${fit}.`
    svg.dataset.orbit = config.orbit
    svg.dataset.vehicle = config.vehicle
    svg.dataset.mass = String(config.mass)
  }

  const fly = () => {
    const target = shapeOf(config)
    if (calm()) {
      Object.assign(shown, target)
      place()
      return
    }
    gsap.to(shown, { ...target, duration: 0.7, ease: "power2.inOut", overwrite: true, onUpdate: place })
    gsap.fromTo(orbitLine, { attr: { "stroke-opacity": 1 } }, { attr: { "stroke-opacity": 0.6 }, duration: 0.7, overwrite: true })
  }

  const change = (field: string, apply: (value: never) => string) => (event: Event) => {
    const { value, source } = (event as CustomEvent<{ value: unknown; source?: string }>).detail
    const who = source === "agent" ? "agent" : "person"
    counts[who] += 1
    const text = apply(value as never)
    const line = document.createElement("li")
    line.textContent = `${who === "agent" ? "Agent" : "Person"} set ${field} to ${text}`
    log.prepend(line)
    while (log.children.length > 4) log.lastElementChild!.remove()
    report()
    fly()
  }

  const on = (selector: string, handler: (event: Event) => void) => root.querySelector(selector)!.addEventListener("valuechange", handler)
  on("ui-input", change("Mission name", (value: string) => (config.name = value)))
  on("ui-select", change("Launch vehicle", (value: string) => vehicles.find((v) => v.value === (config.vehicle = value))!.label))
  on("ui-radio-group", change("Target orbit", (value: Orbit) => orbits.find((o) => o.value === (config.orbit = value))!.short))
  on("ui-slider", change("Payload mass", (value: number) => kg((config.mass = value))))

  report()
  place()
  if (!calm()) {
    const coast: gsap.core.Tween = gsap.fromTo(
      flight,
      { t: 0 },
      {
        t: 1,
        duration: 5,
        ease: "power1.in",
        repeat: -1,
        repeatDelay: 0.6,
        delay: 1.2,
        onUpdate: () => (root.isConnected ? place() : coast.kill()),
      },
    )
  }
}

const ui: UI = {
  id: "F01",
  request:
    "Build a rocket launch configuration form with a mission name, a launch vehicle, a target orbit and a payload mass, and a mission control view whose trajectory follows each change.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Mission name", action: "setValue", args: ["Perigee-7"] },
      { ref: "Launch vehicle", action: "setValue", args: ["Corvid Heavy"] },
      { ref: "Target orbit", action: "setValue", args: ["gto"] },
      { ref: "Payload mass", action: "setValue", args: [6500] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Perigee-7 on Corvid Heavy to GTO, 6,500 kg payload, 14,500 kg margin." &&
      root.querySelector("[data-read=changes]")!.textContent === "Agent 4, person 0",
  },
}

export default ui
