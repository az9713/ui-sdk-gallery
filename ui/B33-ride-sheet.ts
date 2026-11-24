import {
  bindAvoidKeyboard,
  bindLayer,
  bindViewport,
  type ChangeDetails,
  createChange,
  definePrimitive,
  type LayerDismissReason,
} from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import type { UI } from "../src/ui"

type Reason = "trigger-press" | "focus-in" | LayerDismissReason | "imperative"
type Options = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, details: ChangeDetails<Reason>) => void
}
type State = { open: boolean }

const tripSheet = definePrimitive({
  name: "trip-sheet",
  options: { open: "boolean", defaultOpen: "boolean", onOpenChange: "callback" },
  controlled: ["open"],
  state: (options: Options): State => ({ open: options.open ?? options.defaultOpen ?? false }),
  sync: (options) => (options.open === undefined ? {} : { open: options.open }),
  api: (context) => {
    const change = createChange(context)
    const set = (open: boolean, reason: Reason, event?: Event) =>
      change("open", open, { reason, event } as ChangeDetails<Reason>)
    return {
      expand: (event?: Event, reason?: Reason) => set(true, reason ?? (event ? "trigger-press" : "imperative"), event),
      collapse: (event?: Event, reason?: Reason) => set(false, reason ?? (event ? "trigger-press" : "imperative"), event),
      toggle: (event?: Event) => set(!context.store.get().open, event ? "trigger-press" : "imperative", event),
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-open": state.open ? "" : undefined }),
      on: {
        focusin: (event, { api }) => {
          if ((event.target as Element).localName === "input") api.expand(event, "focus-in")
        },
      },
      // The sheet is a layer only while it is open: then Escape and a press on the map fold it down.
      bind: (el, part) => {
        const stopViewport = bindViewport(el)
        let stopLayer: (() => void) | undefined
        const follow = () => {
          const open = part.store.get().open
          if (open && !stopLayer) stopLayer = bindLayer(el, { onDismiss: (reason, event) => part.api.collapse(event, reason) })
          else if (!open && stopLayer) {
            stopLayer()
            stopLayer = undefined
          }
        }
        follow()
        const unsubscribe = part.store.subscribe(follow)
        return () => {
          unsubscribe()
          stopLayer?.()
          stopViewport()
        }
      },
    }),
    surface: slot({ bind: (el) => bindAvoidKeyboard(el) }),
    handle: slot({
      role: "button",
      focus: "native",
      attrs: (state, { id }) => ({ type: "button", "aria-expanded": String(state.open), "aria-controls": `${id}-info` }),
      press: ({ api }, event) => void api.toggle(event),
      on: {
        keydown: (event, { api }) => {
          if (event.key === "ArrowUp") {
            event.preventDefault()
            api.expand(event)
          } else if (event.key === "ArrowDown") {
            event.preventDefault()
            api.collapse(event)
          }
        },
      },
    }),
    info: slot({ present: (state) => state.open, attrs: (_, { id }) => ({ id: `${id}-info` }) }),
  }),
  agent: { actions: ["expand", "collapse"] },
})

createParts(tripSheet, {
  root: { tag: "b33-trip-sheet", display: "block", api: ["expand", "collapse"] },
  surface: { tag: "b33-sheet-surface", display: "block" },
  handle: { tag: "b33-sheet-handle", display: "contents", target: wrappedButton },
  info: { tag: "b33-sheet-info", display: "block" },
})

// The map is 380 x 720, the size of the phone screen.
const W = 380
const H = 720
const AVENUES = [34, 118, 202, 286, 356]
const STREETS = [52, 136, 232, 316, 400, 484, 568, 652]
const PARK = { x: 118, y: 316 }
const RIVER = "M -20 186 C 90 152, 220 218, 400 176"
const ROUTE = "M356 136 V232 H286 V400 H202"
const SHADES = ["#222b3c", "#263045", "#2a344b"]

// Seeded random numbers, so the map is the same on each run.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function streetMap() {
  const random = seeded(33)
  const xs = [-10, ...AVENUES, W + 10]
  const ys = [-10, ...STREETS, H + 10]
  const shapes: string[] = []
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++) {
      const x0 = xs[i] + 8
      const x1 = xs[i + 1] - 8
      const y0 = ys[j] + 8
      const y1 = ys[j + 1] - 8
      if (ys[j] === 136) continue
      if (xs[i] === PARK.x && ys[j] === PARK.y) {
        shapes.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="6" fill="#1c3a30"/>`)
        for (let k = 0; k < 7; k++)
          shapes.push(
            `<circle cx="${(x0 + 8 + random() * (x1 - x0 - 16)).toFixed(1)}" cy="${(y0 + 8 + random() * (y1 - y0 - 16)).toFixed(1)}" r="${(3 + random() * 3).toFixed(1)}" fill="#24503f"/>`,
          )
        continue
      }
      // 2 or 3 buildings side by side fill each block.
      const weights = Array.from({ length: 2 + Math.floor(random() * 2) }, () => 0.7 + random() * 0.6)
      const total = weights.reduce((sum, n) => sum + n, 0)
      let x = x0
      for (const weight of weights) {
        const w = ((x1 - x0) * weight) / total
        const inset = Math.floor(random() * 6)
        shapes.push(
          `<rect x="${x.toFixed(1)}" y="${y0 + inset}" width="${(w - 3).toFixed(1)}" height="${y1 - y0 - inset}" rx="3" fill="${SHADES[Math.floor(random() * SHADES.length)]}"/>`,
        )
        x += w
      }
    }
  const streets = STREETS.map((y) => `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#334155" stroke-width="10"/>`).join("")
  const avenues = AVENUES.map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#3b4a63" stroke-width="13"/>`).join("")
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">
  <rect width="${W}" height="${H}" fill="#1a2232"/>
  ${shapes.join("")}
  <path d="${RIVER}" fill="none" stroke="#1b3a5c" stroke-width="40"/>
  ${streets}${avenues}
  <path d="${ROUTE}" fill="none" stroke="#0f172a" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${ROUTE}" fill="none" stroke="#2dd4bf" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
  <path data-flow d="${ROUTE}" fill="none" stroke="#f0fdfa" stroke-width="2" stroke-dasharray="4 12" stroke-linecap="round"/>
  <circle data-pulse cx="202" cy="400" r="16" fill="#fb923c"/>
  <circle cx="202" cy="400" r="8" fill="#fb923c" stroke="#0f172a" stroke-width="3"/>
  <g transform="translate(356 136)"><rect x="-8" y="-12" width="16" height="24" rx="5" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/><rect x="-5" y="-6" width="10" height="6" rx="2" fill="#0f172a"/></g>
</svg>`
}

const html = () => `
<div data-phone>
  <div data-map role="img" aria-label="Map: the nearest car is 4 minutes away on its route to your pickup at 5th Ave and Pine St.">
    ${streetMap()}
    <span data-label style="left: 16px; top: 172px">Harbor River</span>
    <span data-label style="left: 132px; top: 40px">Mill St</span>
    <span data-label style="left: 266px; top: 92px">Car, 4 min</span>
  </div>
  <b33-trip-sheet aria-label="Trip planner">
    <b33-sheet-surface>
      <b33-sheet-handle><button aria-label="Trip details"></button></b33-sheet-handle>
      <h2>Where to?</h2>
      <ui-field>
        <ui-field-label>Destination</ui-field-label>
        <ui-input><input placeholder="Search a place" autocomplete="off" enterkeyhint="go" /></ui-input>
      </ui-field>
      <b33-sheet-info>
        <dl>
          <div><dt>Pickup</dt><dd>5th Ave and Pine St</dd></div>
          <div><dt>Car</dt><dd>Gray Prius, plate 7KX 204</dd></div>
          <div><dt>Fare</dt><dd>$14.20 to $16.80</dd></div>
        </dl>
      </b33-sheet-info>
      <p role="status" data-status>Nearest car is 4 min away.</p>
      <ui-button data-request><button>Request ride</button></ui-button>
    </b33-sheet-surface>
  </b33-trip-sheet>
</div>
<p data-note>On a phone, the on-screen keyboard covers the bottom of the screen. While the destination field has focus, the sheet rises above the keyboard. Escape or a tap on the map folds the sheet down.</p>`

const css = `
[data-stage] { display: flex; flex-wrap: wrap; align-items: start; gap: 32px; }
[data-stage] h2, [data-stage] p, [data-stage] dl, [data-stage] dd { margin: 0; }
[data-stage] [data-phone] {
  position: relative; flex: none; width: ${W + 2}px; height: ${H + 2}px;
  border: 1px solid var(--ui-border); border-radius: 36px; background: #1a2232;
}
[data-stage] [data-map] svg { display: block; width: ${W}px; height: ${H}px; clip-path: inset(0 round 35px); }
[data-stage] [data-label] {
  position: absolute; padding: 2px 8px; border-radius: 999px; background: var(--ui-background);
  color: var(--ui-foreground); font-size: 0.75rem; line-height: 1.4;
}
[data-stage] [data-flow] { animation: b33-flow 1.2s linear infinite; }
[data-stage] [data-pulse] { transform-box: fill-box; transform-origin: center; animation: b33-pulse 1.8s ease-out infinite; }
[data-stage] [data-phone][data-motion="reduce"] [data-flow], [data-stage] [data-phone][data-motion="reduce"] [data-pulse] { animation: none; opacity: 0.3; }
@keyframes b33-flow { to { stroke-dashoffset: -32; } }
@keyframes b33-pulse { from { transform: scale(0.6); opacity: 0.6; } to { transform: scale(1.8); opacity: 0; } }
[data-stage] b33-trip-sheet { position: absolute; inset: auto 0 0 0; }
[data-stage] b33-sheet-surface {
  display: grid; gap: 12px; padding: 4px 20px 24px; max-block-size: calc(var(--visual-viewport-height, ${H}px) - 24px); overflow-y: auto;
  border: 1px solid var(--ui-border); border-radius: 20px 20px 35px 35px; background: var(--ui-muted);
  box-shadow: 0 -8px 24px rgb(0 0 0 / 0.35);
}
[data-stage] b33-sheet-handle button {
  all: unset; box-sizing: border-box; display: grid; place-items: center; justify-self: center;
  width: 64px; height: 24px; border-radius: var(--ui-radius); cursor: pointer;
}
[data-stage] b33-sheet-handle button::before { content: ""; width: 40px; height: 5px; border-radius: 3px; background: var(--ui-input); }
[data-stage] b33-sheet-handle button:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b33-sheet-surface h2 { font-size: 1.125rem; font-weight: 600; }
[data-stage] b33-trip-sheet input { font-size: 16px; }
[data-stage] b33-sheet-info dl { display: grid; gap: 8px; padding: 12px 0; border-block: 1px solid var(--ui-border); }
[data-stage] b33-sheet-info dl div { display: flex; justify-content: space-between; gap: 16px; font-size: 0.875rem; }
[data-stage] b33-sheet-info dt { color: var(--ui-muted-foreground); }
[data-stage] [data-status] { color: var(--ui-foreground); font-size: 0.875rem; }
[data-stage] ui-button[data-request] button { width: 100%; height: 44px; }
[data-stage] [data-note] { max-width: 40ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html()
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
    root.querySelector("[data-phone]")!.setAttribute("data-motion", "reduce")
  const status = root.querySelector("[data-status]")!
  const input = root.querySelector<HTMLInputElement>("b33-trip-sheet input")!
  // jsdom fires no valuechange for typed text, so the button reads the field when it is pressed.
  root.querySelector("[data-request]")!.addEventListener("action", () => {
    const place = input.value.trim()
    status.textContent = place ? `Ride requested to ${place}. Driver arrives in 4 min.` : "Enter a destination first."
  })
}

const ui: UI = {
  id: "B33",
  request:
    "Build a phone bottom sheet for a ride app: a destination field over a street map, a sheet that stays above the on-screen keyboard, and Escape or a tap on the map folds it down.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Trip planner", action: "expand" },
      { ref: "Destination", action: "setValue", args: ["Ferry Terminal"] },
      { ref: "Request ride", action: "press" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Ride requested to Ferry Terminal. Driver arrives in 4 min." &&
      root.querySelector("b33-trip-sheet")!.hasAttribute("data-open"),
  },
  breaks: [
    {
      broke: "The open sheet is no layer, so Escape and a press on the map do not fold it down.",
      find: "if (open && !stopLayer) stopLayer = bindLayer(el, { onDismiss: (reason, event) => part.api.collapse(event, reason) })",
      replace: "if (open && !stopLayer) stopLayer = () => {}",
      caught: "keyboard: Escape and a press on the map collapse the open sheet, and a press in the sheet does not",
    },
    {
      broke: "The sheet no longer rises above the on-screen keyboard.",
      find: "surface: slot({ bind: (el) => bindAvoidKeyboard(el) }),",
      replace: "surface: slot({}),",
      caught: "keyboard: the sheet rises above the on-screen keyboard while the field has focus",
    },
    {
      broke: "The sheet no longer follows the viewport.",
      find: "const stopViewport = bindViewport(el)",
      replace: "const stopViewport = () => {}",
      caught: "keyboard: the sheet follows the visual viewport and marks the open keyboard",
    },
    {
      broke: "ArrowUp and ArrowDown on the handle do nothing.",
      find: 'if (event.key === "ArrowUp") {',
      replace: "if (false) {",
      caught: "keyboard: ArrowUp expands and ArrowDown collapses the sheet from the handle",
    },
    {
      broke: "Focus in the destination field no longer expands the sheet.",
      find: 'if ((event.target as Element).localName === "input") api.expand(event, "focus-in")',
      replace: "void api",
      caught: "keyboard: focus in the destination field expands the sheet, and focus on the handle does not",
    },
  ],
}

export { tripSheet }
export default ui
