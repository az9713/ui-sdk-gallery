import { type AreaValue, type ChangeDetails, createArea, createChange, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import type { UI } from "../src/ui"

type Reason = "track-press" | "drag" | "step-key" | "imperative"
type Options = {
  defaultValue?: AreaValue
  onValueChange?: (value: AreaValue, details: ChangeDetails<Reason>) => void
}
type State = { value: AreaValue }

const START = { x: 50, y: 50 }

const soundPad = definePrimitive({
  name: "sound-pad",
  options: { defaultValue: "value", onValueChange: "callback" },
  state: (options: Options): State => ({ value: options.defaultValue ?? START }),
  api: (context) => {
    const change = createChange(context)
    const area = createArea(context, {
      value: (state) => state.value,
      set: (value, details) => change("value", value, details),
      x: () => ({ min: 0, max: 100, step: 1, label: "Reverb" }),
      y: () => ({ min: 0, max: 100, step: 1, label: "Brightness" }),
      valueText: ({ x, y }) => `Reverb ${x} of 100, Brightness ${y} of 100`,
    })
    return {
      area,
      setPoint: (x: number, y: number) => area.set({ x, y }),
      reset: () => area.set(START),
    }
  },
  slots: (slot) => ({
    root: slot({}),
    pad: slot({
      on: { pointerdown: (event, { el, api }) => api.area.pointerdown(event, el!) },
    }),
    thumb: slot({
      attrs: (state, { api }) => ({ ...api.area.thumbAttrs(state), style: api.area.thumbStyle(state) }),
      on: { keydown: (event, { api }) => void api.area.keydown(event) },
    }),
  }),
  agent: { actions: ["setPoint", "reset"] },
})

createParts(soundPad, { root: { tag: "b10-sound-pad", api: ["reset"] }, pad: "b10-pad", thumb: "b10-thumb" })

const html = `
<h2>Lead synth</h2>
<b10-sound-pad aria-label="Sound pad">
  <b10-pad><b10-thumb aria-label="Sound point"></b10-thumb></b10-pad>
</b10-sound-pad>
<p data-hint>Left to right is Reverb. Bottom to top is Brightness.</p>
<p role="status" data-status>Reverb 50%, Brightness 50%.</p>
<div data-actions>
  <ui-button data-reset><button>Reset pad</button></ui-button>
  <ui-button data-save><button>Save sound</button></ui-button>
</div>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] b10-sound-pad { display: block; width: min(100%, 360px); }
[data-stage] b10-pad {
  display: block; position: relative; height: 240px; touch-action: none; cursor: crosshair;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius); background-color: var(--ui-muted);
  background-image:
    linear-gradient(to right, var(--ui-border) 1px, transparent 1px),
    linear-gradient(to bottom, var(--ui-border) 1px, transparent 1px);
  background-size: 25% 25%;
}
[data-stage] b10-thumb {
  position: absolute; width: 24px; height: 24px; margin-top: -12px; margin-inline-start: -12px;
  border: 3px solid var(--ui-primary-foreground); border-radius: 50%; background: var(--ui-primary);
  box-shadow: 0 0 0 1px var(--ui-primary);
}
[data-stage] b10-thumb:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 3px; }
[data-stage] [data-hint], [data-stage] [data-status] { color: var(--ui-muted-foreground); }
[data-stage] [data-actions] { display: flex; gap: 8px; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  let point = { ...START }
  const text = () => `Reverb ${point.x}%, Brightness ${point.y}%`
  const pad = root.querySelector("b10-sound-pad")!
  pad.addEventListener("valuechange", (event) => {
    point = (event as CustomEvent<{ value: AreaValue }>).detail.value
    status.textContent = `${text()}.`
  })
  root.querySelector("[data-reset]")!.addEventListener("action", () => {
    ;(pad as unknown as { api: { reset: () => boolean } }).api.reset()
  })
  root.querySelector("[data-save]")!.addEventListener("action", () => {
    status.textContent = `Saved: ${text()}.`
  })
}

const ui: UI = {
  id: "B10",
  request: "Build a sound pad: a person drags a point on a square, or uses the arrow keys, to set reverb from left to right and brightness from bottom to top.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Sound pad", action: "setPoint", args: [80, 30] },
      { ref: "Save sound", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Saved: Reverb 80%, Brightness 30%.",
  },
  breaks: [
    {
      broke: "The arrow keys no longer move the point.",
      find: "on: { keydown: (event, { api }) => void api.area.keydown(event) },",
      replace: "on: {},",
      caught: "keyboard: arrows step an axis, Shift steps ten, Page Up moves y and Home goes to the start of x",
    },
    {
      broke: "A press on the pad no longer moves the point.",
      find: "on: { pointerdown: (event, { el, api }) => api.area.pointerdown(event, el!) },",
      replace: "on: {},",
      caught: "pointer: a press and a drag on the pad move the point and report their reasons",
    },
    {
      broke: "A screen reader hears the default value text instead of both axes by name.",
      find: "valueText: ({ x, y }) => `Reverb ${x} of 100, Brightness ${y} of 100`,",
      replace: "",
      caught: "names: the thumb is 1 slider that reads both axes",
    },
    {
      broke: "An agent can no longer set the point.",
      find: "setPoint: (x: number, y: number) => area.set({ x, y }),",
      replace: "setPoint: (_x: number, _y: number) => false,",
      caught: "agent: an agent sets the point and saves it, and the status line reports both axes",
    },
  ],
}

export { soundPad }
export default ui
