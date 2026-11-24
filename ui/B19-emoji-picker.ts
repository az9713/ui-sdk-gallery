import {
  type ChangeDetails,
  createChange,
  createPopup,
  createRovingFocus,
  definePrimitive,
  popupContent,
  type PopupState,
  popupState,
  popupTrigger,
  type RovingFocusMoveContext,
  selects,
} from "@ui-sdk/core"
import { popoverPreset } from "@ui-sdk/core/popover"
import { createParts, wrappedButton } from "@ui-sdk/web"
import type { UI } from "../src/ui"

// "item-press" closes the popup when an emoji is picked. The rest are the popover's own reasons.
type OpenReason = "trigger-press" | "escape-key" | "outside-press" | "focus-out" | "window-blur" | "close-press" | "imperative" | "item-press"
type Item = { value: string; label: string }
type Options = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, details: ChangeDetails<OpenReason>) => void
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null, details: ChangeDetails<"item-press" | "imperative">) => void
  columns?: number
  items?: Item[]
}
type State = PopupState & { value: string | null; focused: string | null; columns: number; items: Item[] }

// The emoji flow into rows of `columns`, so the last row can be short.
const flow = (columns: () => number) => (event: KeyboardEvent, { from, items, rtl }: RovingFocusMoveContext) => {
  const n = columns()
  const at = items.findIndex((item) => item.key === from.key)
  const last = items.length - 1
  const start = at - (at % n)
  const end = Math.min(start + n - 1, last)
  const ahead = ({ ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 } as Record<string, number>)[event.key]
  let to: number
  if (ahead !== undefined) to = at + ahead < start || at + ahead > end ? at : at + ahead
  // Down into a column that the short last row lacks lands on its last emoji.
  else if (event.key === "ArrowDown") to = at + n <= last ? at + n : start + n <= last ? last : at
  else if (event.key === "ArrowUp") to = at - n >= 0 ? at - n : at
  else if (event.key === "Home") to = event.ctrlKey ? 0 : start
  else if (event.key === "End") to = event.ctrlKey ? last : end
  else return undefined
  return items[to].key
}

const emojiPicker = definePrimitive({
  name: "emoji-picker",
  options: {
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    value: "value",
    defaultValue: "value",
    onValueChange: "callback",
    columns: "number",
    items: "list",
  },
  controlled: ["open", "value"],
  state: (options: Options): State => ({
    ...popupState(options),
    value: options.value ?? options.defaultValue ?? null,
    focused: null,
    columns: options.columns ?? 6,
    items: options.items ?? [],
  }),
  sync: (options) => ({
    columns: options.columns ?? 6,
    items: options.items ?? [],
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.open === undefined ? {} : { open: options.open }),
  }),
  api: (context) => {
    const change = createChange(context)
    const popup = createPopup(context, { preset: popoverPreset })
    const roving = createRovingFocus<State, { value: string }>(context, {
      slot: "emoji",
      key: "focused",
      move: flow(() => context.store.get().columns),
    })
    const choose = (name: string, event?: Event) => {
      const { items } = context.store.get()
      const item = items.find((entry) => entry.value === name || entry.label.toLowerCase() === String(name).toLowerCase())
      if (!item) throw new Error(`No emoji "${name}". Emoji: ${items.map((entry) => entry.label).join(", ")}.`)
      const reason = event ? "item-press" : "imperative"
      change("value", item.value, { reason, event })
      popup.setOpen(false, { reason: "item-press", event })
      return true
    }
    return { ...popup, roving, choose }
  },
  slots: (slot) => ({
    root: slot({ role: "group" }),
    trigger: popupTrigger(slot),
    content: popupContent(slot),
    grid: slot({ role: "grid", keys: { none: "Each emoji handles the arrow keys." } }),
    row: slot<{ value: string }>({ role: "row", props: { value: "string" } }),
    emoji: slot<{ value: string }>({
      role: "gridcell",
      focus: "roving",
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null], value: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-selected": String(state.value === part.key),
        "data-selected": state.value === part.key ? "" : undefined,
      }),
      press: ({ api, key }, event) => void api.choose(key, event),
      on: {
        // A gridcell is not a button, so press hears only its clicks.
        keydown: (event, { el, api, key }) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault()
            api.choose(key, event)
          } else api.roving.keydown(event, el!)
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
  agent: { actions: ["setOpen", "choose"] },
})

const COLUMNS = 6
const EMOJI = [
  ["thumbs-up", "Thumbs up", "👍"],
  ["heart", "Heart", "❤️"],
  ["laugh", "Laughing", "😂"],
  ["party", "Party", "🎉"],
  ["fire", "Fire", "🔥"],
  ["eyes", "Eyes", "👀"],
  ["clap", "Clap", "👏"],
  ["rocket", "Rocket", "🚀"],
  ["thinking", "Thinking", "🤔"],
  ["check", "Check mark", "✅"],
  ["wave", "Wave", "👋"],
  ["sparkles", "Sparkles", "✨"],
  ["coffee", "Coffee", "☕"],
  ["star", "Star", "⭐"],
].map(([value, label, glyph]) => ({ value, label, glyph }))

createParts(emojiPicker, {
  root: { tag: "b19-emoji-picker", display: "block", options: () => ({ items: EMOJI.map(({ value, label }) => ({ value, label })) }) },
  trigger: { tag: "b19-trigger", target: wrappedButton },
  content: { tag: "b19-popup", display: "block" },
  grid: { tag: "b19-grid", display: "block" },
  row: { tag: "b19-row", display: "block" },
  emoji: "b19-emoji",
})

const rows = Array.from({ length: Math.ceil(EMOJI.length / COLUMNS) }, (_, row) => EMOJI.slice(row * COLUMNS, row * COLUMNS + COLUMNS))

const html = `
<article data-message>
  <p data-author>Mara Lind</p>
  <p>The release notes for version 2.4 are ready for review.</p>
</article>
<p role="status" data-status>No reaction yet.</p>
<b19-emoji-picker aria-label="Emoji picker" columns="${COLUMNS}" default-open>
  <b19-trigger><button>Add reaction</button></b19-trigger>
  <b19-popup side="bottom" align="start">
    <b19-grid aria-label="Reactions">
      ${rows
        .map(
          (row, index) =>
            `<b19-row value="row-${index}">${row
              .map((item) => `<b19-emoji value="${item.value}" aria-label="${item.label}"><span aria-hidden="true">${item.glyph}</span></b19-emoji>`)
              .join("")}</b19-row>`,
        )
        .join("")}
    </b19-grid>
  </b19-popup>
</b19-emoji-picker>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; padding-bottom: 220px; }
[data-stage] p { margin: 0; }
[data-stage] [data-message] {
  display: grid; gap: 4px; max-width: 60ch; padding: 12px 16px;
  border: 1px solid var(--ui-border); border-radius: var(--ui-radius);
}
[data-stage] [data-author] { font-weight: 600; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
[data-stage] b19-trigger button {
  height: calc(var(--ui-spacing) * 8); padding: 0 12px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); font: inherit; cursor: pointer;
}
[data-stage] b19-trigger button:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b19-popup {
  margin: 0; padding: 8px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); box-shadow: var(--ui-shadow);
}
[data-stage] b19-grid { display: grid; gap: 4px; }
[data-stage] b19-row { display: flex; gap: 4px; }
[data-stage] b19-emoji {
  display: grid; place-items: center; width: 40px; height: 40px;
  border: 1px solid transparent; border-radius: var(--ui-radius);
  font-size: 1.375rem; line-height: 1; cursor: pointer; user-select: none;
}
[data-stage] b19-emoji:hover { background: var(--ui-muted); }
[data-stage] b19-emoji:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 1px; }
[data-stage] b19-emoji[data-selected] { border-color: var(--ui-primary); background: var(--ui-muted); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  root.querySelector("b19-emoji-picker")!.addEventListener("valuechange", (event) => {
    const item = EMOJI.find((entry) => entry.value === (event as CustomEvent<{ value: string | null }>).detail.value)
    status.textContent = item ? `Reaction: ${item.label} ${item.glyph}.` : "No reaction yet."
  })
}

const ui: UI = {
  id: "B19",
  request:
    "Build an emoji picker: a button opens a popup with a grid of emoji that flows into rows, the arrow keys move through the grid, and Enter or a click picks an emoji and closes the popup.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Emoji picker", action: "setOpen", args: [true] },
      { ref: "Emoji picker", action: "choose", args: ["Rocket"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Reaction: Rocket 🚀.",
  },
  breaks: [
    {
      broke: "Down into a column that the short last row lacks no longer lands on its last emoji.",
      find: "start + n <= last ? last : at",
      replace: "at",
      caught: "keyboard: Down into a column that the short last row lacks lands on its last emoji",
    },
    {
      broke: "Left and Right no longer swap in right to left text.",
      find: "ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1",
      replace: "ArrowRight: 1, ArrowLeft: -1",
      caught: "direction: Left and Right follow the text direction",
    },
    {
      broke: "Left and Right leave the row.",
      find: "at + ahead < start || at + ahead > end ? at : at + ahead",
      replace: "Math.max(0, Math.min(last, at + ahead))",
      caught: "keyboard: Left and Right stay in the row, and Home and End go to its ends",
    },
    {
      broke: "Space and Enter no longer pick an emoji.",
      find: 'if (event.key === " " || event.key === "Enter") {',
      replace: "if (false) {",
      caught: "keyboard: Enter and Space pick the focused emoji and mark it selected",
    },
    {
      broke: "Picking an emoji no longer closes the popup.",
      find: 'popup.setOpen(false, { reason: "item-press", event })',
      replace: "void 0",
      caught: "keyboard: a pick closes the popup and focus goes back to the trigger",
    },
    {
      broke: "An agent can pick an emoji that is not in the grid.",
      find: 'if (!item) throw new Error(`No emoji "${name}". Emoji: ${items.map((entry) => entry.label).join(", ")}.`)',
      replace: "if (!item) return false",
      caught: "agent: an agent opens the picker and picks an emoji, and an emoji that is not in the grid is refused",
    },
  ],
}

export { emojiPicker }
export default ui
