import { type ChangeDetails, createChange, createRovingFocus, definePrimitive, elements } from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import type { UI } from "../src/ui"

type Side = "natural" | "sharp"
type Reason = "item-press" | "imperative"
type Options = {
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[], details: ChangeDetails<Reason>) => void
}
// value is the list of notes played, in order, so a repeated note is a change too. Each group has its own tab stop.
type State = { value: string[]; naturalFocus: string | null; sharpFocus: string | null }

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const pitch = (note: string) => {
  const match = /^([A-G]#?)(\d)$/.exec(note)
  return match ? NAMES.indexOf(match[1]) + 12 * (Number(match[2]) + 1) : Number.NaN
}

const piano = definePrimitive({
  name: "piano",
  options: { value: "list", defaultValue: "list", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    value: options.value ?? options.defaultValue ?? [],
    naturalFocus: null,
    sharpFocus: null,
  }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    const group = (side: Side) => ({
      roving: createRovingFocus<State, { value: string }>(context, {
        slot: side,
        key: side === "natural" ? "naturalFocus" : "sharpFocus",
        orientation: () => "horizontal",
      }),
    })
    const blocks = { natural: group("natural"), sharp: group("sharp") }
    const notes = () =>
      [...elements(context, "natural"), ...elements(context, "sharp")]
        .map((part) => part.key)
        .sort((a, b) => pitch(a) - pitch(b))
    const reason = (event?: Event): Reason => (event ? "item-press" : "imperative")
    const play = (note: string, event?: Event) => {
      if (!notes().includes(note)) throw new Error(`No key "${note}". Keys: ${notes().join(", ")}.`)
      return change("value", [...context.store.get().value, note], { reason: reason(event), event })
    }
    const clear = (event?: Event) => change("value", [], { reason: reason(event), event })
    return { blocks, notes, play, clear }
  },
  slots: (slot) => {
    const key = (side: Side) =>
      slot<{ value: string }>({
        role: "button",
        focus: "roving",
        props: { value: "string" },
        attrs: (state, part) => ({
          type: "button",
          tabindex: part.api.blocks[side].roving.tabIndex(state, part),
          "data-last": state.value.at(-1) === part.key ? "" : undefined,
        }),
        press: ({ api, key }, event) => void api.play(key, event),
        on: {
          keydown: (event, { el, api }) => {
            if (el) api.blocks[side].roving.keydown(event, el)
          },
        },
        bind: (el, part) => part.api.blocks[side].roving.bind(el, part),
      })
    return {
      root: slot({ role: "group", keys: { none: "Each key handles the arrow keys of its own group." } }),
      naturals: slot({ role: "group" }),
      sharps: slot({ role: "group" }),
      natural: key("natural"),
      sharp: key("sharp"),
    }
  },
  agent: { actions: ["play", "clear"], items: (api) => api.notes().map((value) => ({ value, label: value })) },
})

createParts(piano, {
  root: { tag: "b35-piano", display: "block", api: ["play", "clear"] },
  naturals: { tag: "b35-naturals", display: "block" },
  sharps: { tag: "b35-sharps", display: "block" },
  natural: { tag: "b35-natural", display: "block", target: wrappedButton },
  sharp: { tag: "b35-sharp", display: "block", target: wrappedButton },
})

const NATURALS = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5"]
const SHARPS = ["C#4", "D#4", "F#4", "G#4", "A#4", "C#5", "D#5"]
const MELODY = ["E5", "D#5", "E5", "D#5", "E5", "B4", "D5", "C5", "A4"]
// Each white key is 56 px wide. A black key sits on the line after the white key 1 semitone below it.
const KEY = 56
const naturalAt = (note: string) => NATURALS.indexOf(note)
const sharpLine = (note: string) => NATURALS.findIndex((n) => pitch(n) === pitch(note) - 1) + 1
const laneX = (note: string) => (note.includes("#") ? sharpLine(note) * KEY : (naturalAt(note) + 0.5) * KEY)

const W = NATURALS.length * KEY
const H = 220
const LINE = H - 12
const ROW = 36
const MAGENTA = "#ff4fd8"
const CYAN = "#38f9ff"
const MISS = "#ff8a3d"

type Burst = { x: number; color: string; at: number }

function startVisualizer(canvas: HTMLCanvasElement, host: Element) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return { set: (_at: number) => {}, hit: (_note: string, _ok: boolean) => {} }
  canvas.width = W * 2
  canvas.height = H * 2
  ctx.scale(2, 2)
  const still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  let target = 0
  let shown = 0
  let bursts: Burst[] = []
  let running = false

  const paint = (now: number) => {
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, "#1a0b3d")
    sky.addColorStop(1, "#06030f")
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, H)
    ctx.shadowBlur = 0
    ctx.lineWidth = 1
    ctx.strokeStyle = "#2c1f63"
    for (let i = 1; i < NATURALS.length; i++) {
      ctx.beginPath()
      ctx.moveTo(i * KEY + 0.5, 0)
      ctx.lineTo(i * KEY + 0.5, LINE)
      ctx.stroke()
    }
    // Rows of the grid fall with the notes.
    const drift = ((shown % 1) + 1) % 1
    for (let y = LINE - ROW + drift * ROW; y > 0; y -= ROW) {
      ctx.beginPath()
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(W, y + 0.5)
      ctx.stroke()
    }
    MELODY.forEach((note, index) => {
      const k = index - shown
      if (k <= -1) return
      const sharp = note.includes("#")
      const width = sharp ? 26 : 40
      const bottom = LINE - 4 - k * ROW
      if (bottom < 0) return
      const color = sharp ? CYAN : MAGENTA
      ctx.globalAlpha = k < 0 ? 1 + k : 1
      ctx.shadowColor = color
      ctx.shadowBlur = index === target ? 18 : 8
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(laneX(note) - width / 2, bottom - 26, width, 26, 6)
      ctx.fill()
      if (index === target) {
        ctx.shadowBlur = 0
        ctx.lineWidth = 2
        ctx.strokeStyle = "#ffffff"
        ctx.stroke()
        ctx.lineWidth = 1
      }
      ctx.globalAlpha = 1
    })
    ctx.shadowColor = CYAN
    ctx.shadowBlur = 14
    ctx.fillStyle = CYAN
    ctx.fillRect(0, LINE, W, 3)
    for (const burst of bursts) {
      const age = (now - burst.at) / 500
      ctx.globalAlpha = Math.max(0, 1 - age)
      ctx.shadowColor = burst.color
      ctx.shadowBlur = 24
      ctx.strokeStyle = burst.color
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(burst.x, LINE, 10 + age * 30, Math.PI, 0)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    ctx.lineWidth = 1
  }

  const frame = (now: number) => {
    shown += (target - shown) * 0.2
    if (Math.abs(target - shown) < 0.002) shown = target
    bursts = bursts.filter((burst) => now - burst.at < 500)
    paint(now)
    running = host.isConnected && (shown !== target || bursts.length > 0)
    if (running) requestAnimationFrame(frame)
  }
  const kick = () => {
    if (running || !host.isConnected) return
    running = true
    requestAnimationFrame(frame)
  }

  paint(performance.now())
  return {
    set: (at: number) => {
      target = at
      if (still) {
        shown = at
        paint(performance.now())
      } else kick()
    },
    hit: (note: string, ok: boolean) => {
      if (still) return
      bursts.push({ x: laneX(note), color: ok ? (note.includes("#") ? CYAN : MAGENTA) : MISS, at: performance.now() })
      kick()
    },
  }
}

// The AudioContext starts only from a person's click or key press on a key: an agent's play sends no DOM event.
function createSynth() {
  let audio: AudioContext | null = null
  return {
    unlock: () => {
      if (!audio && typeof AudioContext !== "undefined") audio = new AudioContext()
      void audio?.resume()
    },
    play: (note: string) => {
      if (!audio) return
      const t = audio.currentTime
      const osc = audio.createOscillator()
      osc.type = "sawtooth"
      osc.frequency.value = 440 * 2 ** ((pitch(note) - 69) / 12)
      const filter = audio.createBiquadFilter()
      filter.type = "lowpass"
      filter.frequency.setValueAtTime(2600, t)
      filter.frequency.exponentialRampToValueAtTime(500, t + 0.45)
      const gain = audio.createGain()
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
      osc.connect(filter).connect(gain).connect(audio.destination)
      osc.start(t)
      osc.stop(t + 0.65)
    },
  }
}

const sharpColumns = SHARPS.map(
  (note) => `[data-stage] b35-sharp[value="${note}"] { grid-column: ${sharpLine(note) * 2} / span 2; }`,
).join("\n")

const html = `
<h2>Für Elise, opening bars</h2>
<p data-hint>Play the falling notes. Tab moves between the white keys and the black keys, the arrow keys move along a row, and Space or Enter plays a key.</p>
<div data-synth>
  <canvas aria-hidden="true"></canvas>
  <b35-piano aria-label="Piano keyboard" dir="ltr">
    <b35-naturals aria-label="White keys">${NATURALS.map((n) => `<b35-natural value="${n}"><button><span>${n}</span></button></b35-natural>`).join("")}</b35-naturals>
    <b35-sharps aria-label="Black keys">${SHARPS.map((n) => `<b35-sharp value="${n}"><button>${n}</button></b35-sharp>`).join("")}</b35-sharps>
  </b35-piano>
</div>
<ol data-sheet aria-label="Melody">${MELODY.map((n) => `<li>${n}</li>`).join("")}</ol>
<p role="status" data-status></p>
<ui-button data-restart><button>Start over</button></ui-button>`

const css = `
[data-stage] {
  display: grid; gap: 14px; justify-items: start; max-width: 720px;
  --ui-background: #0d0a1f; --ui-foreground: #f5f0ff; --ui-muted: #1c1640; --ui-muted-foreground: #c4bbe8;
  --ui-border: #3d2f7a; --ui-input: #8e7fd6; --ui-primary: ${MAGENTA}; --ui-primary-foreground: #12051f;
  --ui-ring: ${CYAN};
}
[data-stage] h2, [data-stage] p, [data-stage] ol { margin: 0; }
[data-stage] h2 { font-size: 1.125rem; font-weight: 700; color: var(--ui-foreground); }
[data-stage] [data-hint] { max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
[data-stage] [data-synth] {
  display: grid; padding: 16px; border: 1px solid var(--ui-border); border-radius: 12px; background: #06030f;
}
[data-stage] [data-synth] canvas { display: block; width: ${W}px; height: ${H}px; }
[data-stage] b35-piano { display: grid; width: ${W}px; height: 170px; }
[data-stage] b35-naturals, [data-stage] b35-sharps { grid-area: 1 / 1; display: grid; }
[data-stage] b35-naturals { grid-template-columns: repeat(${NATURALS.length}, 1fr); }
[data-stage] b35-sharps { grid-template-columns: repeat(${NATURALS.length * 2}, 1fr); align-self: start; height: 104px; pointer-events: none; }
[data-stage] b35-sharp { display: flex; justify-content: center; pointer-events: auto; }
${sharpColumns}
[data-stage] b35-piano button {
  all: unset; box-sizing: border-box; display: flex; align-items: flex-end; justify-content: center;
  cursor: pointer; user-select: none; font: 600 0.75rem/1 ui-monospace, Consolas, monospace;
}
[data-stage] b35-natural button {
  width: calc(100% - 4px); height: 100%; margin: 0 2px; padding-bottom: 12px;
  border: 1px solid #8e7fd6; border-radius: 0 0 8px 8px; background: #ece8ff; color: #1a1433;
}
[data-stage] b35-sharp button {
  width: 34px; height: 100%; padding-bottom: 10px;
  border: 1px solid ${CYAN}; border-radius: 0 0 6px 6px; background: #15102b; color: #e8e3ff;
}
[data-stage] b35-natural button[data-last] { background: ${MAGENTA}; border-color: ${MAGENTA}; color: #12051f; }
[data-stage] b35-sharp button[data-last] { background: ${CYAN}; color: #06030f; }
[data-stage] b35-natural button:focus-visible { outline: 3px solid #12051f; outline-offset: -6px; }
[data-stage] b35-sharp button:focus-visible { outline: 2px solid ${CYAN}; outline-offset: -5px; }
[data-stage] b35-sharp button[data-last]:focus-visible { outline-color: #06030f; }
[data-stage] [data-sheet] { display: flex; flex-wrap: wrap; gap: 6px; padding: 0; list-style: none; }
[data-stage] [data-sheet] li {
  padding: 4px 10px; border: 1px solid var(--ui-input); border-radius: 6px;
  color: var(--ui-foreground); font: 600 0.8125rem/1.2 ui-monospace, Consolas, monospace;
}
[data-stage] [data-sheet] li[data-played] { background: var(--ui-primary); border-color: var(--ui-primary); color: var(--ui-primary-foreground); }
[data-stage] [data-sheet] li[data-next] { border-color: ${CYAN}; outline: 1px solid ${CYAN}; }
[data-stage] [data-status] { color: var(--ui-foreground); font-size: 0.9375rem; }
`

type Piano = HTMLElement & { api: { play(note: string): boolean; clear(): boolean } }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const piano = root.querySelector<Piano>("b35-piano")!
  const status = root.querySelector("[data-status]")!
  const sheet = [...root.querySelectorAll("[data-sheet] li")]
  const visualizer = startVisualizer(root.querySelector("canvas")!, root)
  const synth = createSynth()
  let at = 0
  const report = (note?: string, ok?: boolean) => {
    sheet.forEach((li, index) => {
      li.toggleAttribute("data-played", index < at)
      li.toggleAttribute("data-next", index === at)
    })
    if (at === MELODY.length) status.textContent = `Melody complete: ${at} of ${MELODY.length} notes played.`
    else {
      const said = note === undefined ? "" : ok ? `${note} is right. ` : `${note} is not next. `
      status.textContent = `${said}Next note: ${MELODY[at]}. ${at} of ${MELODY.length} notes played.`
    }
  }
  report()

  // Capture runs before the key's own click handler, so the first note a person plays already sounds.
  piano.addEventListener("click", () => synth.unlock(), true)
  piano.addEventListener("valuechange", (event) => {
    const { value } = (event as CustomEvent<{ value: string[] }>).detail
    const note = value.at(-1)
    if (note === undefined) {
      at = 0
      visualizer.set(0)
      report()
      return
    }
    synth.play(note)
    const ok = at < MELODY.length && note === MELODY[at]
    if (ok) at++
    visualizer.hit(note, ok)
    visualizer.set(at)
    report(note, ok)
  })
  root.querySelector("[data-restart]")!.addEventListener("action", () => piano.api.clear())
}

const ui: UI = {
  id: "B35",
  request:
    "Build a neon synth piano keyboard that plays the opening of Für Elise: the white keys and the black keys are 2 groups with 1 tab stop each, each key plays a Web Audio tone, and falling notes on a canvas show what to play next.",
  css,
  mount,
  task: {
    steps: MELODY.map((note) => ({ ref: "Piano keyboard", action: "play", args: [note] })),
    done: (root) => root.querySelector("[data-status]")!.textContent === "Melody complete: 9 of 9 notes played.",
  },
  breaks: [
    {
      broke: "Left and Right no longer move along a row.",
      find: 'orientation: () => "horizontal",',
      replace: "",
      caught: "keyboard: Left and Right move along the white keys, and Home and End go to the ends",
    },
    {
      broke: "The 2 groups share 1 tab stop key, so a move in one group moves the stop of the other.",
      find: 'key: side === "natural" ? "naturalFocus" : "sharpFocus",',
      replace: 'key: "naturalFocus",',
      caught: "keyboard: each group keeps its own tab stop when focus leaves it and comes back",
    },
    {
      broke: "A repeated note replaces the melody instead of being added to it.",
      find: "[...context.store.get().value, note]",
      replace: "[note]",
      caught: "keyboard: Space and Enter play the focused key, and the same key again adds the note again",
    },
    {
      broke: "play accepts a key that is not on the keyboard.",
      find: "if (!notes().includes(note)) throw",
      replace: "if (false) throw",
      caught: "api: play refuses a key that is not on the keyboard, and clear empties the melody",
    },
    {
      broke: "A person's press no longer starts the AudioContext.",
      find: 'piano.addEventListener("click", () => synth.unlock(), true)',
      replace: "",
      caught: "audio: the AudioContext starts on a person's key press, not on mount or an agent's play",
    },
    {
      broke: "A wrong note advances the melody.",
      find: "const ok = at < MELODY.length && note === MELODY[at]",
      replace: "const ok = at < MELODY.length",
      caught: "keyboard: on the page, the right notes advance the melody and a wrong note does not",
    },
  ],
}

export { piano, startVisualizer }
export default ui
