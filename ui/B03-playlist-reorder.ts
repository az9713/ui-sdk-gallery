import {
  type ChangeDetails,
  createChange,
  createReorder,
  createRovingFocus,
  definePrimitive,
  keepFocus,
  type ReorderDraft,
  type ReorderReason,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/web"
import type { UI } from "../src/ui"

type Options = {
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[], details: ChangeDetails<ReorderReason>) => void
}
type State = { active: string | null; value: string[]; moving: ReorderDraft | null }

const playlist = definePrimitive({
  name: "playlist",
  options: { value: "list", defaultValue: "list", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    active: null,
    value: options.value ?? options.defaultValue ?? [],
    moving: null,
  }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    const reorder = createReorder(context, {
      slot: "song",
      key: "value",
      draft: "moving",
      set: (value, details) => change("value", value, details),
      label: (key) => key,
    })
    const roving = createRovingFocus(context, { slot: "song", key: "active" })
    return {
      reorder,
      roving,
      order: () => reorder.order(context.store.get()),
      move: (key: string, index: number) => reorder.move(key, index),
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "listbox",
      keys: { none: "Each track handles the arrow keys." },
      attrs: () => ({ "aria-roledescription": "sortable list" }),
      // A custom element list is static markup, so the root puts the tracks in the order that the state shows.
      bind: (el, { api, store }) => {
        const place = () => {
          const tracks = [...el.children] as HTMLElement[]
          const order = api.order()
          const sorted = order.map((key) => tracks.find((track) => track.getAttribute("value") === key)!)
          if (sorted.every((track, i) => track === tracks[i])) return
          const focused = sorted.find((track) => track === document.activeElement)
          for (const track of sorted) el.append(track)
          if (focused) keepFocus(() => focused)
        }
        return store.subscribe(place)
      },
    }),
    song: slot<{ value: string }>({
      role: "option",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, { key, props, api }) => ({
        tabindex: api.roving.tabIndex(state, { key, props }),
        "aria-selected": String(api.reorder.moving(state, key)),
        "aria-roledescription": "sortable track",
        "data-grabbed": api.reorder.moving(state, key) ? "" : undefined,
        "data-dragging": api.reorder.dragging(state, key) ? "" : undefined,
      }),
      press: { none: "A track is picked up with Space or Enter, and the keydown handler does it." },
      on: {
        keydown: (event, { el, api, key }) => void (api.reorder.keydown(event, key) || api.roving.keydown(event, el!)),
        pointerdown: (event, { api, key }) => api.reorder.pointerdown(event, key),
      },
      bind: (el, part) => {
        const cleanups = [part.api.roving.bind(el, part), part.api.reorder.bind(el, part)]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
  }),
  agent: { actions: ["move"], items: (api) => api.order().map((key) => ({ value: key, label: key })) },
})

createParts(playlist, { root: "b03-playlist", song: "b03-track" })


const SONGS = [
  ["Night Drive", "Halden"],
  ["Blue Hour", "Mara Lund"],
  ["Static Bloom", "The Quiet Hours"],
  ["Slow Burn", "Oskar Vale"],
  ["Glass Harbor", "Nell Aster"],
]
const names = SONGS.map(([title]) => title)

const html = `
<h2>Road trip, 5 songs</h2>
<p id="b03-help">Drag a track to a new place. With the keyboard, press Space to pick it up, move it with the arrow keys, then press Space to drop it. Escape puts it back.</p>
<b03-playlist aria-label="Playlist" aria-describedby="b03-help" default-value="${names}">
  ${SONGS.map(([title, artist]) => `<b03-track value="${title}" aria-describedby="b03-help"><span>${title}</span><small>${artist}</small></b03-track>`).join("")}
</b03-playlist>
<p role="status" data-status>The order has not changed.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 420px; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] #b03-help, [data-stage] [data-status] { color: var(--ui-muted-foreground); font-size: 0.875rem; }
[data-stage] b03-playlist { display: grid; gap: 8px; counter-reset: place; }
[data-stage] b03-track {
  display: grid; grid-template-columns: 24px 1fr; column-gap: 12px; align-items: center;
  padding: 10px 14px; border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); counter-increment: place;
  cursor: grab; user-select: none; touch-action: none;
}
[data-stage] b03-track::before { content: counter(place) / ""; grid-row: span 2; color: var(--ui-muted-foreground); font-variant-numeric: tabular-nums; }
[data-stage] b03-track span { font-weight: 600; }
[data-stage] b03-track small { color: var(--ui-muted-foreground); font-size: 0.8125rem; }
[data-stage] b03-track:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b03-track[data-grabbed] { border-color: var(--ui-primary); box-shadow: 0 0 0 2px var(--ui-primary); }
[data-stage] b03-track[data-dragging] {
  transform: translate(var(--drag-x, 0), var(--drag-y, 0)); position: relative; z-index: 1;
  cursor: grabbing; box-shadow: 0 4px 12px var(--ui-shadow), 0 0 0 2px var(--ui-primary);
}
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  root.querySelector("b03-playlist")!.addEventListener("valuechange", (event) => {
    const { value } = (event as CustomEvent<{ value: string[] }>).detail
    status.textContent = `Order: ${value.join(", ")}.`
  })
}

const ui: UI = {
  id: "B03",
  request: "Build a playlist where a person reorders the tracks by dragging them or with the keyboard: Space picks one up, the arrow keys move it, Space drops it.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Playlist", action: "move", args: ["Static Bloom", 0] },
      { ref: "Playlist", action: "move", args: ["Night Drive", 4] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent ===
      "Order: Static Bloom, Blue Hour, Slow Burn, Glass Harbor, Night Drive.",
  },
  breaks: [
    {
      broke: "Every track is a tab stop.",
      find: "tabindex: api.roving.tabIndex(state, { key, props }),",
      replace: 'tabindex: "0",',
      caught: "keyboard: the list is 1 tab stop, and the arrow keys move focus without a change of order",
    },
    {
      broke: "Space and Enter no longer pick a track up.",
      find: "api.reorder.keydown(event, key) || ",
      replace: "",
      caught: "keyboard: Space picks up a track, the arrow keys move it, and Space drops it",
    },
    {
      broke: "A picked-up track does not show that it is picked up.",
      find: '"aria-selected": String(api.reorder.moving(state, key)),',
      replace: '"aria-selected": "false",',
      caught: "keyboard: Space picks up a track, the arrow keys move it, and Space drops it",
    },
    {
      broke: "Dropping a track does not commit the new order.",
      find: 'set: (value, details) => change("value", value, details),',
      replace: "set: () => false,",
      caught: "keyboard: Space picks up a track, the arrow keys move it, and Space drops it",
    },
    {
      broke: "A pointer press no longer starts a drag.",
      find: "pointerdown: (event, { api, key }) => api.reorder.pointerdown(event, key),",
      replace: "pointerdown: () => {},",
      caught: "pointer: a drag moves a track to the place where it is dropped and reports the drag",
    },
    {
      broke: "The page does not show the tracks in the new order.",
      find: "for (const track of sorted) el.append(track)",
      replace: "",
      caught: "keyboard: on the page, the tracks follow the new order, focus stays on the moved track and the status line reports it",
    },
    {
      broke: "An agent can no longer move a track.",
      find: 'actions: ["move"],',
      replace: "actions: [],",
      caught: "agent: an agent finds the list and its tracks, and moves 2 tracks",
    },
  ],
}

export { playlist }
export default ui
