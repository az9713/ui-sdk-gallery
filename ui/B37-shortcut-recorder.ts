import {
  ariaKeyshortcuts,
  type ChangeDetails,
  createChange,
  createRovingFocus,
  definePrimitive,
  elements,
  formatShortcut,
  matchesShortcut,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import type { UI } from "../src/ui"

type Reason = "record" | "clear" | "imperative"
type Shortcuts = Record<string, string>
type Options = {
  value?: Shortcuts
  defaultValue?: Shortcuts
  onValueChange?: (value: Shortcuts, details: ChangeDetails<Reason>) => void
}
type RecorderProps = { value: string; label: string }
// held lists the keys that are down during a recording: "mod", "shift", "alt" and the main keys. shown is the command whose keys the keyboard lights.
type State = {
  value: Shortcuts
  focused: string | null
  recording: string | null
  held: string[]
  shown: string | null
  runs: Record<string, number>
  notice: string
}

const MODIFIERS = ["mod", "shift", "alt"]
const MODIFIER_KEYS = ["Control", "Shift", "Alt", "Meta", "AltGraph", "OS"]
const WORDS: Record<string, string> = {
  ctrl: "mod",
  control: "mod",
  cmd: "mod",
  command: "mod",
  meta: "mod",
  option: "alt",
  left: "arrowleft",
  right: "arrowright",
  up: "arrowup",
  down: "arrowdown",
  esc: "escape",
  del: "delete",
  return: "enter",
  " ": "space",
}
const FIRST = "Focus a command and press Enter to record its shortcut."

const activates = (event: KeyboardEvent) => (event.key === " " || event.key === "Enter") && !event.ctrlKey && !event.metaKey && !event.altKey
const apple = () => formatShortcut("mod+k").includes("⌘")
// formatShortcut wraps its text in 2 invisible direction marks, which a sentence does not need.
const show = (shortcut: string) => formatShortcut(shortcut).replace(/[⁦-⁩]/g, "")
const keysOf = (shortcut: string) => (shortcut ? shortcut.split("+") : [])

function normalize(text: string) {
  const parts = String(text).toLowerCase().split("+").map((part) => part.trim())
  const key = parts.pop() ?? ""
  const main = WORDS[key] ?? key
  if (!main || MODIFIERS.includes(main)) throw new Error(`"${text}" has no main key. Example: mod+shift+k.`)
  const mods = new Set<string>()
  for (const part of parts) {
    const mod = WORDS[part] ?? part
    if (!MODIFIERS.includes(mod)) throw new Error(`"${part}" is not a modifier. Use mod, shift or alt.`)
    mods.add(mod)
  }
  return [...MODIFIERS.filter((mod) => mods.has(mod)), main].join("+")
}

// A letter is its physical key, so Alt+K on a Mac is still K.
function mainKey(event: KeyboardEvent) {
  if (MODIFIER_KEYS.includes(event.key)) return null
  const code = event.code ?? ""
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit\d$/.test(code)) return code.slice(5)
  const key = event.key.toLowerCase()
  return WORDS[key] ?? key
}

const shortcutOf = (event: KeyboardEvent, key: string) => {
  const mod = apple() ? event.metaKey : event.ctrlKey
  return [mod && "mod", event.shiftKey && "shift", event.altKey && "alt", key].filter(Boolean).join("+")
}

const heldOf = (event: KeyboardEvent, keys: string[]) => {
  const mod = apple() ? event.metaKey : event.ctrlKey
  return [mod && "mod", event.shiftKey && "shift", event.altKey && "alt", ...keys].filter(Boolean) as string[]
}

const shortcutRecorder = definePrimitive({
  name: "shortcut-recorder",
  options: { value: "value", defaultValue: "value", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    value: options.value ?? options.defaultValue ?? {},
    focused: null,
    recording: null,
    held: [],
    shown: null,
    runs: {},
    notice: FIRST,
  }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const roving = createRovingFocus<State, RecorderProps>(context, { slot: "recorder", key: "focused" })
    const commands = () => elements<RecorderProps>(context, "recorder").map(({ key, props }) => ({ id: key, label: props.label }))
    const labelOf = (id: string) => commands().find((command) => command.id === id)?.label ?? id
    const named = (name: string) => {
      const wanted = String(name).trim().toLowerCase()
      const hit = commands().find((command) => command.id === wanted || command.label.toLowerCase() === wanted)
      if (!hit) throw new Error(`No command "${name}". Commands: ${commands().map((command) => command.label).join(", ")}.`)
      return hit.id
    }
    const ownerOf = (shortcut: string, except: string) => {
      const { value } = store.get()
      return Object.keys(value).find((id) => id !== except && value[id] === shortcut)
    }

    const commit = (id: string, shortcut: string, reason: Reason, event?: KeyboardEvent) => {
      const other = shortcut ? ownerOf(shortcut, id) : undefined
      if (other) {
        store.set({ notice: `${show(shortcut)} already runs ${labelOf(other)}. Press another shortcut.` })
        return false
      }
      const next = { ...store.get().value, [id]: shortcut }
      if (!change("value", next, { reason, event } as ChangeDetails<Reason>)) return false
      store.set({
        recording: null,
        held: [],
        shown: id,
        notice: shortcut ? `${labelOf(id)} is now ${show(shortcut)}.` : `${labelOf(id)} has no shortcut.`,
      })
      return true
    }
    const stop = (id: string, notice: string) => {
      if (store.get().recording !== id) return
      store.set({ recording: null, held: [], notice })
    }

    return {
      roving,
      commands,
      isRecording: (id: string) => store.get().recording === id,
      start: (id: string) => {
        if (store.get().recording === id) return
        store.set({
          recording: id,
          held: [],
          shown: null,
          notice: `Recording ${labelOf(id)}. Press the new shortcut. Backspace clears it and Escape cancels.`,
        })
      },
      capture: (event: KeyboardEvent, id: string) => {
        event.preventDefault()
        event.stopPropagation()
        if (event.repeat) return
        const key = mainKey(event)
        const rest = store.get().held.filter((held) => !MODIFIERS.includes(held))
        if (!key) {
          store.set({ held: heldOf(event, rest) })
          return
        }
        const bare = !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
        if (key === "escape" && bare) {
          stop(id, `Recording cancelled. ${labelOf(id)} keeps ${show(store.get().value[id] ?? "") || "no shortcut"}.`)
          return
        }
        if (key === "backspace" && bare) {
          commit(id, "", "clear", event)
          return
        }
        if (apple() ? event.ctrlKey : event.metaKey) {
          store.set({ notice: `Use ${apple() ? "Command" : "Control"}, Shift and Alt. Press another shortcut.` })
          return
        }
        store.set({ held: heldOf(event, [...rest, key]) })
        commit(id, shortcutOf(event, key), "record", event)
      },
      release: (event: KeyboardEvent, id: string) => {
        if (store.get().recording !== id) return
        const key = mainKey(event)
        const rest = store.get().held.filter((held) => !MODIFIERS.includes(held) && held !== key)
        store.set({ held: heldOf(event, rest) })
      },
      cancel: (id: string) => stop(id, `Recording cancelled. ${labelOf(id)} keeps ${store.get().value[id] ? show(store.get().value[id]) : "no shortcut"}.`),
      show: (id: string) => {
        if (!store.get().recording) store.set({ shown: id })
      },
      // Runs the command whose shortcut the key press matches. A press that a recording or a field took is left alone.
      run: (event: KeyboardEvent) => {
        const { value, recording, runs } = store.get()
        if (recording || event.defaultPrevented || event.repeat) return false
        if ((event.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return false
        const id = Object.keys(value).find((command) => value[command] && matchesShortcut(event, value[command]))
        if (!id) return false
        event.preventDefault()
        store.set({
          shown: id,
          runs: { ...runs, [id]: (runs[id] ?? 0) + 1 },
          notice: `Ran ${labelOf(id)} with ${show(value[id])}.`,
        })
        return true
      },
      assign: (command: string, shortcut: string) => {
        const id = named(command)
        const next = normalize(shortcut)
        const other = ownerOf(next, id)
        if (other) throw new Error(`${show(next)} already runs ${labelOf(other)}.`)
        return commit(id, next, "imperative")
      },
      clear: (command: string) => commit(named(command), "", "imperative"),
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      // The shortcuts run wherever the focus is on the page, so the root listens on the document.
      bind: (el, { api }) => {
        const doc = el.ownerDocument
        const listener = (event: KeyboardEvent) => void api.run(event)
        doc.addEventListener("keydown", listener)
        return () => doc.removeEventListener("keydown", listener)
      },
    }),
    recorder: slot<RecorderProps>({
      role: "button",
      focus: "roving",
      props: { value: "string", label: "string" },
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-pressed": String(state.recording === part.key),
        "aria-keyshortcuts": state.value[part.key] ? ariaKeyshortcuts(state.value[part.key]) : undefined,
        "data-recording": state.recording === part.key ? "" : undefined,
      }),
      press: ({ api, key }) => api.start(key),
      on: {
        keydown: (event, { el, api, key }) => {
          if (api.isRecording(key)) api.capture(event, key)
          // A part that is not a <button> hears only clicks through press.
          else if (activates(event)) {
            event.preventDefault()
            api.start(key)
          } else api.roving.keydown(event, el!)
        },
        keyup: (event, { api, key }) => api.release(event, key),
        focus: (_event, { api, key }) => api.show(key),
        blur: (_event, { api, key }) => api.cancel(key),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
    status: slot({ role: "status", attrs: () => ({ "data-status": "" }) }),
  }),
  agent: {
    actions: ["assign", "clear"],
    closed: true,
    items: (api) => api.commands().map(({ id, label }: { id: string; label: string }) => ({ value: id, label })),
  },
})

// Keys of the SVG keyboard, in units of 1 key width. Each row is 13.5 units wide.
type Cap = [id: string, label: string, width: number]
const letters = (text: string): Cap[] => [...text].map((char) => [char.toLowerCase(), char, 1])
const ROWS: Cap[][] = [
  [["escape", "Esc", 1], ...letters("1234567890"), ["backspace", "Bksp", 2.5]],
  [["tab", "Tab", 1.5], ...letters("QWERTYUIOP"), ["[", "[", 1], ["]", "]", 1]],
  [["pad", "", 1.75], ...letters("ASDFGHJKL"), ["enter", "Enter", 2.75]],
  [["shift", "Shift", 2.25], ...letters("ZXCVBNM"), [",", ",", 1], [".", ".", 1], ["/", "/", 1], ["shift", "Shift", 1.25]],
  [
    ["mod", "Ctrl", 1.5],
    ["alt", "Alt", 1.5],
    ["space", "Space", 6.5],
    ["arrowleft", "Left", 1],
    ["arrowup", "Up", 1],
    ["arrowdown", "Down", 1],
    ["arrowright", "Right", 1],
  ],
]
const UNIT = 40

// The key caps are SVG shapes. Their labels are HTML over them, because axe cannot decide the contrast of text inside an inline SVG.
function keyboard() {
  const mod = apple() ? "Cmd" : "Ctrl"
  const width = 13.5 * UNIT
  const height = ROWS.length * UNIT
  const shapes: string[] = []
  const labels: string[] = []
  ROWS.forEach((row, r) => {
    let x = 0
    for (const [id, label, units] of row) {
      const left = x
      x += units * UNIT
      if (id === "pad") continue
      const text = id === "mod" ? mod : label
      const long = text.length > 1
      shapes.push(`<g data-key="${id}"><rect x="${left + 2}" y="${r * UNIT + 2}" width="${units * UNIT - 4}" height="${UNIT - 4}" rx="5"/></g>`)
      const box = [(left + 4) / width, (r * UNIT + 4) / height, (units * UNIT - 8) / width, (UNIT - 8) / height].map((n) => (n * 100).toFixed(2))
      labels.push(`<span data-key="${id}"${long ? " data-long" : ""} style="left:${box[0]}%;top:${box[1]}%;width:${box[2]}%;height:${box[3]}%">${text}</span>`)
    }
  })
  return `<svg viewBox="0 0 ${width} ${height}" focusable="false">${shapes.join("")}</svg>${labels.join("")}`
}

const pretty = (key: string) => (key === "mod" ? (apple() ? "⌘" : "Ctrl") : key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1))

createParts(shortcutRecorder, {
  root: {
    tag: "b37-shortcuts",
    display: "block",
    options: () => ({ defaultValue: START }),
    render: (el, instance) => {
      const update = () => {
        const state = instance.get() as State
        for (const row of el.querySelectorAll<HTMLElement>("b37-recorder")) {
          const id = row.getAttribute("value")!
          const recording = state.recording === id
          row.querySelector("[data-keys]")!.textContent = recording
            ? state.held.length
              ? state.held.map(pretty).join("+")
              : "Press keys"
            : state.value[id]
              ? show(state.value[id])
              : "Not set"
          const runs = row.querySelector<HTMLElement>("[data-runs]")!
          const count = state.runs[id] ?? 0
          runs.hidden = count === 0
          runs.textContent = `${count} ${count === 1 ? "run" : "runs"}`
        }
        const status = el.querySelector("b37-status")
        if (status) status.textContent = state.notice
        const board = el.querySelector<HTMLElement>("[data-board]")
        if (!board) return
        const first = el.querySelector("b37-recorder")?.getAttribute("value") ?? ""
        const shown = state.recording ? state.held : keysOf(state.value[state.shown ?? state.focused ?? first] ?? "")
        const lit = new Set(shown.map((key) => (key === "mod" ? "mod" : key)))
        board.dataset.mode = state.recording ? "recording" : "shown"
        for (const cap of board.querySelectorAll<HTMLElement | SVGGElement>("[data-key]")) {
          const on = lit.has(cap.dataset.key!)
          if (on) cap.setAttribute("data-lit", "")
          else cap.removeAttribute("data-lit")
        }
      }
      update()
      return instance.subscribe(update)
    },
  },
  recorder: { tag: "b37-recorder", display: "block" },
  status: { tag: "b37-status", display: "block" },
})

const START: Shortcuts = {
  split: "mod+k",
  "ripple-delete": "shift+backspace",
  "mark-in": "i",
  "mark-out": "o",
  "step-back": "arrowleft",
  "step-forward": "arrowright",
  play: "k",
  "zoom-fit": "shift+z",
}
const COMMANDS: [string, string][] = [
  ["split", "Split clip"],
  ["ripple-delete", "Ripple delete"],
  ["mark-in", "Mark in"],
  ["mark-out", "Mark out"],
  ["step-back", "Step back"],
  ["step-forward", "Step forward"],
  ["play", "Play or pause"],
  ["zoom-fit", "Zoom to fit"],
]

const html = () => `
<h2>Timeline editor shortcuts</h2>
<b37-shortcuts aria-label="Timeline shortcuts">
  <div data-commands>
    ${COMMANDS.map(
      ([id, label]) => `<b37-recorder value="${id}" label="${label}"><span data-name>${label}</span> <span data-runs hidden></span> <kbd data-keys></kbd></b37-recorder>`,
    ).join("\n    ")}
  </div>
  <div data-board aria-hidden="true">${keyboard()}</div>
  <b37-status></b37-status>
</b37-shortcuts>
<p data-hint>Press Enter on a command, then press the new keys. Backspace clears a shortcut and Escape cancels. Outside a recording, press a shortcut to run its command.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] b37-shortcuts {
  display: grid; gap: 20px; width: min(100%, 760px); padding: 20px;
  border: 1px solid #2b303b; border-radius: 8px; background: #12151c; color: #e6e9ef;
}
[data-stage] [data-commands] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
[data-stage] b37-recorder {
  display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 12px;
  border: 1px solid #3d4556; border-radius: 6px; background: #1b202a; color: #e6e9ef;
  font-size: 0.875rem; cursor: pointer; user-select: none;
}
[data-stage] b37-recorder:hover { background: #232834; }
[data-stage] b37-recorder:focus-visible { outline: 2px solid #7cc4ff; outline-offset: 2px; }
[data-stage] b37-recorder [data-name] { flex: 1; }
[data-stage] b37-recorder [data-runs] { color: #9aa3b2; font-size: 0.75rem; }
[data-stage] b37-recorder kbd {
  min-width: 64px; padding: 3px 8px; border: 1px solid #4b5468; border-radius: 4px; background: #262c38;
  color: #e6e9ef; font-family: var(--ui-font-mono, ui-monospace, monospace); font-size: 0.8125rem; text-align: center;
}
[data-stage] b37-recorder[data-recording] { border-color: #f5a524; background: #2a2112; }
[data-stage] b37-recorder[data-recording] kbd { border-color: #f5a524; background: #12151c; color: #f5a524; }
[data-stage] [data-board] { position: relative; container-type: inline-size; }
[data-stage] [data-board] svg { display: block; width: 100%; height: auto; }
[data-stage] [data-board] g[data-key] rect { fill: #232834; stroke: #3d4556; stroke-width: 1; transition: fill 0.12s; }
[data-stage] [data-board] span[data-key] {
  position: absolute; display: grid; place-items: center; border-radius: 3px; background: #232834; color: #cbd2de;
  font-family: var(--ui-font-sans, system-ui, sans-serif); font-size: 2.1cqw; line-height: 1; transition: background-color 0.12s;
}
[data-stage] [data-board] span[data-long] { font-size: 1.55cqw; }
[data-stage] [data-board] g[data-lit] rect { fill: #4cc9b0; stroke: #4cc9b0; }
[data-stage] [data-board] span[data-lit] { background: #4cc9b0; color: #08201c; font-weight: 700; }
[data-stage] [data-board][data-mode="recording"] g[data-lit] rect { fill: #f5a524; stroke: #f5a524; }
[data-stage] [data-board][data-mode="recording"] span[data-lit] { background: #f5a524; color: #1d1405; }
[data-stage] b37-status { min-height: 1.5em; color: #cbd2de; font-size: 0.875rem; }
[data-stage] [data-hint] { max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
@media (prefers-reduced-motion: reduce) {
  [data-stage] [data-board] g[data-key] rect, [data-stage] [data-board] span[data-key] { transition: none; }
}
@media (max-width: 640px) {
  [data-stage] [data-commands] { grid-template-columns: minmax(0, 1fr); }
}
`

function mount(root: HTMLElement) {
  root.innerHTML = html()
}

const ui: UI = {
  id: "B37",
  request:
    "Build a shortcut settings panel for a video editor: a person picks a command, presses the new keys to record its shortcut, an on-screen keyboard lights the keys, and a press of a recorded shortcut runs its command.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Timeline shortcuts", action: "assign", args: ["Mark in", "alt+i"] },
      { ref: "Timeline shortcuts", action: "assign", args: ["Mark out", "alt+o"] },
      { ref: "Timeline shortcuts", action: "clear", args: ["Zoom to fit"] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Zoom to fit has no shortcut." &&
      root.querySelector('b37-recorder[value="mark-in"]')!.getAttribute("aria-keyshortcuts") === "Alt+I" &&
      root.querySelector('b37-recorder[value="mark-out"]')!.getAttribute("aria-keyshortcuts") === "Alt+O",
  },
  breaks: [
    {
      broke: "A key press no longer runs the command that owns the shortcut.",
      find: "value[command] && matchesShortcut(event, value[command])",
      replace: "false",
      caught: "keyboard: a press of a recorded shortcut runs its command and counts the run",
    },
    {
      broke: "A shortcut that another command owns is recorded anyway.",
      find: "const other = shortcut ? ownerOf(shortcut, id) : undefined",
      replace: "const other = undefined",
      caught: "keyboard: a shortcut that another command owns is refused and the recording goes on",
    },
    {
      broke: "Escape no longer cancels a recording.",
      find: 'if (key === "escape" && bare) {',
      replace: 'if (false && key === "escape" && bare) {',
      caught: "keyboard: Escape cancels a recording and Backspace clears the shortcut",
    },
    {
      broke: "A recorder no longer states its shortcut with aria-keyshortcuts.",
      find: '"aria-keyshortcuts": state.value[part.key] ? ariaKeyshortcuts(state.value[part.key]) : undefined,',
      replace: "",
      caught: "keyboard: aria-keyshortcuts and the label follow the platform",
    },
    {
      broke: "A shortcut runs while a recording is open.",
      find: "if (recording || event.defaultPrevented || event.repeat) return false",
      replace: "if (event.repeat) return false",
      caught: "keyboard: a shortcut does not run during a recording",
    },
  ],
}

export { shortcutRecorder }
export default ui
