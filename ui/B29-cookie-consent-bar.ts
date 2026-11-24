import {
  bindPersistentLayer,
  type ChangeDetails,
  createChange,
  createCookieStorage,
  createRovingFocus,
  definePrimitive,
} from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import "@ui-sdk/web/popover"
import type { UI } from "../src/ui"

type Reason = "item-press" | "imperative"
type Options = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, details: ChangeDetails<Reason>) => void
}
// value is "" until a person chooses. focused is the key of the choice with the tab stop.
type State = { focused: string | null; value: string }

const CHOICES = ["all", "essential"]
const LABELS: Record<string, string> = { all: "Accept all", essential: "Essential only" }

const consentBar = definePrimitive({
  name: "consent-bar",
  options: { value: "string", defaultValue: "string", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({ focused: null, value: options.value ?? options.defaultValue ?? "" }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus<State, { value: string }>(context, {
      slot: "choice",
      key: "focused",
      orientation: () => "horizontal",
    })
    const choose = (value: string, event?: Event) =>
      CHOICES.includes(value) && change("value", value, { reason: event ? "item-press" : "imperative", event })
    const reset = (event?: Event) => change("value", "", { reason: event ? "item-press" : "imperative", event })
    return { roving, choose, reset, choices: () => CHOICES }
  },
  slots: (slot) => ({
    // The bar stays usable while a modal layer makes the rest of the page inert, and stays above that layer.
    root: slot({
      role: "group",
      keys: { none: "Each choice handles the arrow keys." },
      attrs: (state) => ({ "data-decided": state.value ? "" : undefined, "data-value": state.value || undefined }),
      bind: (el) => bindPersistentLayer(el),
    }),
    ask: slot({ present: (state) => state.value === "" }),
    choice: slot<{ value: string }>({
      role: "button",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, part) => ({ type: "button", tabindex: part.api.roving.tabIndex(state, part) }),
      press: ({ api, key }, event) => void api.choose(key, event),
      on: {
        keydown: (event, { el, api }) => {
          if (el) api.roving.keydown(event, el)
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
    reopen: slot({
      role: "button",
      focus: "native",
      present: (state) => state.value !== "",
      attrs: () => ({ type: "button" }),
      press: ({ api }, event) => void api.reset(event),
    }),
  }),
  agent: {
    actions: ["choose", "reset"],
    closed: true,
    items: (api) => api.choices().map((value) => ({ value, label: LABELS[value] })),
  },
})

createParts(consentBar, {
  root: { tag: "b29-consent", display: "block", api: ["choose", "reset"] },
  ask: { tag: "b29-ask", display: "block" },
  choice: { tag: "b29-choice", display: "contents", target: wrappedButton },
  reopen: { tag: "b29-reopen", display: "contents", target: wrappedButton },
})

// The pixel scene is 180 x 105 dots. The canvas is scaled up with no smoothing.
const W = 180
const H = 105
const GROUND = 80
const SKY = ["#12082b", "#1a0b3a", "#26104d", "#3a1560", "#55197a", "#7a2185", "#a02a8e"]
const ALIEN = [
  ["..#...#..", "...###...", ".#######.", "##.###.##", "#########", ".#.###.#.", ".#.....#."],
  ["..#...#..", "...###...", ".#######.", "##.###.##", "#########", "#.#####.#", "...#.#..."],
]
const ROCKET = ["..ooo....", ".ooooo.#.", "ooooooooo", ".ooooo.#.", "..ooo...."]
const COIN = [
  ["..##..", ".#oo#.", "#o##o#", "#o##o#", ".#oo#.", "..##.."],
  [".##.", "#oo#", "#oo#", "#oo#", "#oo#", ".##."],
  ["##", "##", "##", "##", "##", "##"],
  [".##.", "#oo#", "#oo#", "#oo#", "#oo#", ".##."],
]

// Seeded random numbers, so the scene is the same on each run.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

type Window = { x: number; y: number; color: string; phase: number }
type Building = { x: number; y: number; w: number; windows: Window[] }

function world() {
  const random = seeded(29)
  const stars = Array.from({ length: 38 }, () => ({
    x: Math.floor(random() * W),
    y: Math.floor(random() * 62),
    phase: Math.floor(random() * 6),
    big: random() < 0.2,
  }))
  const buildings: Building[] = []
  for (let x = 0; x < W; ) {
    const w = 10 + Math.floor(random() * 8)
    const h = 14 + Math.floor(random() * 26)
    const windows: Window[] = []
    for (let wy = GROUND - h + 3; wy < GROUND - 3; wy += 4)
      for (let wx = x + 2; wx < x + w - 2; wx += 4)
        if (random() < 0.4)
          windows.push({ x: wx, y: wy, color: random() < 0.5 ? "#ffd23f" : "#5ef0c0", phase: Math.floor(random() * 17) })
    buildings.push({ x, y: GROUND - h, w, windows })
    x += w + 1
  }
  return { stars, buildings }
}

function paint(ctx: CanvasRenderingContext2D, scene: ReturnType<typeof world>, n: number) {
  const dot = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(Math.round(x), Math.round(y), w, h)
  }
  const sprite = (rows: string[], x: number, y: number, palette: Record<string, string>) =>
    rows.forEach((row, ry) =>
      [...row].forEach((ch, rx) => {
        if (palette[ch]) dot(x + rx, y + ry, 1, 1, palette[ch])
      }),
    )

  SKY.forEach((color, i) => dot(0, Math.floor((i * GROUND) / SKY.length), W, Math.ceil(GROUND / SKY.length) + 1, color))
  for (const star of scene.stars) {
    if ((n + star.phase) % 6 >= 4) continue
    dot(star.x, star.y, 1, 1, "#f4eefc")
    if (star.big) {
      dot(star.x - 1, star.y, 3, 1, "#f4eefc")
      dot(star.x, star.y - 1, 1, 3, "#f4eefc")
    }
  }
  // Moon: a disc of dots with 3 craters.
  for (let dy = -6; dy <= 6; dy++)
    for (let dx = -6; dx <= 6; dx++) if (dx * dx + dy * dy <= 36) dot(142 + dx, 46 + dy, 1, 1, "#f4eefc")
  for (const [cx, cy] of [[140, 44], [145, 48], [141, 50]]) dot(cx, cy, 2, 2, "#cfc3ea")

  for (const b of scene.buildings) {
    dot(b.x, b.y, b.w, GROUND - b.y, "#0d0620")
    dot(b.x, b.y, b.w, 1, "#2a1a52")
    b.windows.forEach((w, i) => {
      if ((n + w.phase + i) % 17 !== 0) dot(w.x, w.y, 2, 2, w.color)
    })
  }
  dot(0, GROUND, W, 1, "#5b3f99")
  for (let ty = GROUND + 1, row = 0; ty < H; ty += 5, row++)
    for (let tx = 0; tx < W; tx += 10)
      dot(tx + (row % 2) * 5, ty, 5, 5, ((tx / 10 + row) | 0) % 2 ? "#22104a" : "#1a0b3a")

  // 2 rows of 5 aliens sway to the right and back, and each alien steps its legs once a frame.
  const phase = n % 12
  const sway = (phase < 6 ? phase : 12 - phase) * 2
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 5; col++)
      sprite(ALIEN[n % 2], 98 + sway + col * 13, 12 + row * 12, { "#": row ? "#5ef0c0" : "#7cfc5a" })

  const rocketX = ((n * 3) % (W + 24)) - 12
  sprite(ROCKET, rocketX, 68 + ((n >> 1) % 2), { o: "#f4eefc", "#": "#fb923c" })
  if (n % 2) dot(rocketX - 3, 70, 3, 1, "#ffd23f")
  for (const [cx, cy, shift] of [[30, 60, 0], [70, 56, 1], [112, 62, 2]]) {
    const frame = COIN[(n + shift) % 4]
    sprite(frame, cx + (6 - frame[0].length) / 2, cy, { "#": "#b8860b", o: "#ffd23f" })
  }
}

function startScene(canvas: HTMLCanvasElement, host: Element) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const scene = world()
  let n = 0
  paint(ctx, scene, n)
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
  let last = performance.now()
  const tick = (now: number) => {
    if (!host.isConnected) return
    if (now - last >= 125) {
      last = now
      paint(ctx, scene, ++n)
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const SCORES = [
  ["AAA", "98,400"],
  ["ZED", "77,250"],
  ["MOO", "61,900"],
  ["K9X", "52,300"],
  ["PIX", "40,010"],
]

const html = (value: string) => `
<div data-scene>
  <canvas aria-hidden="true" width="${W}" height="${H}"></canvas>
  <div data-marquee>
    <h2>Pixel Palace Arcade</h2>
    <p>48 cabinets. Open until midnight.</p>
    <ui-popover modal="true">
      <ui-popover-trigger><button>High scores</button></ui-popover-trigger>
      <ui-popover-content>
        <ui-popover-title>High scores</ui-popover-title>
        <ol data-scores>${SCORES.map(([name, points]) => `<li><span>${name}</span><span>${points}</span></li>`).join("")}</ol>
        <ui-popover-close><button>Close scores</button></ui-popover-close>
      </ui-popover-content>
    </ui-popover>
  </div>
  <b29-consent popover="manual" aria-label="Cookie consent" default-value="${value}">
    <b29-ask>
      <p>We keep 1 cookie that remembers this choice. Accept all also allows game stats and ads.</p>
      <div data-choices>
        <b29-choice value="all"><button>Accept all</button></b29-choice>
        <b29-choice value="essential"><button>Essential only</button></b29-choice>
      </div>
    </b29-ask>
    <b29-reopen><button>Cookie settings</button></b29-reopen>
  </b29-consent>
</div>
<p role="status" data-status></p>
<p data-cookie></p>`

const css = `
[data-stage] {
  display: grid; gap: 10px; max-width: 720px;
  --ui-background: #1b1035; --ui-foreground: #f4eefc; --ui-muted: #2a1a52; --ui-muted-foreground: #cfc3ea;
  --ui-border: #5b3f99; --ui-input: #9b86cf; --ui-primary: #ffd23f; --ui-primary-foreground: #1b1035;
  --ui-ring: #5ef0c0; --ui-radius: 0px;
}
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] [data-scene] {
  position: relative; anchor-name: --b29-scene; width: 100%; aspect-ratio: ${W} / ${H}; min-height: 380px;
  border: 2px solid var(--ui-border); background: #12082b;
}
[data-stage] [data-scene] canvas {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated;
}
[data-stage] [data-marquee] {
  position: absolute; top: 16px; left: 16px; display: grid; gap: 10px; justify-items: start; max-width: 320px;
  padding: 14px 16px; background: var(--ui-background); border: 2px solid var(--ui-border); box-shadow: 4px 4px 0 #0a0518;
}
[data-stage] [data-marquee] h2 {
  color: var(--ui-primary); font: 700 1.25rem/1.1 ui-monospace, Consolas, monospace;
  letter-spacing: 0.08em; text-transform: uppercase;
}
[data-stage] [data-marquee] p { color: var(--ui-foreground); font-size: 0.875rem; }
[data-stage] [data-scores] { display: grid; gap: 4px; margin: 8px 0 12px; padding: 0; list-style: none; font-family: ui-monospace, Consolas, monospace; }
[data-stage] [data-scores] li { display: flex; justify-content: space-between; gap: 32px; }
[data-stage] b29-consent[popover] {
  position: fixed; inset: auto; margin: 0 12px 12px; padding: 0; border: 0; background: none; overflow: visible;
  width: auto; height: auto; color: var(--ui-foreground); pointer-events: none;
  position-anchor: --b29-scene; left: anchor(left); right: anchor(right); bottom: anchor(bottom);
}
[data-stage] b29-consent[data-decided] { right: auto; }
[data-stage] b29-ask:not([hidden]) {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 20px; pointer-events: auto;
  padding: 12px 16px; background: var(--ui-background); border: 2px solid var(--ui-border); box-shadow: 4px 4px 0 #0a0518;
}
[data-stage] b29-ask p { flex: 1 1 260px; max-width: 60ch; font-size: 0.875rem; }
[data-stage] [data-choices] { display: flex; flex-wrap: wrap; gap: 8px; }
[data-stage] b29-reopen:not([hidden]) { display: block; width: max-content; pointer-events: auto; }
[data-stage] b29-choice button, [data-stage] b29-reopen button {
  all: unset; box-sizing: border-box; padding: 8px 14px; border: 2px solid var(--ui-input); cursor: pointer;
  background: var(--ui-background); color: var(--ui-foreground); font: 600 0.8125rem/1.2 ui-monospace, Consolas, monospace;
  box-shadow: 3px 3px 0 #0a0518;
}
[data-stage] b29-choice[value="all"] button { border-color: var(--ui-primary); background: var(--ui-primary); color: var(--ui-primary-foreground); }
[data-stage] b29-choice button:hover, [data-stage] b29-reopen button:hover { border-color: var(--ui-foreground); }
[data-stage] b29-choice button:focus-visible, [data-stage] b29-reopen button:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] [data-status] { color: var(--ui-foreground); font-size: 0.9375rem; }
[data-stage] [data-cookie] { color: var(--ui-muted-foreground); font: 0.8125rem/1.4 ui-monospace, Consolas, monospace; }
`

type Consent = HTMLElement & { api: { choose(value: string): boolean; reset(): boolean } }

const SAID: Record<string, string> = {
  "": "No choice saved. The bar waits for an answer.",
  all: "Saved choice: all cookies.",
  essential: "Saved choice: essential cookies only.",
}

// A browser stores no cookie for a file: page and warns on each access to document.cookie, so such a page keeps the choice in memory.
const cookiesWork = () => location.protocol !== "file:"

function mount(root: HTMLElement) {
  let held: string | null = null
  const storage = cookiesWork()
    ? createCookieStorage("b29-consent", { maxAge: 31536000 })
    : { get: () => held, set: (value: string) => ((held = value), true), remove: () => ((held = null), true) }
  const saved = storage.get()
  const start = saved && CHOICES.includes(saved) ? saved : ""
  root.innerHTML = html(start)
  const bar = root.querySelector<Consent>("b29-consent")!
  const status = root.querySelector("[data-status]")!
  const cookie = root.querySelector("[data-cookie]")!
  const report = (value: string) => {
    status.textContent = SAID[value]
    cookie.textContent = !cookiesWork()
      ? "Cookie: none. A file page cannot store one."
      : value
        ? `Cookie: b29-consent=${value}`
        : "Cookie: none."
  }
  report(start)
  startScene(root.querySelector("canvas")!, root)
  // A popover with popover="manual" joins the top layer, so the bar draws above a modal layer that opens later.
  try {
    bar.showPopover()
  } catch {
    // The browser has no popover support, and the bar stays in the page.
  }

  bar.addEventListener("valuechange", (event) => {
    const { value } = (event as CustomEvent<{ value: string }>).detail
    if (value) storage.set(value)
    else storage.remove()
    report(value)
    // A press on a choice hides the question and shows the settings button, so focus follows it.
    if (bar.contains(document.activeElement)) {
      const target = bar.querySelector<HTMLElement>(value ? "b29-reopen button" : "b29-choice button")
      setTimeout(() => target?.focus(), 0)
    }
  })
}

const ui: UI = {
  id: "B29",
  request:
    "Build a cookie consent bar for a retro arcade landing page. It stays over the page, even above a modal dialog, it saves the choice in a cookie, and a person can change the choice later.",
  css,
  mount,
  task: {
    steps: [{ ref: "Cookie consent", action: "choose", args: ["essential"] }],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Saved choice: essential cookies only." &&
      (!cookiesWork() || document.cookie.includes("b29-consent=essential")),
  },
  breaks: [
    {
      broke: "The arrow keys no longer move focus between the choices.",
      find: "if (el) api.roving.keydown(event, el)",
      replace: "void el",
      caught: "keyboard: arrow keys, Home and End move focus between the choices",
    },
    {
      broke: "The bar is no longer a persistent layer, so a modal layer makes it inert.",
      find: "bind: (el) => bindPersistentLayer(el),",
      replace: "",
      caught: "keyboard: the bar stays usable while a modal layer is open",
    },
    {
      broke: "The api accepts a value that is no choice.",
      find: "CHOICES.includes(value) &&",
      replace: "",
      caught: "api: choose refuses a value that is no choice",
    },
    {
      broke: "A choice is not written to the cookie.",
      find: "if (value) storage.set(value)",
      replace: "if (value) void value",
      caught: "keyboard: Essential only writes the cookie and Cookie settings removes it",
    },
    {
      broke: "A saved cookie is not read when the page mounts.",
      find: 'const start = saved && CHOICES.includes(saved) ? saved : ""',
      replace: 'const start = ""',
      caught: "keyboard: a saved cookie starts the bar already decided",
    },
    {
      broke: "Focus does not follow the press to the new button.",
      find: "setTimeout(() => target?.focus(), 0)",
      replace: "void target",
      caught: "keyboard: after a choice focus moves to Cookie settings, and after Cookie settings back to Accept all",
    },
  ],
}

export { consentBar, startScene }
export default ui
