import {
  announce,
  bindDrag,
  type ChangeDetails,
  createChange,
  createRovingFocus,
  createUndoStack,
  css,
  definePrimitive,
  dragThreshold,
  elements,
  matchesShortcut,
  spatialMove,
} from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import type { UI } from "../src/ui"

type Reason = "item-press" | "drag" | "imperative" | "undo" | "redo"
type Options = {
  defaultValue?: string[]
  onValueChange?: (value: string[], details: ChangeDetails<Reason>) => void
}
type StarProps = { value: string; x: number; y: number }
// The draft is the line that follows the pointer during a drag, in pixels of the sky box.
type Draft = { from: string; x: number; y: number }
type State = {
  value: string[]
  focused: string | null
  anchor: string | null
  draft: Draft | null
  canUndo: boolean
  canRedo: boolean
}

// Star positions are in sky units: 160 wide and 90 high, the 16:9 box of the chart.
const W = 160
const H = 90
const HIT = 30

const ends = (line: string) => line.split("-")
const said = (line: string) => ends(line).join(" to ")
const joins = (line: string, a: string, b: string) => {
  const [p, q] = ends(line)
  return (p === a && q === b) || (p === b && q === a)
}

const starSky = definePrimitive({
  name: "star-sky",
  options: { defaultValue: "list", onValueChange: "callback" },
  state: (options: Options): State => ({
    value: options.defaultValue ?? [],
    focused: null,
    anchor: null,
    draft: null,
    canUndo: false,
    canRedo: false,
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const stack = createUndoStack(store.get().value)
    const roving = createRovingFocus<State, StarProps>(context, {
      slot: "star",
      key: "focused",
      move: spatialMove({
        rect: (_el, key) => {
          const { x, y } = elements<StarProps>(context, "star").find((star) => star.key === key)!.props
          return { left: x, right: x, top: y, bottom: y }
        },
      }),
    })
    const stars = () => elements<StarProps>(context, "star").map(({ key }) => key)
    const named = (name: string) => {
      const star = stars().find((key) => key.toLowerCase() === String(name).trim().toLowerCase())
      if (!star) throw new Error(`No star "${name}". Stars: ${stars().join(", ")}.`)
      return star
    }
    const history = () => store.set({ canUndo: stack.canUndo(), canRedo: stack.canRedo() })

    const draw = (from: string, to: string, reason: Reason, event?: Event) => {
      const a = named(from)
      const b = named(to)
      if (a === b) throw new Error(`A line needs 2 stars. Both ends are ${a}.`)
      const { value } = store.get()
      if (value.some((line) => joins(line, a, b))) throw new Error(`${a} to ${b} is already drawn.`)
      const next = [...value, `${a}-${b}`]
      if (!change("value", next, { reason, event })) return false
      stack.record(next)
      history()
      return true
    }
    const undo = (event?: KeyboardEvent) => {
      const previous = stack.undo()
      if (previous === undefined) return false
      if (!change("value", previous, { reason: "undo", event })) {
        stack.redo()
        return false
      }
      history()
      return true
    }
    const redo = (event?: KeyboardEvent) => {
      const next = stack.redo()
      if (next === undefined) return false
      if (!change("value", next, { reason: "redo", event })) {
        stack.undo()
        return false
      }
      history()
      return true
    }
    const tryDraw = (from: string, to: string, reason: Reason, event?: Event) => {
      try {
        draw(from, to, reason, event)
      } catch (error) {
        announce((error as Error).message)
      }
    }
    // Space or a click on a first star starts a line; on a second star it draws the line.
    const pick = (key: string, event?: MouseEvent | KeyboardEvent) => {
      const { anchor } = store.get()
      if (!anchor) {
        store.set({ anchor: key })
        announce(`Line starts at ${key}. Pick the star where it ends.`)
        return
      }
      store.set({ anchor: null })
      if (anchor === key) announce("Line dropped.")
      else tryDraw(anchor, key, "item-press", event)
    }
    const starAt = (x: number, y: number, except: string) => {
      let best: string | null = null
      let distance = HIT
      for (const { el, key } of elements(context, "star")) {
        if (key === except) continue
        const box = el.getBoundingClientRect()
        const d = Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2))
        if (d <= distance) {
          best = key
          distance = d
        }
      }
      return best
    }

    let stop: (() => void) | undefined
    let dragged = false
    context.onDestroy(() => stop?.())

    return {
      roving,
      stars,
      drawLine: (from: string, to: string) => draw(from, to, "imperative"),
      undo,
      redo,
      pick: (key: string, event?: Event) => {
        if (dragged) dragged = false
        else pick(key, event instanceof MouseEvent ? event : undefined)
      },
      keydown: (event: KeyboardEvent, key: string) => {
        if ((event.key === " " || event.key === "Enter") && !event.ctrlKey && !event.metaKey) {
          event.preventDefault()
          pick(key, event)
          return true
        }
        if (event.key === "Escape" && store.get().anchor) {
          event.preventDefault()
          event.stopPropagation()
          store.set({ anchor: null })
          announce("Line dropped.")
          return true
        }
        return false
      },
      shortcut: (event: KeyboardEvent) => {
        if (matchesShortcut(event, "mod+shift+z") || matchesShortcut(event, "mod+y")) {
          event.preventDefault()
          redo(event)
        } else if (matchesShortcut(event, "mod+z")) {
          event.preventDefault()
          undo(event)
        }
      },
      pointerdown: (event: PointerEvent, el: HTMLElement, key: string) => {
        if (event.button !== 0) return
        stop?.()
        dragged = false
        let x = event.clientX
        let y = event.clientY
        stop = bindDrag(el, event, {
          threshold: dragThreshold,
          cancelOnEscape: true,
          onStart: () => {
            dragged = true
            store.set({ anchor: null })
          },
          onMove: (sample) => {
            x = sample.x
            y = sample.y
            const box = (el.parentElement ?? el).getBoundingClientRect()
            store.set({ draft: { from: key, x: x - box.left, y: y - box.top } })
          },
          onEnd: (end, canceled) => {
            store.set({ draft: null })
            const to = canceled ? null : starAt(x, y, key)
            if (to) tryDraw(key, to, "drag", end)
          },
        })
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      on: { keydown: (event, { api }) => api.shortcut(event) },
    }),
    star: slot<StarProps>({
      role: "button",
      focus: "roving",
      props: { value: "string", x: "number", y: "number" },
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-pressed": String(state.anchor === part.key),
        "data-anchor": state.anchor === part.key ? "" : undefined,
        style: css({ left: `${(part.props.x / W) * 100}%`, top: `${(part.props.y / H) * 100}%` }),
      }),
      press: ({ api, key }, event) => api.pick(key, event),
      on: {
        keydown: (event, { el, api, key }) => api.keydown(event, key) || api.roving.keydown(event, el!),
        pointerdown: (event, { el, api, key }) => api.pointerdown(event, el!, key),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
    // A click is not an undo event in the reason vocabulary, so the buttons pass none.
    undo: slot({
      role: "button",
      focus: "native",
      attrs: (state) => ({ type: "button", "aria-disabled": state.canUndo ? undefined : "true" }),
      press: ({ api }) => void api.undo(),
    }),
    redo: slot({
      role: "button",
      focus: "native",
      attrs: (state) => ({ type: "button", "aria-disabled": state.canRedo ? undefined : "true" }),
      press: ({ api }) => void api.redo(),
    }),
  }),
  agent: { actions: ["drawLine", "undo", "redo"], items: (api) => api.stars().map((star) => ({ value: star, label: star })) },
})

const SKY = "#0b1120"

function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hash = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261)

type Point = { x: number; y: number }

// 3 jittered passes and dark specks make a stroke look like chalk.
function chalk(ctx: CanvasRenderingContext2D, p: Point, q: Point, seed: number) {
  const rand = seeded(seed)
  const length = Math.hypot(q.x - p.x, q.y - p.y)
  if (length < 24) return
  const ux = (q.x - p.x) / length
  const uy = (q.y - p.y) / length
  const gap = 10
  const span = length - 2 * gap
  const at = (t: number, off: number) => ({ x: p.x + ux * (gap + span * t) - uy * off, y: p.y + uy * (gap + span * t) + ux * off })
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  const passes = [
    { alpha: 0.18, width: 4.2 },
    { alpha: 0.4, width: 2.6 },
    { alpha: 0.75, width: 1.3 },
  ]
  for (const { alpha, width } of passes) {
    ctx.strokeStyle = `rgba(241, 245, 249, ${alpha})`
    ctx.lineWidth = width
    ctx.beginPath()
    const steps = Math.max(3, Math.round(span / 12))
    for (let s = 0; s <= steps; s++) {
      const { x, y } = at(s / steps, (rand() - 0.5) * 1.6)
      if (s) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    }
    ctx.stroke()
  }
  ctx.fillStyle = SKY
  for (let k = 0; k < span / 1.6; k++) {
    const { x, y } = at(rand(), (rand() - 0.5) * 3.4)
    ctx.fillRect(x, y, 1.2, 1.2)
  }
}

function paint(canvas: HTMLCanvasElement, state: State) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return
  const ratio = globalThis.devicePixelRatio || 1
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
    canvas.width = Math.round(w * ratio)
    canvas.height = Math.round(h * ratio)
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.fillStyle = SKY
  ctx.fillRect(0, 0, w, h)

  const dust = seeded(7)
  for (let i = 0; i < 6; i++) {
    const x = dust() * w
    const y = dust() * h
    const r = (0.2 + dust() * 0.35) * w
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r)
    glow.addColorStop(0, "rgba(148, 163, 184, 0.07)")
    glow.addColorStop(1, "rgba(148, 163, 184, 0)")
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)
  }
  const field = seeded(27)
  for (let i = 0; i < 340; i++) {
    const x = field() * w
    const y = field() * h
    const r = 0.3 + field() ** 4 * 1.4
    ctx.fillStyle = `rgba(226, 232, 240, ${(0.2 + field() * 0.6).toFixed(2)})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const at = new Map<string, Point>()
  for (const star of canvas.parentElement?.querySelectorAll("[value][x][y]") ?? [])
    at.set(star.getAttribute("value")!, { x: (Number(star.getAttribute("x")) / W) * w, y: (Number(star.getAttribute("y")) / H) * h })
  for (const line of state.value) {
    const [a, b] = ends(line)
    const p = at.get(a)
    const q = at.get(b)
    if (p && q) chalk(ctx, p, q, hash(line))
  }
  const from = state.draft && at.get(state.draft.from)
  if (state.draft && from) {
    ctx.setLineDash([6, 6])
    ctx.strokeStyle = "rgba(251, 146, 60, 0.9)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(state.draft.x, state.draft.y)
    ctx.stroke()
    ctx.setLineDash([])
  }
  for (const { x, y } of at.values()) {
    const halo = ctx.createRadialGradient(x, y, 0, x, y, 14)
    halo.addColorStop(0, "rgba(241, 245, 249, 0.45)")
    halo.addColorStop(1, "rgba(241, 245, 249, 0)")
    ctx.fillStyle = halo
    ctx.fillRect(x - 14, y - 14, 28, 28)
    ctx.fillStyle = "#f8fafc"
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

createParts(starSky, {
  root: {
    tag: "b27-sky",
    display: "block",
    render: (el, instance) => {
      const canvas = el.querySelector("canvas")
      if (!canvas) return
      const draw = () => paint(canvas, instance.get() as State)
      draw()
      const unsubscribe = instance.subscribe(draw)
      const observer = new ResizeObserver(draw)
      observer.observe(canvas)
      return () => {
        unsubscribe()
        observer.disconnect()
      }
    },
  },
  star: { tag: "b27-star", display: "block" },
  undo: { tag: "b27-undo", target: wrappedButton, display: "contents" },
  redo: { tag: "b27-redo", target: wrappedButton, display: "contents" },
})

// Orion as seen facing south on a January evening.
const STARS: [string, number, number][] = [
  ["Meissa", 80, 11],
  ["Betelgeuse", 50, 23],
  ["Bellatrix", 110, 27],
  ["Mintaka", 97, 42],
  ["Alnilam", 80, 48],
  ["Alnitak", 63, 54],
  ["Saiph", 57, 78],
  ["Rigel", 113, 74],
]
const START = ["Alnitak-Alnilam", "Alnilam-Mintaka", "Betelgeuse-Alnitak", "Bellatrix-Mintaka"]

const count = (lines: string[]) => `${lines.length} ${lines.length === 1 ? "line" : "lines"}`
const describe = (lines: string[]) => (lines.length ? `Chalk lines: ${lines.map(said).join(", ")}.` : "No chalk lines yet.")

const html = `
<h2>Orion, facing south on a January night</h2>
<b27-sky aria-label="Star chart" default-value="${START}">
  <div data-sky>
    <canvas role="img" aria-label="${describe(START)}"></canvas>
    ${STARS.map(([name, x, y]) => `<b27-star value="${name}" x="${x}" y="${y}"><span>${name}</span></b27-star>`).join("\n    ")}
  </div>
  <div data-actions>
    <b27-undo><button>Undo</button></b27-undo>
    <b27-redo><button>Redo</button></b27-redo>
  </div>
</b27-sky>
<p role="status" data-status>${count(START)} on the chart.</p>
<p data-hint>Drag from one star to another to draw a chalk line. With the keyboard, the arrow keys move between stars, Space on a star starts a line and Space on a second star draws it, and Escape drops it. Control+Z undoes a line and Control+Shift+Z redoes it.</p>`

const styles = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] b27-sky { display: grid; gap: 12px; width: min(100%, 720px); }
[data-stage] [data-sky] {
  position: relative; aspect-ratio: 16 / 9;
  border: 1px solid var(--ui-border); border-radius: 8px; background: ${SKY}; touch-action: none;
}
[data-stage] [data-sky] canvas { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 8px; }
[data-stage] b27-star {
  position: absolute; width: 36px; height: 36px; margin: -18px 0 0 -18px;
  border: 2px solid transparent; border-radius: 50%; cursor: grab; touch-action: none; user-select: none;
}
[data-stage] b27-star span {
  position: absolute; top: calc(100% - 4px); left: 50%; transform: translateX(-50%);
  padding: 1px 8px; border-radius: 4px; background: ${SKY}; color: var(--ui-foreground);
  font-size: 0.75rem; white-space: nowrap;
}
[data-stage] b27-star:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b27-star[data-anchor] { border-color: var(--ui-primary); }
[data-stage] b27-star[data-anchor] span { color: var(--ui-primary); }
[data-stage] [data-actions] { display: flex; gap: 8px; }
[data-stage] [data-actions] button {
  padding: 6px 16px; border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: transparent; color: var(--ui-foreground); font: inherit; font-size: 0.875rem; cursor: pointer;
}
[data-stage] [data-actions] button[aria-disabled="true"] { color: var(--ui-muted-foreground); cursor: default; }
[data-stage] [data-actions] button:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] [data-status], [data-stage] [data-hint] { max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const canvas = root.querySelector("canvas")!
  let lines = START
  root.querySelector("b27-sky")!.addEventListener("valuechange", (event) => {
    const { value, reason } = (event as CustomEvent<{ value: string[]; reason: string }>).detail
    if (reason === "undo") status.textContent = `Undid ${said(lines.find((line) => !value.includes(line))!)}. ${count(value)}.`
    else status.textContent = `${reason === "redo" ? "Redid" : "Drew"} ${said(value.find((line) => !lines.includes(line))!)}. ${count(value)}.`
    lines = value
    canvas.setAttribute("aria-label", describe(value))
  })
}

const ui: UI = {
  id: "B27",
  request:
    "Build a star chart of Orion where a person drags from star to star to draw chalk constellation lines, with undo and redo by button and by Control+Z.",
  css: styles,
  mount,
  task: {
    steps: [
      { ref: "Star chart", action: "drawLine", args: ["Betelgeuse", "Bellatrix"] },
      { ref: "Star chart", action: "drawLine", args: ["Alnitak", "Saiph"] },
      { ref: "Star chart", action: "undo" },
      { ref: "Star chart", action: "redo" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Redid Alnitak to Saiph. 6 lines.",
  },
  breaks: [
    {
      broke: "Control+Z no longer undoes a line.",
      find: '} else if (matchesShortcut(event, "mod+z")) {',
      replace: "} else if (false) {",
      caught: "keyboard: Control+Z undoes the last line, Control+Shift+Z redoes it, and the buttons follow",
    },
    {
      broke: "A drag that ends on a star no longer draws a line.",
      find: 'if (to) tryDraw(key, to, "drag", end)',
      replace: "",
      caught: "pointer: a drag from a star to another star draws a line, and a drop on empty sky draws nothing",
    },
    {
      broke: "The arrow keys no longer follow the stars on the sky.",
      find: "move: spatialMove({",
      replace: "unused: spatialMove({",
      caught: "keyboard: the arrow keys move to the nearest star in their direction, and Home, End go to the first and last star",
    },
    {
      broke: "A line can be drawn twice.",
      find: "if (value.some((line) => joins(line, a, b))) throw",
      replace: "if (false) throw",
      caught: "keyboard: a line that is already drawn, or from a star to itself, is not drawn again",
    },
    {
      broke: "Space on the start star no longer drops the line.",
      find: 'if (anchor === key) announce("Line dropped.")',
      replace: 'if (false) announce("Line dropped.")',
      caught: "keyboard: Space on a star starts a line, Space on a second star draws it, and Space or Escape on the start drops it",
    },
  ],
}

export { starSky }
export default ui
