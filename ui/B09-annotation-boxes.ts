import {
  type ChangeDetails,
  createChange,
  createResize,
  css,
  definePrimitive,
  live,
  type ResizeBox,
  type ResizeDraft,
  type ResizeHandle,
  type ResizeReason,
} from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import type { UI } from "../src/ui"

// A handle's key is its box's key, ":", and its compass point: "car:se".
type Boxes = Record<string, ResizeBox>
type Options = {
  titles: Record<string, string>
  value?: Boxes
  defaultValue?: Boxes
  onValueChange?: (value: Boxes, details: ChangeDetails<ResizeReason>) => void
}
// titles is an option that each box renders from, so the state has a copy.
type State = { titles: Record<string, string>; value: Boxes; draft: ResizeDraft | null }

// The photo is 640 by 400 pixels, at a scale of 1.
const PHOTO = { width: 640, height: 400 }
const MIN = { width: 24, height: 24 }
const SIDES: Record<string, string> = {
  nw: "top left",
  n: "top",
  ne: "top right",
  e: "right",
  se: "bottom right",
  s: "bottom",
  sw: "bottom left",
  w: "left",
}
const boxOf = (part: string) => part.slice(0, part.lastIndexOf(":"))
const handleOf = (part: string) => part.slice(part.lastIndexOf(":") + 1) as ResizeHandle
const size = ({ x, y, width, height }: ResizeBox) => `${width} by ${height} at ${x}, ${y}`

const annotator = definePrimitive({
  name: "box-annotator",
  options: { titles: "value", value: "value", defaultValue: "value", onValueChange: "callback" },
  controlled: ["value"],
  live: ["draft"],
  state: (options: Options): State => ({
    titles: options.titles,
    value: options.value ?? options.defaultValue ?? {},
    draft: null,
  }),
  sync: (options) => ({ titles: options.titles, ...(options.value === undefined ? {} : { value: options.value }) }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const title = (key: string) => store.get().titles[key] ?? key
    const resize = createResize(context, {
      boxes: (state) => state.value,
      draft: "draft",
      set: (value, details) => change("value", value, details),
      min: () => MIN,
      bounds: () => ({ left: 0, top: 0, right: PHOTO.width, bottom: PHOTO.height }),
      step: () => 4,
      label: title,
    })
    const boxKey = (name: unknown) => {
      const { titles } = store.get()
      const key = Object.keys(titles).find((k) => k === name || titles[k].toLowerCase() === String(name).toLowerCase())
      if (!key) throw new Error(`No box "${name}". Boxes: ${Object.values(titles).join(", ")}.`)
      return key
    }
    const numbers = (a: unknown, b: unknown, usage: string) => {
      if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) throw new Error(usage)
      return [Number(a), Number(b)]
    }
    return {
      resize,
      boxes: () => Object.entries(store.get().titles).map(([value, label]) => ({ value, label })),
      // Both go through resizeBy, so the photo's edge and the smallest size limit them, as a drag is limited.
      moveBox: (box: string, x: number, y: number) => {
        const key = boxKey(box)
        const [toX, toY] = numbers(x, y, `moveBox takes a box and 2 numbers, like moveBox("${title(key)}", 40, 80).`)
        const from = store.get().value[key]
        return resize.resizeBy(key, "move", toX - from.x, toY - from.y)
      },
      resizeBox: (box: string, width: number, height: number) => {
        const key = boxKey(box)
        const [w, h] = numbers(width, height, `resizeBox takes a box, a width and a height, like resizeBox("${title(key)}", 120, 80).`)
        if (w < MIN.width || h < MIN.height) throw new Error(`A box is at least ${MIN.width} by ${MIN.height}.`)
        const from = store.get().value[key]
        return resize.resizeBy(key, "se", w - from.width, h - from.height)
      },
    }
  },
  slots: (slot) => ({
    root: slot({ role: "group", attrs: () => ({ style: css({ position: "relative" }) }) }),
    box: slot<{ value: string }>({
      role: "group",
      focus: "tab-stop",
      props: { value: "string" },
      attrs: (state, { api, key }) => ({
        tabindex: "0",
        "aria-label": state.titles[key],
        "aria-description": size(state.value[key]),
        style: api.resize.boxStyle(state, key),
      }),
      live: live((state, { api, key }) => ({
        "data-dragging": api.resize.dragging(state, key),
        style: api.resize.style(state, key),
      })),
      on: {
        // A press on a handle starts that handle's own drag.
        pointerdown: (event, { el, api, key }) => {
          if (!(event.target as Element).closest("[data-resize-handle]")) api.resize.pointerdown(event, key, "move", el!)
        },
        keydown: (event, { el, api, key }) => {
          if (event.target === el) api.resize.keydown(event, key, "move")
        },
      },
    }),
    handle: slot<{ value: string }>({
      role: "button",
      focus: "native",
      props: { value: "string" },
      press: { none: "A handle acts on a drag and on the arrow keys, not on a click." },
      attrs: (state, { api, key }) => {
        const handle = handleOf(key)
        return { ...api.resize.handleAttrs(handle), type: "button", "aria-label": `Resize ${state.titles[boxOf(key)]} ${SIDES[handle]}` }
      },
      on: {
        pointerdown: (event, { el, api, key }) => api.resize.pointerdown(event, boxOf(key), handleOf(key), el!),
        keydown: (event, { api, key }) => void api.resize.keydown(event, boxOf(key), handleOf(key)),
      },
    }),
  }),
  agent: { actions: ["moveBox", "resizeBox"], items: (api) => api.boxes() },
})

const ITEMS = [
  { key: "car", title: "Car", box: { x: 72, y: 224, width: 216, height: 128 } },
  { key: "cyclist", title: "Cyclist", box: { x: 364, y: 196, width: 152, height: 124 } },
  { key: "light", title: "Traffic light", box: { x: 500, y: 40, width: 48, height: 96 } },
]
const TITLES = Object.fromEntries(ITEMS.map((item) => [item.key, item.title]))
const BOXES: Boxes = Object.fromEntries(ITEMS.map((item) => [item.key, item.box]))

createParts(annotator, {
  root: { tag: "b09-annotator", display: "block", options: () => ({ titles: TITLES, defaultValue: BOXES }) },
  box: "b09-box",
  handle: { tag: "b09-handle", target: wrappedButton, display: "contents" },
})

// A street corner, drawn with flat shapes.
const photo = `<svg data-photo aria-hidden="true" viewBox="0 0 ${PHOTO.width} ${PHOTO.height}" width="${PHOTO.width}" height="${PHOTO.height}">
  <rect width="640" height="250" fill="#c9d6df"/>
  <rect x="0" y="96" width="150" height="154" fill="#b8ada0"/><rect x="150" y="136" width="120" height="114" fill="#9c8f82"/>
  <rect x="270" y="80" width="170" height="170" fill="#aa9d8f"/><rect x="440" y="150" width="200" height="100" fill="#8f8478"/>
  <rect y="250" width="640" height="22" fill="#cfc8bd"/><rect y="272" width="640" height="128" fill="#5d5f63"/>
  <path d="M0 380h60M110 380h60M220 380h60M330 380h60M440 380h60M550 380h60" stroke="#e8e4da" stroke-width="6"/>
  <path d="M104 286l28-44h96l34 44z" fill="#9a4232"/><path d="M142 250h40v32h-52zM190 250h32l26 32h-58z" fill="#dfe7ec"/>
  <rect x="80" y="282" width="200" height="50" rx="14" fill="#b5503c"/>
  <circle cx="126" cy="332" r="18" fill="#222"/><circle cx="234" cy="332" r="18" fill="#222"/>
  <g fill="none" stroke="#2b2b2b" stroke-width="4"><circle cx="388" cy="318" r="26"/><circle cx="460" cy="318" r="26"/>
  <path d="M388 318l26-44h34l12 44M414 274l14 44h32M404 262h22M448 274l-6-14h12"/></g>
  <path d="M416 266l8-34 24 2-4 30" fill="#3f6e8c"/><path d="M424 232l20 34" stroke="#6b4a3a" stroke-width="6"/>
  <circle cx="432" cy="218" r="12" fill="#6b4a3a"/>
  <rect x="556" y="132" width="8" height="140" fill="#3b3d40"/><rect x="542" y="52" width="36" height="80" rx="6" fill="#2a2c2f"/>
  <circle cx="560" cy="70" r="9" fill="#d9534f"/><circle cx="560" cy="92" r="9" fill="#e0b13a"/><circle cx="560" cy="114" r="9" fill="#4fa36b"/>
</svg>`
const handles = (key: string) => Object.keys(SIDES).map((side) => `<b09-handle value="${key}:${side}"><button></button></b09-handle>`).join("")
const html = `
<h2>Label the street photo</h2>
<p id="b09-keys" data-hint>Drag a box to move it, or drag one of its square handles to resize it. With the keyboard, Tab to a box to move it with the arrow keys, or to one of its handles to move that edge. Shift makes each step 40 pixels. Escape cancels a drag.</p>
<b09-annotator aria-label="Street photo boxes" aria-describedby="b09-keys">
  ${photo}
  ${ITEMS.map(
    (item) =>
      `<b09-box value="${item.key}"><span data-tag aria-hidden="true">${item.title}</span>${handles(item.key)}</b09-box>`,
  ).join("")}
</b09-annotator>
<p role="status" data-status>No box has changed yet.</p>`

const styles = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] [data-hint], [data-stage] [data-status] { max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
[data-stage] b09-annotator {
  width: ${PHOTO.width}px; height: ${PHOTO.height}px; margin-top: 8px;
  border-radius: var(--ui-radius); box-shadow: 0 0 0 1px var(--ui-border); user-select: none;
}
[data-stage] [data-photo] { display: block; width: ${PHOTO.width}px; height: ${PHOTO.height}px; border-radius: var(--ui-radius); }
[data-stage] b09-box {
  position: absolute; box-sizing: border-box; cursor: move; touch-action: none;
  border: 2px solid var(--ui-primary); box-shadow: 0 0 0 1px var(--ui-background), inset 0 0 0 1px var(--ui-background);
}
[data-stage] b09-box[data-dragging] { border-style: dashed; }
[data-stage] b09-handle button { position: absolute; box-sizing: border-box; margin: 0; padding: 0; font: inherit; }
[data-stage] [data-resize-handle] {
  width: 12px; height: 12px; border: 2px solid var(--ui-primary); border-radius: 2px; background: var(--ui-background);
}
[data-stage] [data-tag] {
  position: absolute; left: -2px; bottom: calc(100% + 8px); padding: 2px 8px; white-space: nowrap; border-radius: calc(var(--ui-radius) * 0.75);
  background: var(--ui-primary); color: var(--ui-primary-foreground); font-size: 0.8125rem; font-weight: 600; line-height: 1.4;
}
[data-stage] [data-resize-handle="nw"], [data-stage] [data-resize-handle="n"], [data-stage] [data-resize-handle="ne"] { top: -7px; }
[data-stage] [data-resize-handle="sw"], [data-stage] [data-resize-handle="s"], [data-stage] [data-resize-handle="se"] { bottom: -7px; }
[data-stage] [data-resize-handle="e"], [data-stage] [data-resize-handle="w"] { top: calc(50% - 6px); }
[data-stage] [data-resize-handle="nw"], [data-stage] [data-resize-handle="w"], [data-stage] [data-resize-handle="sw"] { left: -7px; }
[data-stage] [data-resize-handle="ne"], [data-stage] [data-resize-handle="e"], [data-stage] [data-resize-handle="se"] { right: -7px; }
[data-stage] [data-resize-handle="n"], [data-stage] [data-resize-handle="s"] { left: calc(50% - 6px); }
[data-stage] b09-box:focus-visible, [data-stage] b09-handle button:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  let boxes = BOXES
  root.querySelector("b09-annotator")!.addEventListener("valuechange", (event) => {
    const next = (event as CustomEvent<{ value: Boxes }>).detail.value
    const key = Object.keys(next).find((k) => size(next[k]) !== size(boxes[k]))
    const from = key && boxes[key]
    boxes = next
    if (!key || !from) return
    const box = next[key]
    status.textContent =
      box.width === from.width && box.height === from.height
        ? `Moved ${TITLES[key]} to ${box.x}, ${box.y}.`
        : `Resized ${TITLES[key]} to ${box.width} by ${box.height} at ${box.x}, ${box.y}.`
  })
}

const ui: UI = {
  id: "B09",
  request:
    "Build an image annotation tool: labeled boxes over a photo that a person moves by drag and by arrow keys, and resizes by 8 handles on each box, by drag and by arrow keys.",
  css: styles,
  mount,
  task: {
    steps: [
      { ref: "Street photo boxes", action: "resizeBox", args: ["Cyclist", 128, 152] },
      { ref: "Street photo boxes", action: "moveBox", args: ["Traffic light", 536, 44] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Moved Traffic light to 536, 44." &&
      root.querySelector('b09-box[value="cyclist"]')!.getAttribute("aria-description") === "128 by 152 at 364, 196",
  },
  breaks: [
    {
      broke: "A box can shrink below 24 by 24.",
      find: "min: () => MIN,",
      replace: "",
      caught: "keyboard: on a corner handle, the arrow keys move 2 edges by 4 pixels, Shift by 40, and the smallest size stops them",
    },
    {
      broke: "A box can leave the photo.",
      find: "bounds: () => ({ left: 0, top: 0, right: PHOTO.width, bottom: PHOTO.height }),",
      replace: "",
      caught: "keyboard: on a box, the arrow keys move it 4 pixels, Shift 40, and the photo's edge stops it",
    },
    {
      broke: "A drag on the box no longer moves it.",
      find: 'api.resize.pointerdown(event, key, "move", el!)',
      replace: "void 0",
      caught: "pointer: a drag on the box moves it on the 4 pixel grid",
    },
    {
      broke: "The arrow keys on a handle no longer change the box.",
      find: "void api.resize.keydown(event, boxOf(key), handleOf(key))",
      replace: "void 0",
      caught: "keyboard: on an edge handle, the arrow keys move only that edge, along its own axis",
    },
    {
      broke: "The arrow keys no longer step by 4 pixels.",
      find: "step: () => 4,",
      replace: "",
      caught: "keyboard: on a box, the arrow keys move it 4 pixels, Shift 40, and the photo's edge stops it",
    },
    {
      broke: "A drag on a handle no longer resizes the box.",
      find: "api.resize.pointerdown(event, boxOf(key), handleOf(key), el!)",
      replace: "void 0",
      caught: "pointer: a drag on a handle resizes the box from that side and does not move the other sides",
    },
    {
      broke: "The arrow keys on a box no longer move it.",
      find: 'if (event.target === el) api.resize.keydown(event, key, "move")',
      replace: "",
      caught: "keyboard: on a box, the arrow keys move it 4 pixels, Shift 40, and the photo's edge stops it",
    },
  ],
}

export { annotator }
export default ui
