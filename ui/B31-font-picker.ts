import {
  type ChangeDetails,
  createChange,
  createPreview,
  createRovingFocus,
  definePrimitive,
  type PreviewReason,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import { gsap } from "gsap"
import type { UI } from "../src/ui"

type Font = { value: string; label: string; stack: string; weight: number }

const FONTS: Font[] = [
  { value: "arial-black", label: "Arial Black", stack: `"Arial Black", "Arial Bold", Gadget, sans-serif`, weight: 400 },
  { value: "impact", label: "Impact", stack: `Impact, "Haettenschweiler", "Arial Narrow Bold", sans-serif`, weight: 400 },
  { value: "georgia", label: "Georgia", stack: `Georgia, "Times New Roman", serif`, weight: 700 },
  { value: "courier", label: "Courier New", stack: `"Courier New", Courier, monospace`, weight: 700 },
  { value: "trebuchet", label: "Trebuchet MS", stack: `"Trebuchet MS", "Lucida Grande", sans-serif`, weight: 700 },
  { value: "times", label: "Times New Roman", stack: `"Times New Roman", Times, serif`, weight: 700 },
  { value: "verdana", label: "Verdana", stack: `Verdana, Geneva, sans-serif`, weight: 700 },
  { value: "palatino", label: "Palatino", stack: `"Palatino Linotype", Palatino, "Book Antiqua", serif`, weight: 700 },
]
const KEYS = FONTS.map((font) => font.value)
const START = "arial-black"
const nameOf = (value: string) => FONTS.find((font) => font.value === value)?.label ?? value

type Reason = "item-press" | "imperative"
type Options = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, details: ChangeDetails<Reason>) => void
  onPreviewChange?: (value: string | null, details: ChangeDetails<PreviewReason>) => void
}
type State = { value: string; preview: string | null; focused: string | null }

// A listbox of typefaces. The highlighted one previews on the poster, and only a press, Enter or Space chooses it.
const fontPicker = definePrimitive({
  name: "font-picker",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    onPreviewChange: "callback",
  },
  controlled: ["value"],
  state: (options: Options): State => ({ value: options.value ?? options.defaultValue ?? START, preview: null, focused: null }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus<State, { value: string }>(context, {
      slot: "font",
      key: "focused",
      remember: false,
      preferred: (font) => font.key === context.store.get().value,
      claims: (state, font) => font.key === state.value,
    })
    const preview = createPreview(context, {
      key: "preview",
      slot: "font",
      set: (value, details) => change("preview", value, details),
      value: () => context.store.get().value,
      choose: (key, details) => change("value", key, details),
    })
    const known = (value: string) => {
      if (!KEYS.includes(value)) throw new Error(`No typeface "${value}". Typefaces: ${KEYS.join(", ")}.`)
    }
    return {
      roving,
      preview,
      fonts: () => FONTS.map(({ value, label }) => ({ value, label })),
      peek: (value: string) => {
        known(value)
        return preview.show(value, { reason: "imperative" })
      },
      pick: (value: string) => {
        known(value)
        preview.clear({ reason: "imperative" })
        return change("value", value, { reason: "imperative" })
      },
      reset: () => preview.clear({ reason: "imperative" }),
    }
  },
  slots: (slot) => ({
    root: slot({ role: "listbox", keys: { none: "Each option handles the arrow keys." } }),
    font: slot<{ value: string }>({
      role: "option",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, { key, props, api }) => ({
        tabindex: api.roving.tabIndex(state, { key, props }),
        "aria-selected": String(state.value === key),
        "data-selected": state.value === key ? "" : undefined,
        "data-previewing": state.preview === key ? "" : undefined,
      }),
      press: ({ api, key }, event) => void api.preview.choose(key, { event }),
      on: {
        pointerdown: (event, { el, api, key }) => api.preview.pointerdown(event, key, el!.parentElement!),
        pointerenter: (event, { api, key }) => {
          if (!api.preview.dragging()) api.preview.show(key, { reason: "item-hover", event })
        },
        pointerleave: (event, { api }) => {
          if (!api.preview.dragging()) api.preview.clear({ reason: "item-hover", event })
        },
        keydown: (event, { el, api, key }) => {
          if (api.preview.keydown(event, key)) {
            return
          }
          const moved = api.roving.keydown(event, el!)
          if (moved) {
            api.preview.show(moved.key, { reason: "list-navigation", event })
          }
        },
        focusout: (event, { el, api }) => {
          if (api.preview.dragging() || el?.contains(event.relatedTarget as Node)) {
            return
          }
          api.preview.clear({ reason: "focus-out", event })
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
  agent: {
    actions: ["peek", "pick", "reset"],
    items: (api) => api.fonts(),
  },
})

createParts(fontPicker, { root: { tag: "b31-font-picker", display: "block" }, font: { tag: "b31-font", display: "block" } })

const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

const letters = (word: string) =>
  [...word].map((letter) => `<span data-letter>${letter}</span>`).join("")

const html = () => `
<div data-layout>
  <section data-side>
    <h2>Gig poster typeface</h2>
    <p data-hint>Move over a typeface, or use the arrow keys, to try it on the poster. Press, or press Enter, to keep it.</p>
    <b31-font-picker aria-label="Poster typeface" default-value="${START}">
      ${FONTS.map((font) => `<b31-font value="${font.value}">${font.label}</b31-font>`).join("")}
    </b31-font-picker>
    <p role="status" data-status>Poster set in ${nameOf(START)}.</p>
  </section>
  <div data-poster data-font="${START}" aria-hidden="true">
    <div data-bar><span>The Foundry</span><span>Fri 14 Nov</span></div>
    <div data-body>
      <p data-title><span data-word>${letters("HOLLOW")}</span><span data-word>${letters("KINGS")}</span></p>
      <span data-rule></span>
      <p data-sub>Live, with Pale Static</p>
    </div>
    <div data-foot><span>Doors 19:30</span><span>Tickets 12</span></div>
    <span data-dot></span>
  </div>
</div>`

const faces = FONTS.map(
  (font) => `
[data-stage] b31-font[value="${font.value}"], [data-stage] [data-poster][data-font="${font.value}"] { font-family: ${font.stack}; }
[data-stage] [data-poster][data-font="${font.value}"] [data-title] { font-weight: ${font.weight}; }`,
).join("")

const css = `
[data-stage] { display: block; width: min(100%, 860px); }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] [data-layout] { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 400px); gap: 28px; align-items: start; }
@media (max-width: 760px) { [data-stage] [data-layout] { grid-template-columns: minmax(0, 1fr); } }
[data-stage] [data-side] { display: grid; gap: 14px; }
[data-stage] h2 { font-size: 1.125rem; font-weight: 700; letter-spacing: -0.01em; }
[data-stage] [data-hint], [data-stage] [data-status] { color: var(--ui-muted-foreground); font-size: 0.875rem; max-width: 40ch; }
[data-stage] [data-status] { color: var(--ui-foreground); font-weight: 600; }
[data-stage] b31-font-picker { display: block; border: 2px solid #111111; background: #f4f1e8; }
[data-stage] b31-font {
  display: flex; align-items: center; min-height: 44px; padding: 0 14px; box-sizing: border-box;
  color: #111111; font-size: 1.25rem; cursor: pointer; user-select: none;
}
[data-stage] b31-font + b31-font { border-top: 1px solid #111111; }
[data-stage] b31-font[data-previewing] { background: #c41e0a; color: #ffffff; }
[data-stage] b31-font[data-selected] { background: #111111; color: #f4f1e8; }
[data-stage] b31-font[data-selected][data-previewing] { background: #c41e0a; color: #ffffff; }
[data-stage] b31-font:focus-visible { outline: 3px solid #111111; outline-offset: -6px; }
[data-stage] b31-font[data-selected]:focus-visible, [data-stage] b31-font[data-previewing]:focus-visible { outline-color: #f4f1e8; }
${faces}
[data-stage] [data-poster] {
  container-type: inline-size; position: relative; display: grid; grid-template-rows: auto 1fr auto; aspect-ratio: 3 / 4;
  border: 2px solid #111111; background: #f4f1e8; color: #111111;
}
[data-stage] [data-bar] {
  display: flex; justify-content: space-between; gap: 8px; padding: 3cqw 6cqw; background: #c41e0a; color: #ffffff; font-size: 4.4cqw;
}
[data-stage] [data-body] { display: grid; align-content: center; gap: 4cqw; padding: 6cqw; }
[data-stage] [data-title] { display: grid; font-size: 17cqw; line-height: 0.95; letter-spacing: -0.02em; }
[data-stage] [data-word] { display: block; white-space: nowrap; }
[data-stage] [data-letter] { display: inline-block; will-change: transform; }
[data-stage] [data-rule] { display: block; height: 3cqw; background: #111111; transform-origin: left center; }
[data-stage] [data-sub] { font-size: 6cqw; line-height: 1.2; }
[data-stage] [data-foot] {
  display: flex; justify-content: space-between; gap: 8px; padding: 3cqw 6cqw; background: #111111; color: #f4f1e8; font-size: 4.4cqw;
}
[data-stage] [data-dot] {
  position: absolute; right: 6cqw; bottom: 16cqw; width: 18cqw; height: 18cqw; border-radius: 50%; background: #c41e0a;
}
`

function mount(root: HTMLElement) {
  root.innerHTML = html()
  const picker = root.querySelector("b31-font-picker")!
  const poster = root.querySelector<HTMLElement>("[data-poster]")!
  const status = root.querySelector("[data-status]")!
  const chars = [...poster.querySelectorAll("[data-letter]")]
  const rule = poster.querySelector("[data-rule]")!
  const fades = [...poster.querySelectorAll("[data-sub], [data-bar], [data-foot]")]

  let chosen = START
  let previewing: string | null = null
  let shown = START
  let timeline: gsap.core.Timeline | undefined

  // The poster is drawn in full at once. Only a change of face plays the kinetic type.
  const kinetic = (next: string) => {
    poster.setAttribute("data-font", next)
    timeline?.kill()
    gsap.set([...chars, rule, ...fades], { clearProps: "all" })
    if (calm() || !root.isConnected) return
    timeline = gsap
      .timeline()
      .from(chars, { yPercent: 70, rotation: (i) => (i % 2 ? 9 : -9), opacity: 0, duration: 0.45, ease: "back.out(2.4)", stagger: 0.035 }, 0)
      .from(rule, { scaleX: 0, duration: 0.4, ease: "power3.out" }, 0.1)
      .from(fades, { opacity: 0, duration: 0.3, stagger: 0.06 }, 0.2)
  }

  const render = () => {
    status.textContent = previewing ? `Previewing ${nameOf(previewing)}.` : `Poster set in ${nameOf(chosen)}.`
    const next = previewing ?? chosen
    if (next === shown) return
    shown = next
    kinetic(next)
  }

  const onValue = (event: Event) => {
    chosen = (event as CustomEvent<{ value: string }>).detail.value
    render()
  }
  const onPreview = (event: Event) => {
    previewing = (event as CustomEvent<{ value: string | null }>).detail.value
    render()
  }
  picker.addEventListener("valuechange", onValue)
  picker.addEventListener("previewchange", onPreview)
  return () => {
    picker.removeEventListener("valuechange", onValue)
    picker.removeEventListener("previewchange", onPreview)
    timeline?.kill()
  }
}

const ui: UI = {
  id: "B31",
  request:
    "Build a gig poster page with a font picker: moving over a typeface, or the arrow keys, previews it on the poster, and only a press or Enter keeps it.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Poster typeface", action: "peek", args: ["Georgia"] },
      { ref: "Poster typeface", action: "pick", args: ["Impact"] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Poster set in Impact." &&
      root.querySelector("[data-poster]")!.getAttribute("data-font") === "impact",
  },
  breaks: [
    {
      broke: "The arrow keys move focus but no longer preview the option.",
      find: 'api.preview.show(moved.key, { reason: "list-navigation", event })',
      replace: "void moved",
      caught: "keyboard: the arrow keys preview a typeface and Enter keeps it",
    },
    {
      broke: "Enter, Space and Escape no longer reach the preview.",
      find: "if (api.preview.keydown(event, key)) {",
      replace: "if (false) {",
      caught: "keyboard: the arrow keys preview a typeface and Enter keeps it",
    },
    {
      broke: "Leaving the list no longer puts the poster back.",
      find: 'api.preview.clear({ reason: "focus-out", event })',
      replace: "void event",
      caught: "keyboard: leaving the list puts the poster back to the chosen typeface",
    },
    {
      broke: "Pointer hover no longer previews.",
      find: 'api.preview.show(key, { reason: "item-hover", event })',
      replace: "void key",
      caught: "keyboard: hover previews a typeface and a click keeps it",
    },
    {
      broke: "Choosing no longer changes the value.",
      find: 'choose: (key, details) => change("value", key, details),',
      replace: "choose: () => false,",
      caught: "keyboard: hover previews a typeface and a click keeps it",
    },
  ],
}

export { fontPicker }
export default ui
