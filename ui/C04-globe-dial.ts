import { type ChangeDetails, createChange, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import {
  AmbientLight,
  BackSide,
  CanvasTexture,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from "three"
import { createRotary, type RotaryReason } from "../src/behaviors/rotary"
import type { UI } from "../src/ui"

type Options = {
  min: number
  max: number
  step: number
  largeStep?: number
  value?: number
  defaultValue?: number
  onValueChange?: (value: number, details: ChangeDetails<RotaryReason>) => void
}
// The range is an option that the dial renders from, so the state has a copy: a part must not read an option.
type State = { value: number; min: number; max: number; step: number; largeStep?: number }

// -180 and 180 are the same meridian, so both read as 180.
const degrees = (lon: number) => Math.abs(Math.abs(lon) === 180 ? 180 : lon)
const said = (lon: number) => `${degrees(lon)}°${lon === 0 || Math.abs(lon) === 180 ? "" : lon > 0 ? " E" : " W"}`
const spoken = (lon: number) => `${degrees(lon)} degrees${lon === 0 || Math.abs(lon) === 180 ? "" : lon > 0 ? " east" : " west"}`

const globeDial = definePrimitive({
  name: "globe-dial",
  options: {
    min: "number",
    max: "number",
    step: "number",
    largeStep: "number",
    value: "number",
    defaultValue: "number",
    onValueChange: "callback",
  },
  controlled: ["value"],
  state: (options: Options): State => ({
    value: options.value ?? options.defaultValue ?? options.min,
    min: options.min,
    max: options.max,
    step: options.step,
    largeStep: options.largeStep,
  }),
  sync: (options) => ({
    min: options.min,
    max: options.max,
    step: options.step,
    largeStep: options.largeStep,
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: (context) => {
    const change = createChange(context)
    const rotary = createRotary(context, {
      value: (state) => state.value,
      set: (value, details) => change("value", value, details),
      range: () => context.store.get(),
      wrap: () => true,
      valueText: spoken,
    })
    return { rotary, setValue: (value: number) => rotary.set(Number(value)) }
  },
  slots: (slot) => ({
    root: slot({
      role: "slider",
      focus: "tab-stop",
      keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"],
      attrs: (state, { api }) => ({ ...api.rotary.attrs(state), style: api.rotary.style(state) }),
      on: {
        keydown: (event, { api }) => void api.rotary.keydown(event),
        pointerdown: (event, { el, api }) => api.rotary.pointerdown(event, el!),
      },
    }),
  }),
  agent: { actions: ["setValue"] },
})

createParts(globeDial, { root: { tag: "c04-globe", display: "block", api: ["setValue"] } })

type City = { name: string; lon: number; lat: number }
const CITIES: City[] = [
  { name: "Honolulu", lon: -158, lat: 21 },
  { name: "New York", lon: -74, lat: 41 },
  { name: "Reykjavik", lon: -22, lat: 64 },
  { name: "London", lon: 0, lat: 51 },
  { name: "Cairo", lon: 31, lat: 30 },
  { name: "Mumbai", lon: 73, lat: 19 },
  { name: "Tokyo", lon: 140, lat: 36 },
]
const START = 20
// A city is in front when it is this many degrees or fewer from the meridian that faces the viewer.
const NEAR = 10
const apart = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
const inFront = (lon: number) =>
  CITIES.map((city) => ({ city, by: apart(city.lon, lon) }))
    .filter((c) => c.by <= NEAR)
    .sort((a, b) => a.by - b.by)[0]?.city
const report = (lon: number) => {
  const city = inFront(lon)
  return `Facing ${said(lon)}. ${city ? `${city.name} is in front.` : "No city in front."}`
}

// SphereGeometry puts longitude -90 at +z, toward the camera, so the turn that brings a longitude to the front is -(lon + 90) degrees.
const spinFor = (lon: number) => (-(lon + 90) * Math.PI) / 180
// The point on a sphere of the given radius where three's SphereGeometry maps this longitude and latitude.
const pointOn = (lon: number, lat: number, radius: number): [number, number, number] => {
  const phi = ((lon + 180) / 360) * Math.PI * 2
  const theta = ((90 - lat) / 180) * Math.PI
  return [-radius * Math.cos(phi) * Math.sin(theta), radius * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta)]
}

// Coarse coastlines as [longitude, latitude] rings. Hand-made, so the globe needs no data file.
const LAND: [number, number][][] = [
  [[-168, 66], [-162, 70], [-140, 70], [-125, 70], [-95, 72], [-80, 73], [-62, 66], [-55, 52], [-66, 45], [-70, 41], [-76, 35], [-81, 31], [-80, 25], [-82, 28], [-84, 30], [-90, 29], [-97, 27], [-97, 21], [-92, 18], [-87, 21], [-88, 15], [-83, 9], [-79, 9], [-86, 13], [-92, 15], [-105, 20], [-110, 24], [-112, 31], [-117, 32], [-121, 35], [-124, 40], [-124, 48], [-130, 55], [-140, 60], [-152, 58], [-158, 56], [-165, 60]],
  [[-73, 78], [-60, 82], [-30, 83], [-20, 75], [-22, 70], [-40, 65], [-44, 60], [-50, 64], [-55, 70]],
  [[-80, 9], [-75, 11], [-62, 11], [-52, 5], [-35, -5], [-38, -13], [-40, -22], [-48, -26], [-53, -34], [-58, -38], [-65, -42], [-68, -50], [-70, -55], [-74, -52], [-73, -40], [-71, -30], [-70, -18], [-76, -14], [-81, -5], [-80, 0], [-78, 7]],
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [2, 51], [8, 54], [10, 58], [5, 62], [15, 69], [25, 71], [40, 68], [60, 70], [80, 73], [100, 77], [120, 73], [140, 72], [160, 70], [180, 68], [180, 65], [170, 60], [160, 58], [157, 51], [143, 59], [135, 54], [140, 48], [132, 43], [128, 38], [126, 35], [121, 39], [122, 31], [118, 24], [110, 21], [108, 16], [106, 10], [100, 13], [100, 6], [104, 1], [98, 8], [97, 17], [92, 21], [88, 22], [80, 15], [77, 8], [73, 17], [72, 21], [67, 25], [57, 25], [56, 27], [50, 30], [48, 29], [51, 24], [56, 26], [59, 22], [52, 16], [43, 13], [39, 21], [35, 28], [34, 31], [36, 36], [30, 36], [27, 37], [26, 40], [23, 38], [22, 37], [20, 40], [19, 42], [13, 45], [12, 44], [18, 40], [15, 38], [12, 42], [9, 44], [3, 43], [0, 39], [-5, 36]],
  [[-17, 15], [-17, 21], [-13, 28], [-6, 36], [10, 37], [11, 33], [20, 31], [32, 31], [34, 28], [39, 16], [43, 12], [51, 12], [50, 2], [40, -5], [40, -15], [35, -24], [33, -28], [27, -34], [20, -35], [18, -30], [14, -22], [12, -13], [13, -6], [9, -1], [9, 4], [5, 6], [-2, 5], [-8, 4], [-13, 8]],
  [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [141, -38], [131, -31], [117, -35], [114, -29]],
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
  [[-5, 50], [1, 51], [2, 53], [-2, 57], [-5, 58], [-6, 56], [-3, 54]],
  [[130, 31], [131, 34], [136, 35], [140, 36], [142, 40], [141, 45], [144, 43], [140, 41], [139, 38], [137, 37], [133, 35], [130, 33]],
  [[95, 5], [105, -6], [106, -3], [98, 4]],
  [[109, 1], [117, 7], [119, 1], [116, -4], [110, -3]],
  [[131, -1], [141, -3], [150, -10], [141, -9], [137, -5]],
  [[-24, 65], [-14, 66], [-14, 64], [-22, 63]],
  [[172, -35], [178, -38], [174, -41], [168, -46], [172, -41]],
  [[-180, -70], [180, -70], [180, -90], [-180, -90]],
]
const INK = { ocean: "#12355b", grid: "#2b5d8a", land: "#6f9a5a", ice: "#e2e8f0", city: "#e2e8f0", here: "#fb923c", air: "#2dd4bf" }
const TILT = 0.38
const DIAL = 320
const BALL = 248

const at = (angle: number, radius: number) => {
  const rad = (angle * Math.PI) / 180
  return [(DIAL / 2 + radius * Math.sin(rad)).toFixed(2), (DIAL / 2 - radius * Math.cos(rad)).toFixed(2)]
}
const tick = (angle: number, from: number, to: number, major: boolean) => {
  const [x1, y1] = at(angle, from)
  const [x2, y2] = at(angle, to)
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${major ? ' data-major=""' : ""} />`
}
// 36 ticks, 1 for each 10 degrees of longitude, with a long tick each 30 degrees.
const TICKS = Array.from({ length: 36 }, (_, i) => tick(i * 10, 144, i % 3 ? 151 : 156, i % 3 === 0)).join("")
const [nx1, ny1] = at(0, 128)
const [nx2, ny2] = at(0, 140)
const C = DIAL / 2

const html = `
<h2>World dial</h2>
<div data-layout>
  <div data-dial>
    <span data-mark="n" aria-hidden="true">0°</span>
    <span data-mark="e" aria-hidden="true">90° E</span>
    <span data-mark="s" aria-hidden="true">180°</span>
    <span data-mark="w" aria-hidden="true">90° W</span>
    <c04-globe aria-label="Longitude" min="-180" max="180" step="1" large-step="15" default-value="${START}">
      <svg data-ring viewBox="0 0 ${DIAL} ${DIAL}" aria-hidden="true" focusable="false">
        <circle data-bezel cx="${C}" cy="${C}" r="148" />
        <g data-scale>${TICKS}</g>
        <g data-turn><line data-needle x1="${nx1}" y1="${ny1}" x2="${nx2}" y2="${ny2}" /><circle data-tip cx="${C}" cy="${C - 146}" r="5" /></g>
      </svg>
      <canvas data-scene aria-hidden="true"></canvas>
    </c04-globe>
  </div>
  <div data-side>
    <p data-readout aria-hidden="true">${said(START)}</p>
    <p data-legend>Turn the globe to a city</p>
    <div data-cities>
      ${CITIES.map((city) => `<ui-button data-city="${city.name}"><button>${city.name}</button></ui-button>`).join("")}
    </div>
    <p role="status" data-status>${report(START)}</p>
    <p data-hint>Drag the ring around the globe to turn it, or focus it and press the arrow keys: Right and Up turn east, Left and Down turn west, Page Up and Page Down turn 15 degrees. The globe turns round past 180 degrees with no stop.</p>
  </div>
</div>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] [data-layout] { display: flex; flex-wrap: wrap; gap: 32px; align-items: center; }
[data-stage] [data-dial] {
  position: relative; display: grid; place-items: center;
  width: ${DIAL + 112}px; height: ${DIAL + 64}px;
}
[data-stage] [data-mark] {
  position: absolute; color: var(--ui-muted-foreground); font: 0.8125rem/1.4 ui-monospace, Consolas, monospace;
}
[data-stage] [data-mark="n"] { top: 4px; left: 50%; transform: translateX(-50%); }
[data-stage] [data-mark="s"] { bottom: 4px; left: 50%; transform: translateX(-50%); }
[data-stage] [data-mark="e"] { right: 0; top: 50%; transform: translateY(-50%); }
[data-stage] [data-mark="w"] { left: 0; top: 50%; transform: translateY(-50%); }
[data-stage] c04-globe {
  position: relative; display: block; width: ${DIAL}px; height: ${DIAL}px; border-radius: 50%;
  cursor: grab; touch-action: none; user-select: none;
}
[data-stage] c04-globe:active { cursor: grabbing; }
[data-stage] c04-globe:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 4px; }
[data-stage] c04-globe > svg { position: absolute; inset: 0; display: block; width: ${DIAL}px; height: ${DIAL}px; }
[data-stage] c04-globe [data-bezel] { fill: #0b1220; stroke: #334155; stroke-width: 1; }
[data-stage] c04-globe [data-scale] line { stroke: #64748b; stroke-width: 1.4; stroke-linecap: round; }
[data-stage] c04-globe [data-scale] [data-major] { stroke: #cbd5e1; stroke-width: 2; }
[data-stage] c04-globe [data-turn] { transform-box: view-box; transform-origin: 50% 50%; transform: rotate(var(--rotary-angle)); }
[data-stage] c04-globe [data-needle] { stroke: ${INK.here}; stroke-width: 3; stroke-linecap: round; }
[data-stage] c04-globe [data-tip] { fill: ${INK.here}; }
[data-stage] c04-globe [data-scene] {
  position: absolute; left: ${(DIAL - BALL) / 2}px; top: ${(DIAL - BALL) / 2}px;
  display: block; width: ${BALL}px; height: ${BALL}px; border-radius: 50%;
}
[data-stage] [data-side] { display: grid; gap: 14px; max-width: 420px; }
[data-stage] [data-readout] {
  justify-self: start; padding: 6px 14px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius);
  background: var(--ui-muted); color: var(--ui-foreground); font: 600 1.5rem/1.3 ui-monospace, Consolas, monospace;
}
[data-stage] [data-legend] { color: var(--ui-foreground); font-weight: 500; }
[data-stage] [data-cities] { display: flex; flex-wrap: wrap; gap: 8px; }
[data-stage] [data-city][data-here] button { border-color: ${INK.here}; }
[data-stage] [data-status] { max-width: 60ch; color: var(--ui-foreground); }
[data-stage] [data-hint] { max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
`

type Globe = { show: (lon: number) => void }

// The equirectangular map that wraps the sphere: ocean, a 30-degree grid and the land rings.
function paintMap(map: HTMLCanvasElement) {
  const ctx = map.getContext("2d")
  if (!ctx) return false
  const w = map.width
  const h = map.height
  const x = (lon: number) => ((lon + 180) / 360) * w
  const y = (lat: number) => ((90 - lat) / 180) * h
  ctx.fillStyle = INK.ocean
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = INK.grid
  ctx.lineWidth = 2
  for (let lon = -180; lon <= 180; lon += 30) {
    ctx.beginPath()
    ctx.moveTo(x(lon), 0)
    ctx.lineTo(x(lon), h)
    ctx.stroke()
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    ctx.beginPath()
    ctx.moveTo(0, y(lat))
    ctx.lineTo(w, y(lat))
    ctx.stroke()
  }
  LAND.forEach((ring, i) => {
    ctx.fillStyle = i === 1 || i === LAND.length - 1 ? INK.ice : INK.land
    ctx.beginPath()
    ring.forEach(([lon, lat], j) => (j ? ctx.lineTo(x(lon), y(lat)) : ctx.moveTo(x(lon), y(lat))))
    ctx.closePath()
    ctx.fill()
  })
  return true
}

// The 3D globe. jsdom has no WebGL, so it returns undefined there and the dial still works.
function drawGlobe(root: HTMLElement, canvas: HTMLCanvasElement, start: number): Globe | undefined {
  const gl = canvas.getContext("webgl2", { antialias: true })
  if (!gl) return undefined
  const map = document.createElement("canvas")
  map.width = 2048
  map.height = 1024
  if (!paintMap(map)) return undefined
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  const size = canvas.clientWidth
  const renderer = new WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(size, size, false)
  renderer.setClearColor(0x000000, 0)
  const scene = new Scene()
  const camera = new PerspectiveCamera(30, 1, 0.1, 20)
  camera.position.set(0, 0, 4.1)
  camera.lookAt(0, 0, 0)

  const texture = new CanvasTexture(map)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  const tilt = new Group()
  tilt.rotation.x = TILT
  const earth = new Group()
  earth.add(new Mesh(new SphereGeometry(1, 96, 64), new MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0 })))
  const marker = new SphereGeometry(0.028, 16, 12)
  const markers = CITIES.map((city) => {
    const dot = new Mesh(marker, new MeshBasicMaterial({ color: INK.city }))
    dot.position.set(...pointOn(city.lon, city.lat, 1.005))
    earth.add(dot)
    return { city, dot }
  })
  tilt.add(earth)
  const air = new Mesh(new SphereGeometry(1.06, 64, 48), new MeshBasicMaterial({ color: INK.air, transparent: true, opacity: 0.12, side: BackSide }))
  const sun = new DirectionalLight("#ffffff", 2.4)
  sun.position.set(-2.5, 2, 4)
  scene.add(tilt, air, new AmbientLight("#ffffff", 0.9), sun)

  let target = spinFor(start)
  let frame = 0
  let last = 0
  const mark = (lon: number) => {
    const here = inFront(lon)
    for (const { city, dot } of markers) {
      dot.material.color.set(city === here ? INK.here : INK.city)
      dot.scale.setScalar(city === here ? 1.8 : 1)
    }
  }
  const render = () => renderer.render(scene, camera)
  const step = (now: number) => {
    frame = 0
    if (!root.isConnected) {
      renderer.dispose()
      return
    }
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0
    last = now
    const left = Math.atan2(Math.sin(target - earth.rotation.y), Math.cos(target - earth.rotation.y))
    earth.rotation.y += left * Math.min(dt * 6, 1)
    render()
    if (Math.abs(left) > 0.0005) frame = requestAnimationFrame(step)
    else last = 0
  }
  earth.rotation.y = target
  mark(start)
  render()
  return {
    show(lon) {
      target = spinFor(lon)
      mark(lon)
      if (still) {
        earth.rotation.y = target
        render()
      } else if (!frame) frame = requestAnimationFrame(step)
    },
  }
}

function mount(root: HTMLElement) {
  root.innerHTML = html
  const globe = root.querySelector<HTMLElement & { api: { setValue: (value: number) => boolean } }>("c04-globe")!
  const status = root.querySelector("[data-status]")!
  const readout = root.querySelector("[data-readout]")!
  const scene = drawGlobe(root, root.querySelector<HTMLCanvasElement>("[data-scene]")!, START)
  const mark = (lon: number) => {
    const here = inFront(lon)
    for (const el of root.querySelectorAll<HTMLElement>("[data-city]")) el.toggleAttribute("data-here", el.dataset.city === here?.name)
  }
  mark(START)
  globe.addEventListener("valuechange", (event) => {
    const { value } = (event as CustomEvent<{ value: number }>).detail
    readout.textContent = said(value)
    status.textContent = report(value)
    mark(value)
    scene?.show(value)
  })
  for (const city of CITIES)
    root.querySelector(`[data-city="${city.name}"]`)!.addEventListener("action", () => globe.api.setValue(city.lon))
}

const ui: UI = {
  id: "C04",
  request:
    "Build a 3D globe on a rotary dial: a person turns the ring around the globe by dragging or with the arrow keys, the longitude turns round past 180 degrees with no stop, and a city button turns the globe to that city.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Longitude", action: "setValue", args: [200] },
      { ref: "Tokyo", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Facing 140° E. Tokyo is in front.",
  },
  breaks: [
    {
      broke: "The arrow keys no longer turn the globe.",
      find: "keydown: (event, { api }) => void api.rotary.keydown(event),",
      replace: "keydown: () => {},",
      caught: "keyboard: the arrow keys turn the focused globe 1 degree, Page Up and Page Down 15 degrees, and Home and End go to the ends",
    },
    {
      broke: "A drag on the ring no longer turns the globe.",
      find: "pointerdown: (event, { el, api }) => api.rotary.pointerdown(event, el!),",
      replace: "",
      caught: "pointer: a drag around the center turns the globe east and back, 1 degree of longitude for each degree of turn",
    },
    {
      broke: "The longitude stops at 180 degrees instead of turning round.",
      find: "wrap: () => true,",
      replace: "",
      caught: "keyboard: the globe turns round past 180 degrees in both directions",
    },
    {
      broke: "Screen readers no longer hear east or west in the longitude.",
      find: "valueText: spoken,",
      replace: "",
      caught: "keyboard: the globe is a slider with its bounds, its value and its value text in degrees east or west",
    },
    {
      broke: "A city button no longer turns the globe.",
      find: "addEventListener(\"action\", () => globe.api.setValue(city.lon))",
      replace: "addEventListener(\"action\", () => {})",
      caught: "keyboard: on the page, Tab reaches the globe once, a key turns it, and a city button turns it to the city",
    },
  ],
}

export { globeDial, spinFor }
export default ui
