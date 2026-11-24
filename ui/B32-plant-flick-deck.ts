import { type ChangeDetails, createChange, css, definePrimitive, isRTL, live } from "@ui-sdk/core"
import { createVelocityTracker, projectDistance } from "@ui-sdk/core/gesture"
import { createParts, wrappedButton } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import Matter from "matter-js"
import type { UI } from "../src/ui"

type Side = "start" | "end"
// "flick" is not in the shared vocabulary: a pointer let go of the top card fast or far enough to throw it.
type Reason = "flick" | "item-press" | "imperative"
type Options = {
  plants: Record<string, string>
  known?: string[]
  defaultKnown?: string[]
  onKnownChange?: (value: string[], details: ChangeDetails<Reason>) => void
  again?: string[]
  defaultAgain?: string[]
  onAgainChange?: (value: string[], details: ChangeDetails<Reason>) => void
}
type Drag = { key: string; x: number; lean: Side | null }
// plants is an option that each card renders from, so the state has a copy.
type State = { plants: Record<string, string>; known: string[]; again: string[]; drag: Drag | null }
type Release = { key: string; side: Side | null; speed: number; x: number }

// A release throws the card when the place it would coast to is this far from where it started, in px.
const THROW = 150
const LEAN = 60
const DECAY = 0.994

const deckOf = (state: Pick<State, "plants" | "known" | "again">) =>
  Object.keys(state.plants).filter((id) => !state.known.includes(id) && !state.again.includes(id))

const deck = definePrimitive({
  name: "deck",
  options: {
    plants: "value",
    known: "list",
    defaultKnown: "list",
    onKnownChange: "callback",
    again: "list",
    defaultAgain: "list",
    onAgainChange: "callback",
  },
  controlled: ["known", "again"],
  live: ["drag"],
  state: (options: Options): State => ({
    plants: options.plants,
    known: options.known ?? options.defaultKnown ?? [],
    again: options.again ?? options.defaultAgain ?? [],
    drag: null,
  }),
  sync: (options) => ({
    plants: options.plants,
    ...(options.known === undefined ? {} : { known: options.known }),
    ...(options.again === undefined ? {} : { again: options.again }),
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const tracker = createVelocityTracker()
    let origin = 0
    let rtl = false
    let last: Release | null = null
    const top = () => deckOf(store.get())[0]
    const name = (id: string) => store.get().plants[id]
    // A throw toward the inline end is "known", so right to left mirrors the piles.
    const sideOf = (x: number): Side => (x > 0 !== rtl ? "end" : "start")

    const sort = (side: Side, details: { reason: Reason; event?: Event }, release?: Release) => {
      const key = top()
      if (!key) return false
      last = release ?? { key, side, speed: 0, x: 0 }
      const pile = side === "end" ? "known" : "again"
      return change(pile, [...store.get()[pile], key], details)
    }
    const check = (plant: unknown) => {
      if (plant === undefined) return
      const key = top()
      const text = String(plant).toLowerCase()
      if (key && (key === plant || name(key).toLowerCase() === text)) return
      // The bridge passes an item's value, like "ginkgo", when the agent names its label.
      const asked = name(String(plant)) ?? plant
      throw new Error(key ? `"${asked}" is not the top card. The top card is ${name(key)}.` : "The deck is empty. Use reset to bring the cards back.")
    }

    return {
      sort,
      remaining: () => deckOf(store.get()).map((id) => ({ value: id, label: name(id) })),
      lastRelease: () => last,
      grab: (event: PointerEvent, key: string, el: HTMLElement) => {
        if (event.button !== 0 || key !== top()) return
        try {
          el.setPointerCapture(event.pointerId)
        } catch {}
        rtl = isRTL(el)
        tracker.reset()
        tracker.add(event.timeStamp, event.clientX)
        origin = event.clientX
        last = null
        store.set({ drag: { key, x: 0, lean: null } })
      },
      move: (event: PointerEvent) => {
        const drag = store.get().drag
        if (!drag) return
        const x = event.clientX - origin
        tracker.add(event.timeStamp, event.clientX)
        store.set({ drag: { key: drag.key, x, lean: Math.abs(x) >= LEAN ? sideOf(x) : null } })
      },
      release: (event: PointerEvent) => {
        const drag = store.get().drag
        if (!drag) return
        const x = event.clientX - origin
        const speed = tracker.velocity(event.timeStamp)
        const reach = x + projectDistance(speed, DECAY)
        const side = Math.abs(reach) >= THROW ? sideOf(reach) : null
        const release = { key: drag.key, side, speed, x }
        last = release
        store.set({ drag: null })
        if (side) sort(side, { reason: "flick", event }, release)
      },
      cancel: () => store.set({ drag: null }),
      markKnown: (plant?: unknown) => {
        check(plant)
        return sort("end", { reason: "imperative" })
      },
      studyAgain: (plant?: unknown) => {
        check(plant)
        return sort("start", { reason: "imperative" })
      },
      reset: () => {
        const known = change("known", [], { reason: "imperative" })
        const again = change("again", [], { reason: "imperative" })
        return known || again
      },
    }
  },
  slots: (slot) => ({
    root: slot({ role: "group" }),
    card: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { key }) => {
        const depth = deckOf(state).indexOf(key)
        return {
          hidden: depth < 0 ? "" : undefined,
          "aria-hidden": depth > 0 ? "true" : undefined,
          "data-depth": depth < 0 ? undefined : String(Math.min(depth, 3)),
          "data-sorted": state.known.includes(key) ? "known" : state.again.includes(key) ? "again" : undefined,
        }
      },
      live: live((state, { key }) => {
        const drag = state.drag?.key === key ? state.drag : null
        return {
          "data-dragging": drag ? "" : undefined,
          "data-lean": drag?.lean ?? undefined,
          style: drag ? css({ "--drag-x": `${drag.x}px`, "--tilt": `${drag.x / 16}deg` }) : undefined,
        }
      }),
      on: {
        pointerdown: (event, { el, api, key }) => api.grab(event, key, el!),
        pointermove: (event, { api }) => api.move(event),
        pointerup: (event, { api }) => api.release(event),
        pointercancel: (_event, { api }) => api.cancel(),
      },
    }),
    // Each flick as a button, for the keyboard. Its value is the side it sends the top card to.
    flick: slot<{ value: string }>({
      role: "button",
      focus: "native",
      props: { value: "string" },
      attrs: (state) => ({ type: "button", "aria-disabled": deckOf(state).length ? undefined : "true" }),
      press: ({ api, key }, event) => api.sort(key as Side, { reason: "item-press", event }),
    }),
  }),
  agent: { actions: ["markKnown", "studyAgain", "reset"], items: (api) => api.remaining() },
})

const PLANTS = [
  { id: "oak", name: "English oak", latin: "Quercus robur", family: "Fagaceae", leaf: "Deep, round lobes", grows: "Alternate", clue: "Acorns on long stalks" },
  { id: "maple", name: "Field maple", latin: "Acer campestre", family: "Sapindaceae", leaf: "Palmate, 5 blunt lobes", grows: "Opposite", clue: "Seed wings in a flat line" },
  { id: "birch", name: "Silver birch", latin: "Betula pendula", family: "Betulaceae", leaf: "Triangular, double teeth", grows: "Alternate", clue: "White bark, dark diamonds" },
  { id: "ash", name: "Ash", latin: "Fraxinus excelsior", family: "Oleaceae", leaf: "Pinnate, 7 to 13 leaflets", grows: "Opposite", clue: "Black buds in winter" },
  { id: "beech", name: "Beech", latin: "Fagus sylvatica", family: "Fagaceae", leaf: "Oval, wavy edge", grows: "Alternate", clue: "Smooth grey bark" },
  { id: "ginkgo", name: "Ginkgo", latin: "Ginkgo biloba", family: "Ginkgoaceae", leaf: "Fan, often split in 2", grows: "On short shoots", clue: "Veins fork, no midrib" },
]
const NAMES: Record<string, string> = Object.fromEntries(PLANTS.map((p) => [p.id, p.name]))
const ORDER = PLANTS.map((p) => p.id)
const LABEL: Record<Side, string> = { start: "Study again", end: "I know it" }
const STEP = 1000 / 60

// Leaf drawings, made in code. Each blade is an outline around a midrib, as wide as width(t) from base (0) to tip (1).
type Pt = [number, number]
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const n1 = (v: number) => Math.round(v * 10) / 10
const outline = (pts: Pt[]) => `M${pts.map(([x, y]) => `${n1(x)} ${n1(y)}`).join("L")}Z`
const line = (a: Pt, b: Pt) => `M${n1(a[0])} ${n1(a[1])}L${n1(b[0])} ${n1(b[1])}`
const tooth = (v: number) => v - Math.floor(v)
const bell = (t: number, skew: number, power: number) => Math.pow(Math.sin(Math.PI * Math.pow(t, skew)), power)
const turn = (pts: Pt[], [x, y]: Pt, degrees: number): Pt[] => {
  const a = (degrees * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return pts.map(([px, py]): Pt => [x + px * c - py * s, y + px * s + py * c])
}
const polar = (center: Pt, r: number, a: number): Pt => [center[0] + r * Math.sin(a), center[1] - r * Math.cos(a)]

function leaf(kind: string) {
  const random = seeded([...kind].reduce((sum, ch) => sum * 31 + ch.charCodeAt(0), 7))
  const phase = random() * Math.PI * 2
  const blades: Pt[][] = []
  const veins: string[] = []
  const stems: string[] = []
  const lay = (length: number, width: (t: number) => number, base: Pt, degrees: number, lateral: number[]) => {
    const side: Pt[] = []
    for (let i = 0; i <= 60; i++) side.push([width(i / 60), -(i / 60) * length])
    blades.push(turn([...side, ...side.slice(0, -1).reverse().map(([x, y]): Pt => [-x, y])], base, degrees))
    veins.push(line(base, turn([[0, -length]], base, degrees)[0]))
    for (const t of lateral) {
      const reach = Math.min(0.97, t + 0.1)
      const w = width(reach) * 0.8
      const [from, right, left] = turn([[0, -t * length], [w, -reach * length], [-w, -reach * length]], base, degrees)
      veins.push(line(from, right), line(from, left))
    }
  }
  if (kind === "oak") {
    const width = (t: number) => 31 * bell(t, 0.95, 0.75) * (0.56 + 0.44 * Math.pow(Math.abs(Math.sin(t * Math.PI * 4.6 + 0.35)), 0.7))
    lay(110, width, [60, 128], 0, [0.2, 0.42, 0.64])
    stems.push(line([60, 142], [60, 128]))
  } else if (kind === "birch") {
    const width = (t: number) =>
      34 * Math.pow(Math.min(1, t / 0.12), 0.6) * Math.pow(1 - t, 1.1) + (3 * tooth(t * 12) + 1.2 * tooth(t * 24)) * (1 - t) * Math.min(1, t * 10)
    lay(96, width, [60, 122], 0, [0.12, 0.28, 0.44, 0.6, 0.76])
    stems.push(line([60, 144], [60, 122]))
  } else if (kind === "ash") {
    const width = (t: number) => 9 * bell(t, 0.85, 0.8) + 0.5 * tooth(t * 10) * Math.sin(Math.PI * t)
    for (const [i, y] of [130, 108, 86, 64].entries()) {
      const tilt = 56 + i * 3 + random() * 4
      lay(30, width, [60, y], tilt, [])
      lay(30, width, [60, y], -tilt, [])
    }
    lay(32, width, [60, 42], 0, [])
    stems.push(line([60, 146], [60, 42]))
  } else if (kind === "beech") {
    const width = (t: number) => 30 * bell(t, 0.85, 0.85) + 1.4 * Math.sin(t * Math.PI * 9 + phase) * Math.sin(Math.PI * t)
    lay(106, width, [60, 128], 0, [0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78])
    stems.push(line([60, 142], [60, 128]))
  } else if (kind === "maple") {
    const center: Pt = [60, 80]
    const lobes: Pt[] = [[0, 1], [1.2, 0.9], [-1.2, 0.9], [2.35, 0.58], [-2.35, 0.58]]
    const off = (a: number, c: number) => Math.atan2(Math.sin(a - c), Math.cos(a - c))
    const r = (a: number) => 50 * (0.36 + 0.64 * Math.max(...lobes.map(([c, size]) => size * Math.exp(-((off(a, c) / 0.38) ** 2)))))
    const edge: Pt[] = []
    for (let i = 0; i < 120; i++) {
      const a = -Math.PI + (i / 120) * Math.PI * 2
      edge.push(polar(center, r(a) + 0.8 * Math.sin(a * 14 + phase), a))
    }
    blades.push(edge)
    for (const [c] of lobes) veins.push(line(center, polar(center, r(c) * 0.88, c)))
    stems.push(line([60, 146], polar(center, r(Math.PI), Math.PI)))
  } else {
    const base: Pt = [60, 112]
    const r = (a: number) => 68 * (1 - 0.24 * Math.exp(-((a / 0.08) ** 2))) + 1.6 * Math.sin(a * 22 + phase)
    const edge: Pt[] = [base]
    for (let i = 0; i <= 80; i++) {
      const a = -0.95 + (i / 80) * 1.9
      edge.push(polar(base, r(a), a))
    }
    blades.push(edge)
    for (let i = 0; i <= 10; i++) {
      const a = -0.8 + i * 0.16
      veins.push(line(base, polar(base, r(a) * 0.9, a)))
    }
    stems.push(line([60, 146], base))
  }
  return `<svg data-leaf viewBox="0 0 120 150" aria-hidden="true" focusable="false"><path data-stem d="${stems.join("")}"/><path data-blade d="${blades.map(outline).join("")}"/><path data-veins d="${veins.join("")}"/></svg>`
}

createParts(deck, {
  root: { tag: "b32-deck", display: "block", api: ["reset", "lastRelease"], options: () => ({ plants: NAMES }) },
  card: { tag: "b32-card", display: "block" },
  flick: { tag: "b32-flick", target: wrappedButton, display: "contents" },
})

const card = (p: (typeof PLANTS)[number], i: number) => `<b32-card value="${p.id}"><div data-face>
  <p data-head><span>No. ${String(i + 1).padStart(2, "0")}</span><span>${p.family}</span></p>
  ${leaf(p.id)}
  <h3>${p.name}</h3>
  <p data-latin lang="la">${p.latin}</p>
  <dl><dt>Leaf</dt><dd>${p.leaf}</dd><dt>Grows</dt><dd>${p.grows}</dd><dt>Look for</dt><dd>${p.clue}</dd></dl>
  <span data-stamp="end">I know it</span><span data-stamp="start">Study again</span>
</div></b32-card>`

const pile = (side: Side, title: string) => `<section data-pile="${side}" aria-labelledby="b32-${side}">
  <h3 id="b32-${side}">${title}</h3><p data-count>0 cards</p><ul data-list></ul>
</section>`

const html = `
<h2>Hedgerow trees: leaf cards</h2>
<p id="b32-help">Flick the top card right when you know the tree, or left to study it again. A quick flick throws the card, and a slow drag springs back. The 2 buttons do the same from the keyboard.</p>
<b32-deck aria-label="Plant cards" aria-describedby="b32-help">
  ${pile("start", "Study again")}
  <div data-table>${PLANTS.map(card).join("")}</div>
  ${pile("end", "Known")}
  <div data-buttons><b32-flick value="start"><button>Study again</button></b32-flick><b32-flick value="end"><button>I know it</button></b32-flick></div>
</b32-deck>
<p role="status" data-status>Top card: English oak. 6 cards in the deck.</p>
<ui-button data-reset><button>Start over</button></ui-button>
<div data-fly aria-hidden="true"></div>`

const styles = `
[data-stage] { display: grid; gap: 20px; justify-items: start; }
[data-stage] h2, [data-stage] h3, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] #b32-help { max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
[data-stage] [data-status] { max-width: 60ch; font-size: 0.875rem; }
[data-stage] b32-deck {
  display: grid; grid-template-columns: 180px 300px 180px; grid-template-areas: "start table end" ". buttons .";
  gap: 20px 40px; align-items: start;
}
[data-stage] [data-pile] {
  display: grid; gap: 6px; align-content: start; min-height: 180px; margin-top: 24px; padding: 16px;
  border: 1px dashed var(--ui-border); border-radius: var(--ui-radius);
}
[data-stage] [data-pile="start"] { grid-area: start; }
[data-stage] [data-pile="end"] { grid-area: end; }
[data-stage] [data-pile] h3 { font-size: 0.875rem; font-weight: 600; }
[data-stage] [data-count] { color: var(--ui-muted-foreground); font-size: 0.8125rem; }
[data-stage] [data-list] { display: grid; gap: 4px; margin: 4px 0 0; padding: 0; list-style: none; font-size: 0.875rem; }
[data-stage] [data-list] li { padding: 4px 8px; border-radius: var(--ui-radius); background: var(--ui-muted); }
[data-stage] [data-table] { grid-area: table; position: relative; width: 300px; height: 410px; }
[data-stage] b32-card {
  position: absolute; inset: 0 0 26px; touch-action: pan-y; user-select: none; -webkit-user-select: none;
  transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
[data-stage] b32-card[hidden] { display: none; }
[data-stage] b32-card[data-depth="0"] { z-index: 4; cursor: grab; transform: translateX(var(--drag-x, 0px)) rotate(var(--tilt, 0deg)); }
[data-stage] b32-card[data-dragging] { cursor: grabbing; transition: none; }
[data-stage] b32-card[data-depth="1"] { z-index: 3; transform: translateY(9px) rotate(-2.5deg); }
[data-stage] b32-card[data-depth="2"] { z-index: 2; transform: translateY(17px) rotate(2deg); }
[data-stage] b32-card[data-depth="3"] { z-index: 1; transform: translateY(24px) rotate(-1deg); }
[data-stage] b32-card:not([data-depth="0"]) [data-face] > * { visibility: hidden; }
[data-stage] [data-face] {
  position: relative; display: grid; grid-template-rows: auto auto auto auto 1fr; justify-items: center; gap: 4px;
  height: 100%; padding: 12px 18px 14px; border: 1px solid #c9bc98; border-radius: 10px;
  background: #f4eddb; color: #2b2a22; box-shadow: 0 12px 28px rgb(0 0 0 / 0.4);
  font-family: Georgia, "Times New Roman", serif;
}
[data-stage] [data-head] {
  display: flex; justify-content: space-between; width: 100%; padding-bottom: 6px; border-bottom: 1px solid #d6c9a6;
  color: #7a3417; font: 600 0.6875rem/1.4 system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase;
}
[data-stage] [data-head] span + span { color: #5b5440; }
[data-stage] svg[data-leaf] { width: 120px; height: 150px; }
[data-stage] [data-stem] { fill: none; stroke: #4a3a24; stroke-width: 2.2; stroke-linecap: round; }
[data-stage] [data-blade] { fill: #a8c389; stroke: #2f3d22; stroke-width: 1.1; stroke-linejoin: round; }
[data-stage] [data-veins] { fill: none; stroke: #3e5230; stroke-width: 0.7; stroke-linecap: round; }
[data-stage] [data-face] h3 { font-size: 1.25rem; font-weight: 600; line-height: 1.2; }
[data-stage] [data-latin] { color: #5b5440; font-size: 0.875rem; font-style: italic; }
[data-stage] [data-face] dl {
  display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; align-self: end; width: 100%;
  margin: 0; padding-top: 8px; border-top: 1px solid #d6c9a6; font-size: 0.8125rem; line-height: 1.35;
}
[data-stage] [data-face] dt { color: #7a3417; font: 600 0.6875rem/1.6 system-ui, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
[data-stage] [data-face] dd { margin: 0; }
[data-stage] [data-stamp] {
  display: none; position: absolute; top: 30%; left: 50%; padding: 4px 12px; border: 3px solid; border-radius: 6px;
  background: #f4eddb; font: 700 1.125rem/1.2 system-ui, sans-serif; letter-spacing: 0.06em; text-transform: uppercase;
  transform: translate(-50%, -50%) rotate(-10deg);
}
[data-stage] [data-stamp="end"] { color: #2f6b2f; }
[data-stage] [data-stamp="start"] { color: #9a3412; }
[data-stage] b32-card[data-lean="end"] [data-stamp="end"], [data-stage] b32-card[data-lean="start"] [data-stamp="start"],
[data-stage] [data-ghost="end"] [data-stamp="end"], [data-stage] [data-ghost="start"] [data-stamp="start"] { display: block; }
[data-stage] [data-buttons] { grid-area: buttons; display: flex; justify-content: center; gap: 12px; }
[data-stage] b32-flick button, [data-stage] ui-button button {
  height: 36px; padding: 0 16px; border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); font: inherit; font-size: 0.875rem; cursor: pointer;
}
[data-stage] b32-flick[value="end"] button { border-color: var(--ui-primary); background: var(--ui-primary); color: var(--ui-primary-foreground); font-weight: 600; }
[data-stage] b32-flick button[aria-disabled="true"] { cursor: default; border-style: dashed; }
[data-stage] b32-flick button:focus-visible, [data-stage] ui-button button:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] [data-fly] { position: fixed; inset: 0; z-index: 20; pointer-events: none; }
[data-stage] [data-fly] [data-face] { position: absolute; }
@media (prefers-reduced-motion: reduce) {
  [data-stage] b32-card { transition: none; }
}
`

type DeckElement = HTMLElement & { api: { reset: () => boolean; lastRelease: () => Release | null } }

function mount(root: HTMLElement) {
  root.innerHTML = html
  const { Engine, Bodies, Body, Composite } = Matter
  const box = root.querySelector<DeckElement>("b32-deck")!
  const status = root.querySelector("[data-status]")!
  const layer = root.querySelector<HTMLElement>("[data-fly]")!
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  let known: string[] = []
  let again: string[] = []
  let reported: Release | null = null
  const top = () => ORDER.find((id) => !known.includes(id) && !again.includes(id))
  const after = () => (top() ? `Next card: ${NAMES[top()!]}.` : "The deck is empty.")
  const cards = (n: number) => `${n} card${n === 1 ? "" : "s"}`
  const speed = (release: Release) => Math.abs(release.speed).toFixed(1)

  const piles = () => {
    for (const [side, list] of [["start", again], ["end", known]] as const) {
      const el = root.querySelector(`[data-pile="${side}"]`)!
      el.querySelector("[data-count]")!.textContent = cards(list.length)
      el.querySelector("[data-list]")!.innerHTML = list.map((id) => `<li>${NAMES[id]}</li>`).join("")
    }
  }

  // The thrown card is a copy of its face that matter-js flies off the page. The deck state changed already.
  let engine: Matter.Engine | null = null
  let frame = 0
  let clock = 0
  let carry = 0
  const flying: { body: Matter.Body; ghost: HTMLElement; x: number; y: number; born: number }[] = []
  const tick = (now: number) => {
    if (!root.isConnected || !engine) {
      for (const f of flying) f.ghost.remove()
      flying.length = 0
      frame = 0
      return
    }
    carry += Math.min(now - clock, 100)
    clock = now
    // Engine.update warns above 1000 / 60 ms, so the frame time goes in fixed steps.
    while (carry >= STEP) {
      Engine.update(engine, STEP)
      carry -= STEP
    }
    for (const f of [...flying]) {
      const age = now - f.born
      f.ghost.style.transform = `translate(${f.body.position.x - f.x}px, ${f.body.position.y - f.y}px) rotate(${f.body.angle}rad)`
      f.ghost.style.opacity = String(Math.max(0, 1 - Math.max(0, age - 250) / 650))
      if (age > 900) {
        f.ghost.remove()
        Composite.remove(engine.world, f.body)
        flying.splice(flying.indexOf(f), 1)
      }
    }
    frame = flying.length ? requestAnimationFrame(tick) : 0
  }
  const fling = (id: string, side: Side) => {
    const el = box.querySelector<HTMLElement>(`b32-card[value="${id}"]`)
    const face = el?.querySelector<HTMLElement>("[data-face]")
    const rect = el?.getBoundingClientRect()
    if (still || !face || !rect?.width) return
    const release = box.api.lastRelease()
    const dir = (side === "end") !== isRTL(box) ? 1 : -1
    const w = face.offsetWidth
    const h = face.offsetHeight
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const ghost = face.cloneNode(true) as HTMLElement
    ghost.dataset.ghost = side
    ghost.style.cssText = `left: ${x - w / 2}px; top: ${y - h / 2}px; width: ${w}px; height: ${h}px;`
    layer.append(ghost)
    if (!engine) {
      engine = Engine.create()
      engine.gravity.y = 0.7
    }
    const body = Bodies.rectangle(x, y, w, h, { frictionAir: 0.012 })
    Body.setAngle(body, (((release?.x ?? 0) / 16) * Math.PI) / 180)
    Body.setVelocity(body, { x: dir * Math.min(Math.max(Math.abs(release?.speed ?? 0), 1.2), 3) * STEP, y: -6 })
    Body.setAngularVelocity(body, dir * 0.035)
    Composite.add(engine.world, body)
    ghost.style.transform = `rotate(${body.angle}rad)`
    flying.push({ body, ghost, x, y, born: performance.now() })
    if (!frame) {
      clock = performance.now()
      carry = 0
      frame = requestAnimationFrame(tick)
    }
  }

  const sorted = (side: Side, event: Event) => {
    const { value, reason } = (event as CustomEvent<{ value: string[]; reason: string }>).detail
    const added = value.find((id) => !(side === "end" ? known : again).includes(id))
    if (side === "end") known = value
    else again = value
    piles()
    if (!added) {
      status.textContent = `All ${cards(ORDER.length)} are back in the deck. Top card: ${NAMES[top()!]}.`
      return
    }
    const release = box.api.lastRelease()
    const how = reason === "flick" && release ? `, thrown at ${speed(release)} px/ms` : ""
    status.textContent = `${LABEL[side]}: ${NAMES[added]}${how}. ${after()}`
    fling(added, side)
  }
  box.addEventListener("knownchange", (event) => sorted("end", event))
  box.addEventListener("againchange", (event) => sorted("start", event))
  box.addEventListener("pointerup", () => {
    const release = box.api.lastRelease()
    if (!release || release === reported || release.side || Math.abs(release.x) < 4) return
    reported = release
    status.textContent = `Too slow to throw (${speed(release)} px/ms): ${NAMES[release.key]} stays on top.`
  })
  root.querySelector("[data-reset]")!.addEventListener("action", () => {
    if (!box.api.reset()) status.textContent = `All ${cards(ORDER.length)} are in the deck already.`
  })
}

const ui: UI = {
  id: "B32",
  request:
    "Build a deck of plant identification cards: a person flicks the top card right when they know the plant or left to study it again, the release speed decides whether the card is thrown or springs back, and 2 buttons do the same from the keyboard.",
  css: styles,
  mount,
  task: {
    steps: [
      { ref: "Plant cards", action: "markKnown", args: ["English oak"] },
      { ref: "Plant cards", action: "studyAgain", args: ["Field maple"] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Study again: Field maple. Next card: Silver birch." &&
      root.querySelector('[data-pile="end"] [data-list]')!.textContent === "English oak" &&
      root.querySelector('b32-card[value="birch"]')!.getAttribute("data-depth") === "0",
  },
  breaks: [
    {
      broke: "The release speed is ignored: only the distance moved decides a throw.",
      find: "const reach = x + projectDistance(speed, DECAY)",
      replace: "const reach = x",
      caught: "pointer: at the same distance, a quick flick throws the card, and a slow drag or a stop before release springs back",
    },
    {
      broke: "The flick buttons no longer sort the top card.",
      find: 'press: ({ api, key }, event) => api.sort(key as Side, { reason: "item-press", event }),',
      replace: "press: () => {},",
      caught: "keyboard: Tab reaches the 2 flick buttons, and Space and Enter sort the top card",
    },
    {
      broke: "A flick ignores the text direction, so in right to left it goes to the wrong pile.",
      find: "rtl = isRTL(el)",
      replace: "rtl = false",
      caught: "direction: in right to left, a flick to the right sends the card to Study again",
    },
    {
      broke: "The cards under the top card are exposed to screen readers.",
      find: '"aria-hidden": depth > 0 ? "true" : undefined,',
      replace: "",
      caught: "keyboard: Tab reaches the 2 flick buttons, and Space and Enter sort the top card",
    },
    {
      broke: "The flick buttons stay enabled on an empty deck.",
      find: '"aria-disabled": deckOf(state).length ? undefined : "true"',
      replace: '"aria-disabled": undefined',
      caught: "keyboard: on an empty deck the buttons are disabled and keep focus, and reset brings the cards back",
    },
    {
      broke: "An agent can sort a card that is not on top.",
      find: "if (key && (key === plant || name(key).toLowerCase() === text)) return",
      replace: "return",
      caught: "agent: an agent finds the deck and its cards, sorts the top 2, and a card that is not on top is refused",
    },
  ],
}

export { deck }
export default ui
