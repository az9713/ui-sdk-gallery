import { type ChangeDetails, createChange, createController, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  WebGLRenderer,
} from "three"
import type { UI } from "../src/ui"

type Reason = "toggle-press" | "next-press" | "imperative"
type DeckControls = {
  play: () => boolean
  pause: () => boolean
  next: () => boolean
  previous: () => boolean
  setValue: (value: string) => boolean
}
type Options = {
  tracks: string[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, details: ChangeDetails<Reason>) => void
  playing?: boolean
  defaultPlaying?: boolean
  onPlayingChange?: (playing: boolean, details: ChangeDetails<Reason>) => void
  controller?: DeckControls
}
// tracks is an option that the track parts render from, so the state has a copy: a part must not read an option.
type State = { tracks: string[]; value: string; playing: boolean }

const activates = (event: KeyboardEvent) => event.key === " " || event.key === "Enter"

const turntable = definePrimitive({
  name: "turntable",
  options: {
    tracks: "list",
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    playing: "boolean",
    defaultPlaying: "boolean",
    onPlayingChange: "callback",
    controller: "value",
  },
  controlled: ["value", "playing"],
  state: (options: Options): State => ({
    tracks: options.tracks ?? [],
    value: options.value ?? options.defaultValue ?? options.tracks?.[0] ?? "",
    playing: options.playing ?? options.defaultPlaying ?? false,
  }),
  sync: (options) => ({
    tracks: options.tracks ?? [],
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.playing === undefined ? {} : { playing: options.playing }),
  }),
  api: (context) => {
    const change = createChange(context)
    const step = (by: number, reason: Reason, event?: KeyboardEvent | MouseEvent) => {
      const { tracks, value } = context.store.get()
      const at = tracks.indexOf(value)
      return change("value", tracks[(at + by + tracks.length) % tracks.length], { reason, event } as ChangeDetails<Reason>)
    }
    const setPlaying = (playing: boolean, reason: Reason, event?: KeyboardEvent | MouseEvent) =>
      change("playing", playing, { reason, event } as ChangeDetails<Reason>)
    return {
      tracks: () => context.store.get().tracks,
      play: () => setPlaying(true, "imperative"),
      pause: () => setPlaying(false, "imperative"),
      next: () => step(1, "imperative"),
      previous: () => step(-1, "imperative"),
      setValue: (value: string) => {
        if (!context.store.get().tracks.includes(value))
          throw new Error(`No track "${value}". Tracks: ${context.store.get().tracks.join(", ")}.`)
        return change("value", value, { reason: "imperative" })
      },
      toggle: (event: KeyboardEvent | MouseEvent) => setPlaying(!context.store.get().playing, "toggle-press", event),
      skip: (event: KeyboardEvent | MouseEvent) => step(1, "next-press", event),
    }
  },
  slots: (slot) => ({
    root: slot({ role: "group" }),
    start: slot({
      role: "button",
      focus: "tab-stop",
      attrs: (state) => ({
        tabindex: "0",
        "aria-pressed": String(state.playing),
        "data-playing": state.playing ? "" : undefined,
      }),
      press: ({ api }, event) => api.toggle(event as MouseEvent),
      on: {
        // A part that is not a <button> hears only clicks through press.
        keydown: (event, { api }) => {
          if (activates(event)) {
            event.preventDefault()
            api.toggle(event)
          }
        },
      },
    }),
    skip: slot({
      role: "button",
      focus: "tab-stop",
      attrs: () => ({ tabindex: "0" }),
      press: ({ api }, event) => api.skip(event as MouseEvent),
      on: {
        keydown: (event, { api }) => {
          if (activates(event)) {
            event.preventDefault()
            api.skip(event)
          }
        },
      },
    }),
    tracklist: slot({ role: "list" }),
    song: slot<{ value: string }>({
      role: "listitem",
      props: { value: "string" },
      attrs: (state, { key }) => ({
        "aria-current": state.value === key ? "true" : undefined,
        "data-current": state.value === key ? "" : undefined,
      }),
    }),
  }),
  agent: {
    actions: ["play", "pause", "next", "previous", "setValue"],
    closed: true,
    items: (api) => api.tracks().map((track: string) => ({ value: track, label: track })),
  },
})

createParts(turntable, {
  root: { tag: "b40-turntable", display: "block" },
  start: "b40-start",
  skip: "b40-skip",
  tracklist: { tag: "b40-songlist", display: "block" },
  song: { tag: "b40-song", display: "block" },
})

const TRACKS = [
  { title: "Low Tide", time: "3:42" },
  { title: "Lanterns", time: "4:05" },
  { title: "Salt Road", time: "3:18" },
  { title: "Night Ferry", time: "5:01" },
]
const INK = { stage: "#1e293b", plinth: "#5b3a29", platter: "#64748b", vinyl: "#0b0d12", groove: "#273244", label: "#fb923c", mark: "#0f172a", metal: "#cbd5e1", rim: "#2dd4bf" }
// The needle sits further in for each later track. Radians around the tonearm's pivot; 0 is the rest.
const ARM_REST = 0
const ARM_FIRST = -0.5
const ARM_STEP = -0.08
const SPIN = 2.2

const html = `
<h2>Night Ferry, side A</h2>
<div data-player>
  <b40-turntable aria-label="Turntable" tracks="${TRACKS.map((t) => t.title)}" default-value="${TRACKS[0].title}">
    <canvas data-scene aria-hidden="true"></canvas>
    <div data-deck-row>
      <b40-start>Start</b40-start>
      <b40-skip>Skip</b40-skip>
    </div>
    <b40-songlist aria-label="Side A">
      ${TRACKS.map((t) => `<b40-song value="${t.title}"><span>${t.title}</span> <span data-time>${t.time}</span></b40-song>`).join("")}
    </b40-songlist>
  </b40-turntable>
  <section data-remote aria-labelledby="b40-remote">
    <h2 id="b40-remote">Remote</h2>
    <p data-hint>These buttons sit outside the turntable. They reach it through a controller.</p>
    <div data-remote-row>
      <ui-button data-play><button>Play</button></ui-button>
      <ui-button data-pause><button>Pause</button></ui-button>
      <ui-button data-previous><button>Previous track</button></ui-button>
      <ui-button data-next><button>Next track</button></ui-button>
    </div>
    <p role="status" data-status>Stopped on Low Tide, track 1 of 4.</p>
  </section>
</div>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] [data-player] { display: flex; flex-wrap: wrap; gap: 24px; align-items: start; }
[data-stage] b40-turntable { display: grid; gap: 12px; width: min(100%, 560px); }
[data-stage] [data-scene] {
  display: block; width: 100%; height: auto; aspect-ratio: 16 / 10;
  border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: ${INK.stage};
}
[data-stage] [data-deck-row], [data-stage] [data-remote-row] { display: flex; flex-wrap: wrap; gap: 8px; }
[data-stage] b40-start, [data-stage] b40-skip {
  display: inline-grid; place-items: center; min-width: 72px; min-height: 36px; padding: 0 16px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-muted); color: var(--ui-foreground); font-weight: 500; cursor: pointer; user-select: none;
}
[data-stage] b40-start[data-playing] { border-color: var(--ui-primary); background: var(--ui-primary); color: var(--ui-primary-foreground); }
[data-stage] b40-start:focus-visible, [data-stage] b40-skip:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b40-songlist { display: grid; gap: 4px; }
[data-stage] b40-song {
  display: flex; justify-content: space-between; gap: 16px; padding: 6px 12px;
  border: 1px solid transparent; border-radius: var(--ui-radius); color: var(--ui-muted-foreground);
}
[data-stage] b40-song[data-current] { border-color: var(--ui-primary); background: var(--ui-muted); color: var(--ui-foreground); font-weight: 600; }
[data-stage] [data-time] { font-variant-numeric: tabular-nums; }
[data-stage] [data-remote] {
  display: grid; gap: 12px; width: min(100%, 420px); padding: 16px;
  border: 1px solid var(--ui-border); border-radius: var(--ui-radius);
}
[data-stage] [data-hint], [data-stage] [data-status] { color: var(--ui-muted-foreground); max-width: 60ch; }
`

type Scene3D = { show: (playing: boolean, track: number) => void }

// The 3D deck. jsdom has no WebGL, so it returns undefined there and the parts above still work.
function drawDeck(root: HTMLElement, canvas: HTMLCanvasElement): Scene3D | undefined {
  const gl = canvas.getContext("webgl2", { antialias: true })
  if (!gl) return undefined
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const renderer = new WebGLRenderer({ canvas, context: gl, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height, false)
  const scene = new Scene()
  scene.background = new Color(INK.stage)
  const camera = new PerspectiveCamera(30, width / height, 0.1, 50)
  camera.position.set(0.3, 6.4, 7.2)
  camera.lookAt(0.1, -0.3, 0)

  const material = (color: string, metalness = 0, roughness = 0.6) => new MeshStandardMaterial({ color, metalness, roughness })
  const plinth = new Mesh(new BoxGeometry(5.4, 0.45, 3.9), material(INK.plinth, 0, 0.7))
  plinth.position.y = -0.225
  const platter = new Mesh(new CylinderGeometry(1.58, 1.58, 0.12, 96), material(INK.platter, 0.6, 0.35))
  platter.position.set(-0.6, 0.06, 0)

  const record = new Group()
  record.position.set(-0.6, 0.135, 0)
  record.add(new Mesh(new CylinderGeometry(1.52, 1.52, 0.03, 96), material(INK.vinyl, 0.2, 0.4)))
  for (let r = 0.72; r < 1.5; r += 0.11) {
    const groove = new Mesh(new RingGeometry(r, r + 0.018, 96), new MeshStandardMaterial({ color: INK.groove, side: DoubleSide }))
    groove.rotation.x = -Math.PI / 2
    groove.position.y = 0.016
    record.add(groove)
  }
  const label = new Mesh(new CylinderGeometry(0.55, 0.55, 0.034, 64), material(INK.label, 0, 0.5))
  const mark = new Mesh(new BoxGeometry(0.42, 0.038, 0.09), material(INK.mark))
  mark.position.x = 0.24
  const spindle = new Mesh(new CylinderGeometry(0.04, 0.04, 0.2, 16), material(INK.metal, 0.8, 0.3))
  record.add(label, mark, spindle)

  const arm = new Group()
  arm.position.set(1.75, 0.32, -1.25)
  const base = new Mesh(new CylinderGeometry(0.3, 0.34, 0.3, 32), material(INK.metal, 0.7, 0.35))
  base.position.y = -0.15
  const rod = new Mesh(new BoxGeometry(0.07, 0.07, 2.4), material(INK.metal, 0.8, 0.3))
  rod.position.z = 1.2
  const head = new Mesh(new BoxGeometry(0.18, 0.08, 0.3), material(INK.mark, 0.3, 0.5))
  head.position.set(0, -0.06, 2.4)
  arm.add(base, rod, head)

  const key = new DirectionalLight("#ffffff", 2.6)
  key.position.set(3, 7, 5)
  const rim = new DirectionalLight(INK.rim, 0.8)
  rim.position.set(-4, 3, -3)
  scene.add(plinth, platter, record, arm, new AmbientLight("#ffffff", 0.6), key, rim)

  let playing = false
  let armTo = ARM_REST
  let speed = 0
  let last = 0
  let frame = 0
  const render = () => renderer.render(scene, camera)
  const tick = (now: number) => {
    frame = 0
    if (!root.isConnected) {
      renderer.dispose()
      return
    }
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0
    last = now
    speed += ((playing ? SPIN : 0) - speed) * Math.min(dt * 3, 1)
    record.rotation.y -= speed * dt
    arm.rotation.y += (armTo - arm.rotation.y) * Math.min(dt * 4, 1)
    render()
    const moving = playing || speed > 0.01 || Math.abs(armTo - arm.rotation.y) > 0.001
    if (moving) frame = requestAnimationFrame(tick)
    else last = 0
  }
  render()
  return {
    show(next, track) {
      playing = next
      armTo = next ? ARM_FIRST + ARM_STEP * track : ARM_REST
      if (still) {
        arm.rotation.y = armTo
        render()
      } else if (!frame) frame = requestAnimationFrame(tick)
    },
  }
}

function mount(root: HTMLElement) {
  root.innerHTML = html
  const deck = root.querySelector<HTMLElement & { controller?: DeckControls }>("b40-turntable")!
  const remote = createController<DeckControls>()
  deck.controller = remote
  const status = root.querySelector("[data-status]")!
  const titles = TRACKS.map((t) => t.title)
  let track = titles[0]
  let playing = false
  const scene = drawDeck(root, root.querySelector("canvas")!)
  const show = () => {
    const where = `${track}, track ${titles.indexOf(track) + 1} of ${titles.length}`
    status.textContent = playing ? `Playing ${where}.` : `Stopped on ${where}.`
    scene?.show(playing, titles.indexOf(track))
  }
  deck.addEventListener("valuechange", (event) => {
    track = (event as CustomEvent<{ value: string }>).detail.value
    show()
  })
  deck.addEventListener("playingchange", (event) => {
    playing = (event as CustomEvent<{ value: boolean }>).detail.value
    show()
  })
  const on = (selector: string, run: () => void) => root.querySelector(selector)!.addEventListener("action", run)
  on("[data-play]", () => remote.play())
  on("[data-pause]", () => remote.pause())
  on("[data-previous]", () => remote.previous())
  on("[data-next]", () => remote.next())
}

const ui: UI = {
  id: "B40",
  request:
    "Build a vinyl turntable player: the deck has its own Start and Skip buttons, and a separate remote panel plays, pauses and changes the track through a controller.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Next track", action: "press" },
      { ref: "Play", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Playing Lanterns, track 2 of 4.",
  },
  breaks: [
    {
      broke: "The remote's controller no longer reaches the deck.",
      find: "deck.controller = remote",
      replace: "",
      caught: "keyboard: the remote's buttons drive the deck from outside its tree, and the status line follows",
    },
    {
      broke: "Space and Enter no longer press Start or Skip.",
      find: 'const activates = (event: KeyboardEvent) => event.key === " " || event.key === "Enter"',
      replace: "const activates = (_event: KeyboardEvent) => false",
      caught: "keyboard: Space and Enter on Start toggle playing, and aria-pressed follows",
    },
    {
      broke: "Skip stops at the last track instead of going back to the first.",
      find: "tracks[(at + by + tracks.length) % tracks.length]",
      replace: "tracks[Math.min(Math.max(at + by, 0), tracks.length - 1)]",
      caught: "keyboard: Skip is the second tab stop, moves to the next track and wraps from the last to the first",
    },
    {
      broke: "A screen reader no longer hears whether Start is pressed.",
      find: '"aria-pressed": String(state.playing),',
      replace: "",
      caught: "keyboard: Space and Enter on Start toggle playing, and aria-pressed follows",
    },
  ],
}

export type { DeckControls }
export { turntable }
export default ui
