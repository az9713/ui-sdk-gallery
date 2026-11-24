import {
  bindDrag,
  bindDragPreview,
  type ChangeDetails,
  createAutoScroll,
  createChange,
  createRovingFocus,
  createTransfer,
  definePrimitive,
  dragThreshold,
  elements,
  type TransferDraft,
  type TransferLists,
  type TransferReason,
} from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import type { UI } from "../src/ui"

// "add" is not in the shared vocabulary: a new card from the New card button.
type Reason = TransferReason | "add"
type Options = {
  value?: TransferLists
  defaultValue?: TransferLists
  onValueChange?: (value: TransferLists, details: ChangeDetails<Reason>) => void
}
type State = { value: TransferLists; moving: TransferDraft | null; focused: string | null; over: string | null; added: number }

const COLUMNS: Record<string, string> = { todo: "To do", doing: "Doing", done: "Done" }
const ORDER = Object.keys(COLUMNS)
const LIMIT = 2

const board = definePrimitive({
  name: "board",
  options: { value: "value", defaultValue: "value", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: Options): State => ({
    value: options.value ?? options.defaultValue ?? { todo: [], doing: [], done: [] },
    moving: null,
    focused: null,
    over: null,
    added: 0,
  }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    const { store } = context
    const columnOf = (lists: TransferLists, card: string) => ORDER.find((list) => lists[list]?.includes(card))
    const accepts = (card: string, list: string) =>
      list !== "doing" || store.get().value.doing.filter((key) => key !== card).length < LIMIT
    const transfer = createTransfer(context, {
      key: "value",
      draft: "moving",
      set: (value, details) => change("value", value, details),
      order: () => ORDER,
      accepts,
      listLabel: (list) => COLUMNS[list],
    })
    const roving = createRovingFocus<State, { value: string }>(context, {
      slot: "card",
      key: "focused",
      move: (event, { from, rtl }) => {
        const lists = transfer.lists(store.get())
        const at = ORDER.indexOf(columnOf(lists, from.key)!)
        const cards = lists[ORDER[at]]
        const row = cards.indexOf(from.key)
        if (event.key === "ArrowDown") return cards[row + 1] ?? from.key
        if (event.key === "ArrowUp") return cards[row - 1] ?? from.key
        if (event.key === "Home") return cards[0]
        if (event.key === "End") return cards.at(-1)
        const step = ({ ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 } as Record<string, number>)[event.key]
        if (!step) return undefined
        for (let next = at + step; next >= 0 && next < ORDER.length; next += step) {
          const there = lists[ORDER[next]]
          if (there.length) return there[Math.min(row, there.length - 1)]
        }
        return from.key
      },
    })

    const add = (list: string, reason: Reason, event?: Event) => {
      if (!COLUMNS[list]) throw new Error(`No column "${list}". Columns: ${ORDER.join(", ")}.`)
      if (!accepts("", list)) throw new Error(`${COLUMNS[list]} holds at most ${LIMIT} cards.`)
      const { value, added } = store.get()
      const card = `New card ${added + 1}`
      store.set({ added: added + 1 })
      return change("value", { ...value, [list]: [...value[list], card] }, { reason, event })
    }
    const columnAt = (x: number, y: number) => {
      const hit = elements(context, "column").find(({ el }) => {
        const box = el.getBoundingClientRect()
        return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
      })
      return hit && accepts("", hit.key) ? hit.key : null
    }
    let stop: (() => void) | undefined
    let dragged = false
    context.onDestroy(() => stop?.())

    return {
      transfer,
      roving,
      cards: () => {
        const lists = store.get().value
        return ORDER.flatMap((list) => lists[list].map((card) => ({ value: card, label: `${card}, ${COLUMNS[list]}` })))
      },
      moveCard: (card: string, column: string, index?: number) => {
        const lists = store.get().value
        const list = ORDER.find((key) => key === column || COLUMNS[key].toLowerCase() === String(column).toLowerCase())
        if (!list) throw new Error(`No column "${column}". Columns: ${ORDER.map((key) => COLUMNS[key]).join(", ")}.`)
        if (!columnOf(lists, card)) throw new Error(`No card "${card}". Cards: ${ORDER.flatMap((key) => lists[key]).join(", ")}.`)
        if (!transfer.move(card, list, index ?? lists[list].filter((key) => key !== card).length))
          throw new Error(`${COLUMNS[list]} holds at most ${LIMIT} cards.`)
        return true
      },
      addCard: (column: string = "todo") => add(ORDER.find((key) => key === column || COLUMNS[key] === column) ?? column, "add"),
      press: (event?: Event) => {
        if (dragged) dragged = false
        else add("todo", "add", event)
      },
      pointerdown: (event: PointerEvent, el: HTMLElement) => {
        if (event.button !== 0) return
        stop?.()
        dragged = false
        let preview: ReturnType<typeof bindDragPreview> | undefined
        let scroll: ReturnType<typeof createAutoScroll> | undefined
        let x = event.clientX
        let y = event.clientY
        const hover = () => store.set({ over: columnAt(x, y) })
        stop = bindDrag(el, event, {
          threshold: dragThreshold,
          cancelOnEscape: true,
          onStart: () => {
            dragged = true
            preview = bindDragPreview(el, { x, y })
            scroll = createAutoScroll({ edge: 40, speed: 12, ignore: () => preview?.el, onScroll: hover })
          },
          onMove: (sample) => {
            x = sample.x
            y = sample.y
            preview?.move(x, y)
            preview?.el.toggleAttribute("data-over", !!store.get().over)
            scroll?.update(x, y)
            hover()
          },
          onEnd: (end, canceled) => {
            preview?.remove()
            scroll?.stop()
            const { over } = store.get()
            store.set({ over: null })
            if (!canceled && over) add(over, "drag", end)
          },
        })
      },
    }
  },
  slots: (slot) => ({
    root: slot({ role: "group" }),
    column: slot<{ value: string }>({
      role: "listbox",
      keys: { none: "Each card handles the arrow keys." },
      props: { value: "string" },
      attrs: (state, { key }) => ({
        "aria-orientation": "vertical",
        "data-column": key,
        "data-over": state.over === key ? "" : undefined,
        "data-full": key === "doing" && state.value.doing.length >= LIMIT ? "" : undefined,
      }),
      bind: (el, { api, key }) => api.transfer.bindList(el, key),
    }),
    card: slot<{ value: string }>({
      role: "option",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-roledescription": "card",
        "aria-selected": String(part.api.transfer.moving(state, part.key)),
        "data-moving": part.api.transfer.moving(state, part.key) ? "" : undefined,
        "data-dragging": part.api.transfer.dragging(state, part.key) ? "" : undefined,
      }),
      // A click focuses the card; a drag moves it.
      press: ({ api, key }) => api.roving.focus(key),
      on: {
        keydown: (event, { el, api, key }) => api.transfer.keydown(event, key) || api.roving.keydown(event, el!),
        pointerdown: (event, { api, key }) => api.transfer.pointerdown(event, key),
      },
      bind: (el, part) => {
        const cleanups = [part.api.roving.bind(el, part), part.api.transfer.bindItem(el, part.key)]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
    add: slot({
      role: "button",
      focus: "native",
      attrs: () => ({ type: "button" }),
      press: ({ api }, event) => api.press(event),
      on: { pointerdown: (event, { el, api }) => api.pointerdown(event, el!) },
    }),
  }),
  agent: { actions: ["moveCard", "addCard"], items: (api) => api.cards() },
})

// Web components keep their markup, so the root puts each card in its column, in the order of the lists.
function place(el: HTMLElement, lists: TransferLists) {
  for (const list of ORDER) {
    const column = el.querySelector<HTMLElement>(`b02-board-column[value="${list}"]`)
    if (!column) continue
    lists[list].forEach((card, index) => {
      let item = el.querySelector<HTMLElement>(`b02-board-card[value="${CSS.escape(card)}"]`)
      if (!item) {
        item = el.ownerDocument.createElement("b02-board-card")
        item.setAttribute("value", card)
        item.textContent = card
      }
      if (column.children[index] !== item) column.insertBefore(item, column.children[index] ?? null)
    })
  }
}

createParts(board, {
  root: {
    tag: "b02-board",
    display: "block",
    options: (el) => ({
      defaultValue: Object.fromEntries(
        [...el.querySelectorAll("b02-board-column")].map((column) => [
          column.getAttribute("value")!,
          [...column.querySelectorAll("b02-board-card")].map((card) => card.getAttribute("value")!),
        ]),
      ),
    }),
    render: (el, instance) => {
      const api = instance.api as { transfer: { lists: (state: State) => TransferLists } }
      const update = () => place(el, api.transfer.lists(instance.get() as State))
      update()
      return instance.subscribe(update)
    },
  },
  column: "b02-board-column",
  card: "b02-board-card",
  add: { tag: "b02-board-add", target: wrappedButton, display: "contents" },
})

const START: TransferLists = {
  todo: ["Write release notes", "Fix login bug", "Update icons"],
  doing: ["Search page"],
  done: ["Billing export"],
}

const html = `
<b02-board aria-label="Sprint board">
  <div data-columns>
    ${ORDER.map(
      (list) => `<section data-lane>
      <h2>${COLUMNS[list]}${list === "doing" ? ` <span>(max ${LIMIT})</span>` : ""}</h2>
      <b02-board-column value="${list}" aria-label="${COLUMNS[list]}">${START[list]
        .map((card) => `<b02-board-card value="${card}">${card}</b02-board-card>`)
        .join("")}</b02-board-column>
    </section>`,
    ).join("")}
  </div>
  <b02-board-add><button>New card</button></b02-board-add>
</b02-board>
<p data-hint>Drag a card to another column. With the keyboard: Space picks a card up, the arrow keys move it, Space drops it, Escape puts it back. Drag New card onto a column, or press it to add a card to To do.</p>
<p role="status" data-status>No card has moved.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 760px; }
[data-stage] p, [data-stage] h2 { margin: 0; }
[data-stage] b02-board { display: grid; gap: 16px; justify-items: start; }
[data-stage] [data-columns] { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; width: 100%; }
[data-stage] [data-lane] { display: grid; grid-template-rows: auto 1fr; gap: 8px; min-width: 0; }
[data-stage] h2 { font-size: 0.875rem; font-weight: 600; }
[data-stage] h2 span { font-weight: 400; color: var(--ui-muted-foreground); }
[data-stage] b02-board-column {
  display: flex; flex-direction: column; gap: 8px; min-height: 200px; max-height: 320px; overflow-y: auto;
  padding: 8px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-muted);
}
[data-stage] b02-board-column[data-over] { outline: 2px solid var(--ui-primary); outline-offset: -2px; }
[data-stage] b02-board-card, [data-drag-preview] {
  display: block; padding: 10px 12px; border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); font-size: 0.875rem;
  cursor: grab; touch-action: none; user-select: none;
}
[data-stage] b02-board-card:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b02-board-card[data-moving] { border-color: var(--ui-primary); font-weight: 600; }
[data-stage] b02-board-card[data-dragging] { border-style: dashed; color: var(--ui-muted-foreground); }
[data-drag-preview] { box-shadow: 0 8px 24px var(--ui-shadow); cursor: grabbing; }
[data-drag-preview][data-over] { border-color: var(--ui-primary); }
[data-stage] b02-board-add button { touch-action: none; }
[data-stage] [data-hint], [data-stage] [data-status] { color: var(--ui-muted-foreground); font-size: 0.875rem; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const el = root.querySelector("b02-board")!
  let lists = START
  el.addEventListener("valuechange", (event) => {
    const next = (event as CustomEvent<{ value: TransferLists }>).detail.value
    const where = (value: TransferLists, card: string) => ORDER.find((list) => value[list]?.includes(card))
    const cards = ORDER.flatMap((list) => next[list])
    const added = cards.find((card) => !where(lists, card))
    const moved = cards.find((card) => where(lists, card) !== where(next, card))
    if (added) status.textContent = `Added ${added} to ${COLUMNS[where(next, added)!]}.`
    else if (moved) status.textContent = `Moved ${moved} to ${COLUMNS[where(next, moved)!]}.`
    else status.textContent = "Reordered the cards."
    lists = next
  })
}

const ui: UI = {
  id: "B02",
  request:
    "Build a card board with To do, Doing and Done columns: cards move between columns by drag and by keyboard, Doing holds at most 2 cards, and a New card button adds a card.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Sprint board", action: "moveCard", args: ["Fix login bug", "Done"] },
      { ref: "Sprint board", action: "addCard", args: ["Doing"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Added New card 1 to Doing.",
  },
  breaks: [
    {
      broke: "Left and Right no longer move focus between columns.",
      find: "const step = ({ ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 } as Record<string, number>)[event.key]",
      replace: "const step = 0",
      caught: "keyboard: arrow keys move in a column and between columns, and Home, End go to the column ends",
    },
    {
      broke: "Space no longer picks a card up.",
      find: "api.transfer.keydown(event, key) || ",
      replace: "",
      caught: "keyboard: Space picks a card up, Right moves it to the next column, and Space drops it",
    },
    {
      broke: "Doing takes more than 2 cards.",
      find: 'list !== "doing" || ',
      replace: "true || ",
      caught: "keyboard: Doing takes at most 2 cards, so a third card skips it",
    },
    {
      broke: "A drag of New card onto a column no longer adds a card.",
      find: 'if (!canceled && over) add(over, "drag", end)',
      replace: "",
      caught: "pointer: a drag of New card onto a column adds a card there, and a click adds it to To do",
    },
    {
      broke: "moveCard no longer refuses a column that does not exist.",
      find: "if (!list) throw",
      replace: "if (false) throw",
      caught: "agent: moveCard and addCard check the card and the column, and refuse a full Doing",
    },
  ],
}

export { board }
export default ui
