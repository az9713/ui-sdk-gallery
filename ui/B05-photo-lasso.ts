import {
  byCell,
  type ChangeDetails,
  createChange,
  createGridFocus,
  createLasso,
  createSelection,
  definePrimitive,
  type GridCell,
  type LassoDraft,
  live,
  selects,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import "@ui-sdk/web/button"
import type { UI } from "../src/ui"

// "lasso" is not in the shared vocabulary: the rectangle drawn on the empty space of the grid.
type Reason = "item-press" | "list-navigation" | "imperative" | "lasso"
type Options = {
  photos: string[]
  cols: number
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[], details: ChangeDetails<Reason>) => void
}
// photos and cols are options that a photo renders from, so the state has a copy: a part must not read an option.
type State = { active: GridCell | null; value: string[]; lasso: LassoDraft | null; photos: string[]; cols: number }

const photoGrid = definePrimitive({
  name: "photo-grid",
  options: { photos: "list", cols: "number", value: "list", defaultValue: "list", onValueChange: "callback" },
  controlled: ["value"],
  live: ["lasso"],
  state: (options: Options): State => ({
    active: null,
    value: options.value ?? options.defaultValue ?? [],
    lasso: null,
    photos: options.photos,
    cols: options.cols,
  }),
  sync: (options) => ({
    photos: options.photos,
    cols: options.cols,
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: (context) => {
    const change = createChange(context)
    const photos = () => context.store.get().photos
    const at = ({ row, col }: GridCell) => photos()[row * context.store.get().cols + col]
    const selection = createSelection(context, {
      key: "value",
      set: (value, details) => change("value", value, details),
      order: photos,
      multiple: () => true,
    })
    const grid = createGridFocus(context, {
      key: "active",
      rows: () => Math.ceil(photos().length / context.store.get().cols),
      cols: () => context.store.get().cols,
      onMove: (cell, { from, shift, reason, event }) => {
        if (shift && from && reason === "list-navigation") selection.extend(at(cell), { from: at(from), reason, event })
      },
    })
    const lasso = createLasso(context, {
      slot: "photo",
      draft: "lasso",
      selected: () => context.store.get().value,
      set: (keys, details) => change("value", keys, details),
      message: (count) => `${count} ${count === 1 ? "photo" : "photos"} selected`,
    })
    const known = (photo: string) => {
      if (!photos().includes(photo)) throw new Error(`No photo "${photo}". Photos: ${photos().join(", ")}.`)
    }
    return {
      grid,
      lasso,
      photos,
      toggle: (photo: string, event?: Event) => {
        known(photo)
        return selection.toggle(photo, { reason: event ? "item-press" : "imperative", event })
      },
      clear: () => change("value", [], { reason: "imperative" }),
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "grid",
      keys: { none: "Each photo handles the arrow keys." },
      attrs: () => ({ "aria-multiselectable": "true" }),
      on: {
        // The rectangle starts only on empty space: the gaps between photos and the edge of the grid.
        pointerdown: (event, { el, api }) => {
          if (el && !(event.target as Element).closest("[role=gridcell]")) api.lasso.pointerdown(event, el)
        },
      },
    }),
    row: slot({ role: "row" }),
    photo: slot<GridCell & { value: string }>({
      role: "gridcell",
      focus: "roving",
      props: { value: "string", row: "number", col: "number" },
      selects: selects({ active: byCell, value: ({ key }) => [key] }),
      attrs: (state, { key, props, api }) => {
        const selected = state.value.includes(key)
        return {
          tabindex: api.grid.tabIndex(state, props),
          "aria-selected": String(selected),
          "data-selected": selected ? "" : undefined,
        }
      },
      live: live((state, { key, api }) => ({ "data-lassoed": api.lasso.touches(state, key) ? "" : undefined })),
      press: ({ api, key }, event) => api.toggle(key, event),
      on: {
        // A gridcell is not a button, so press hears only its clicks.
        keydown: (event, { api, key }) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault()
            api.toggle(key, event)
          } else api.grid.keydown(event)
        },
        pointerdown: (event, { api, props }) => void api.grid.focus(props, { reason: "item-press", event }),
      },
      bind: (el, { api, props }) => api.grid.bind(el, props),
    }),
    lasso: slot({
      attrs: () => ({ "aria-hidden": "true" }),
      live: live((state, { api }) => ({ style: api.lasso.style(state) })),
    }),
  }),
  agent: { actions: ["toggle", "clear"], items: (api) => api.photos().map((photo) => ({ value: photo, label: photo })) },
})

createParts(photoGrid, { root: { tag: "b05-photo-grid", api: ["clear"] }, row: "b05-photo-row", photo: "b05-photo", lasso: "b05-lasso" })

const COLS = 4
const PHOTOS = [
  ["Tram 28", "clay"],
  ["Alfama roofs", "sand"],
  ["Belem tower", "stone"],
  ["River ferry", "sea"],
  ["Tile wall", "sea"],
  ["Pastel de nata", "sand"],
  ["Sintra palace", "olive"],
  ["Cabo da Roca", "dusk"],
  ["Night market", "dusk"],
  ["Street mural", "clay"],
  ["Elevator lift", "stone"],
  ["Beach at Cascais", "olive"],
]

const html = `
<h2>Lisbon, May 2026</h2>
<p data-hint>Drag across the space between the photos to select them with a rectangle. Hold Shift to add to the selection. Escape cancels the rectangle.</p>
<b05-photo-grid aria-label="Trip photos" cols="${COLS}" photos="${PHOTOS.map(([name]) => name)}">
  ${Array.from(
    { length: PHOTOS.length / COLS },
    (_, row) => `<b05-photo-row>${PHOTOS.slice(row * COLS, row * COLS + COLS)
      .map(
        ([name, tone], col) =>
          `<b05-photo value="${name}" row="${row}" col="${col}"><span data-tone="${tone}" aria-hidden="true"></span> <span data-caption>${name}</span></b05-photo>`,
      )
      .join("")}</b05-photo-row>`,
  ).join("")}
  <b05-lasso></b05-lasso>
</b05-photo-grid>
<p role="status" data-status>No photo is selected.</p>
<div data-actions>
  <ui-button data-add><button>Add to album</button></ui-button>
  <ui-button data-clear><button>Clear selection</button></ui-button>
</div>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] [data-hint] { max-width: 60ch; color: var(--ui-muted-foreground); }
[data-stage] b05-photo-grid {
  position: relative; display: grid; gap: 12px; padding: 16px;
  border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-muted);
  touch-action: none; user-select: none; cursor: crosshair;
}
[data-stage] b05-photo-row { display: grid; grid-template-columns: repeat(${COLS}, 128px); gap: 12px; }
[data-stage] b05-photo {
  display: grid; gap: 6px; padding: 6px; border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); cursor: pointer;
  box-shadow: 0 0 0 1px var(--ui-border);
}
[data-stage] b05-photo [data-tone] { display: block; height: 80px; border-radius: calc(var(--ui-radius) * 0.75); }
[data-stage] [data-tone="clay"] { background: #b5654a; }
[data-stage] [data-tone="sand"] { background: #d8b67a; }
[data-stage] [data-tone="stone"] { background: #9a958c; }
[data-stage] [data-tone="sea"] { background: #4f7f9c; }
[data-stage] [data-tone="olive"] { background: #7c8a4d; }
[data-stage] [data-tone="dusk"] { background: #5b5470; }
[data-stage] b05-photo [data-caption] { font-size: 0.8125rem; line-height: 1.3; }
[data-stage] b05-photo:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b05-photo[data-lassoed] { box-shadow: 0 0 0 2px var(--ui-ring); }
[data-stage] b05-photo[data-selected] { box-shadow: 0 0 0 3px var(--ui-primary); }
[data-stage] b05-photo[data-selected] [data-caption] { font-weight: 600; }
[data-stage] b05-lasso {
  position: absolute; pointer-events: none;
  border: 1px solid var(--ui-primary); background: color-mix(in oklab, var(--ui-primary) 12%, transparent);
}
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
[data-stage] [data-actions] { display: flex; gap: 8px; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const grid = root.querySelector("b05-photo-grid")!
  const order = PHOTOS.map(([name]) => name)
  let selected: string[] = []
  const list = () => order.filter((name) => selected.includes(name)).join(", ")
  const count = () => `${selected.length} ${selected.length === 1 ? "photo" : "photos"}`
  grid.addEventListener("valuechange", (event) => {
    selected = (event as CustomEvent<{ value: string[] }>).detail.value
    status.textContent = selected.length ? `${count()} selected: ${list()}.` : "No photo is selected."
  })
  root.querySelector("[data-add]")!.addEventListener("action", () => {
    status.textContent = selected.length ? `Added ${count()} to the album: ${list()}.` : "Select a photo first."
  })
  root.querySelector("[data-clear]")!.addEventListener("action", () => {
    ;(grid as HTMLElement & { api: { clear: () => void } }).api.clear()
  })
}

const ui: UI = {
  id: "B05",
  request:
    "Build a photo grid where a person drags a rectangle across the empty space to select the photos it touches, with Shift to add, Escape to cancel, and arrow keys with Space as the keyboard way.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Trip photos", action: "toggle", args: ["Tile wall"] },
      { ref: "Trip photos", action: "toggle", args: ["Sintra palace"] },
      { ref: "Add to album", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Added 2 photos to the album: Tile wall, Sintra palace.",
  },
  breaks: [
    {
      broke: "A drag on the empty space no longer draws a rectangle.",
      find: "api.lasso.pointerdown(event, el)",
      replace: "void 0",
      caught: "pointer: a rectangle across 2 rows selects the 4 photos it touches and reports the lasso",
    },
    {
      broke: "Shift no longer adds the rectangle to the selection: the rectangle replaces it.",
      find: "selected: () => context.store.get().value,",
      replace: "selected: () => [],",
      caught: "pointer: with Shift, a rectangle adds to the selection",
    },
    {
      broke: "Space and Enter no longer select a photo.",
      find: 'if (event.key === " " || event.key === "Enter") {',
      replace: "if (false) {",
      caught: "keyboard: Space and Enter select a photo, and Space again clears it",
    },
    {
      broke: "Shift with an arrow key no longer extends the selection.",
      find: "if (shift && from && reason",
      replace: "if (false && shift && from && reason",
      caught: "keyboard: Shift with an arrow key extends the selection",
    },
  ],
}

export { photoGrid }
export default ui
