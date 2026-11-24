import {
  type ChangeDetails,
  createChange,
  createPointerKind,
  createRovingFocus,
  createSwipeActions,
  css,
  definePrimitive,
  live,
  type PointerKindState,
  type SwipeDraft,
  type SwipeOpen,
  type SwipeSide,
} from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import type { UI } from "../src/ui"

// "full-swipe" is not in the shared vocabulary: a swipe past 60% of the row runs its side's first action.
type Reason = "item-press" | "imperative" | "full-swipe"
type Options = {
  messages: Record<string, string>
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[], details: ChangeDetails<Reason>) => void
  unread?: string[]
  defaultUnread?: string[]
  onUnreadChange?: (value: string[], details: ChangeDetails<Reason>) => void
  flagged?: string[]
  defaultFlagged?: string[]
  onFlaggedChange?: (value: string[], details: ChangeDetails<Reason>) => void
}
// value holds the messages still in the inbox. messages is an option that each row renders from, so the state has a copy.
type State = {
  messages: Record<string, string>
  value: string[]
  unread: string[]
  flagged: string[]
  open: SwipeOpen | null
  swiping: SwipeDraft | null
  active: string | null
  pointer: PointerKindState
}
type Act = "read" | "flag" | "archive"

const turned = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((item) => item !== id))
const isOn = (state: State, row: string, act: string) =>
  act === "read" ? !state.unread.includes(row) : act === "flag" ? state.flagged.includes(row) : false
const wantsOn = (flag: unknown) => flag !== false && flag !== "false"

const inbox = definePrimitive({
  name: "inbox",
  options: {
    messages: "value",
    value: "list",
    defaultValue: "list",
    onValueChange: "callback",
    unread: "list",
    defaultUnread: "list",
    onUnreadChange: "callback",
    flagged: "list",
    defaultFlagged: "list",
    onFlaggedChange: "callback",
  },
  controlled: ["value", "unread", "flagged"],
  live: ["swiping"],
  state: (options: Options): State => ({
    messages: options.messages,
    value: options.value ?? options.defaultValue ?? Object.keys(options.messages),
    unread: options.unread ?? options.defaultUnread ?? [],
    flagged: options.flagged ?? options.defaultFlagged ?? [],
    open: null,
    swiping: null,
    active: null,
    pointer: { pointer: "unknown", hover: "unknown", anyPointer: "unknown", anyHover: "unknown" },
  }),
  sync: (options) => ({
    messages: options.messages,
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.unread === undefined ? {} : { unread: options.unread }),
    ...(options.flagged === undefined ? {} : { flagged: options.flagged }),
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const pointerKind = createPointerKind()
    const roving = createRovingFocus<State, { value: string }>(context, {
      slot: "row",
      key: "active",
      focusable: ({ key }) => store.get().value.includes(key),
    })

    const run = (row: string, act: Act, details: { reason: Reason; event?: Event }): boolean => {
      const state = store.get()
      if (act === "read") return change("unread", turned(state.unread, row, isOn(state, row, "read")), details)
      if (act === "flag") return change("flagged", turned(state.flagged, row, !isOn(state, row, "flag")), details)
      // An archived row leaves the page, so focus that was in it goes to the next row, or the one before.
      const rows = roving.items().map((item) => item.key)
      const next = rows[rows.indexOf(row) + 1] ?? rows[rows.indexOf(row) - 1]
      const had = !!context.element("row", row)?.contains(document.activeElement)
      if (swipe.open()?.key === row) swipe.close()
      const done = change("value", state.value.filter((item) => item !== row), details)
      if (done && had && next) roving.focus(next)
      return done
    }
    const swipe = createSwipeActions(context, {
      key: "open",
      draft: "swiping",
      onFullSwipe: (row, side, { event }) => run(row, side === "start" ? "read" : "archive", { reason: "full-swipe", event }),
    })

    const find = (message: unknown) => {
      const { value, messages } = store.get()
      const text = String(message).toLowerCase()
      const row = value.find((id) => id === message || messages[id].toLowerCase() === text)
      if (!row) throw new Error(`No message "${message}" in the inbox. Messages: ${value.map((id) => `${id} (${messages[id]})`).join(", ")}.`)
      return row
    }

    return {
      roving,
      swipe,
      pointerKind,
      messages: () => store.get().value.map((id) => ({ value: id, label: store.get().messages[id] })),
      // An action behind the row closes it and gives focus back to the row. A mouse button leaves focus where it is.
      press: (row: string, act: string, event: Event | undefined, behind: boolean) => {
        const done = run(row, act as Act, { reason: "item-press", event })
        if (behind && act !== "archive") swipe.close({ focus: true })
        return done
      },
      markRead: (message: string, read: unknown = true) => {
        const row = find(message)
        return change("unread", turned(store.get().unread, row, !wantsOn(read)), { reason: "imperative" })
      },
      flag: (message: string, flagged: unknown = true) => {
        const row = find(message)
        return change("flagged", turned(store.get().flagged, row, wantsOn(flagged)), { reason: "imperative" })
      },
      archive: (message: string) => run(find(message), "archive", { reason: "imperative" }),
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "list",
      attrs: (state) => ({ "data-pointer": state.pointer.pointer, "data-hover": state.pointer.hover }),
      bind: (_el, { api, store }) => api.pointerKind.follow(store, "pointer"),
    }),
    row: slot<{ value: string }>({
      role: "listitem",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
        hidden: state.value.includes(part.key) ? undefined : "",
        "data-unread": state.unread.includes(part.key) ? "" : undefined,
        "data-flagged": state.flagged.includes(part.key) ? "" : undefined,
        style: css({ position: "relative", overflow: "hidden", "touch-action": "pan-y" }),
      }),
      on: {
        keydown: (event, { el, api, key }) => {
          if (api.swipe.keydown(event, key)) return
          if (event.target === el) api.roving.keydown(event, el!)
        },
        pointerdown: (event, { el, api, key }) => api.swipe.pointerdown(event, key, el!),
      },
      bind: (el, part) => {
        const cleanups = [part.api.roving.bind(el, part), part.api.swipe.bindRow(el, part.key)]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
    content: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ style: css({ transform: "translateX(var(--swipe-x, 0px))" }) }),
      live: live((state, { api, key }) => api.swipe.contentAttrs(state, key)),
    }),
    actions: slot<{ value: string; row: string; side: string }>({
      props: { value: "string", row: "string", side: "string" },
      attrs: (state, { api, props }) => api.swipe.actionsAttrs(state, props.row, props.side as SwipeSide),
      bind: (el, { api, props }) => api.swipe.bindActions(el, props.row, props.side as SwipeSide),
    }),
    action: slot<{ value: string; row: string; act: string }>({
      role: "button",
      focus: "native",
      props: { value: "string", row: "string", act: "string" },
      attrs: (state, { props }) => ({ type: "button", "data-on": isOn(state, props.row, props.act) ? "" : undefined }),
      press: ({ api, props }, event) => api.press(props.row, props.act, event, true),
    }),
    // The same actions as buttons for a mouse. The keyboard reaches them behind the row, so they are not tab stops.
    tool: slot<{ value: string; row: string; act: string }>({
      role: "button",
      focus: "native",
      props: { value: "string", row: "string", act: "string" },
      attrs: (state, { props }) => ({ type: "button", tabindex: "-1", "data-on": isOn(state, props.row, props.act) ? "" : undefined }),
      press: ({ api, props }, event) => api.press(props.row, props.act, event, false),
    }),
  }),
  agent: { actions: ["markRead", "flag", "archive"], items: (api) => api.messages() },
})

const MESSAGES = [
  { id: "invoice", sender: "Northwind Billing", subject: "Invoice 4471 is ready", preview: "Your March invoice for $1,280.00 is attached as a PDF.", time: "9:41", unread: true },
  { id: "standup", sender: "Priya Raman", subject: "Standup moves to 10:30", preview: "The design review runs long, so we start 30 minutes later today.", time: "9:12", unread: true },
  { id: "lease", sender: "Harbor Lofts", subject: "Lease renewal", preview: "Please sign the renewal for unit 4B before 30 April.", time: "Yesterday", flagged: true },
  { id: "trip", sender: "Tomas Berg", subject: "Photos from the trip", preview: "I put 42 photos in the shared album. The ones from the ferry came out well.", time: "Mon" },
  { id: "signin", sender: "Account security", subject: "New sign-in on Windows", preview: "We saw a new sign-in from Oslo at 22:04. If it was you, you can ignore this.", time: "Sun", unread: true },
]
const TITLES = Object.fromEntries(MESSAGES.map((m) => [m.id, m.subject]))

createParts(inbox, {
  root: { tag: "b11-inbox", display: "block", options: () => ({ messages: TITLES }) },
  row: { tag: "b11-row", display: "block" },
  content: { tag: "b11-row-content", display: "block" },
  actions: { tag: "b11-row-actions", display: "block" },
  action: { tag: "b11-row-action", target: wrappedButton, display: "contents" },
  tool: { tag: "b11-row-tool", target: wrappedButton, display: "contents" },
})

const LABELS: Record<Act, [string, string]> = { read: ["Mark read", "Mark unread"], flag: ["Flag", "Unflag"], archive: ["Archive", "Archive"] }
const button = (tag: string, row: string, act: Act) => {
  const [off, on] = LABELS[act]
  const text = off === on ? off : `<span data-if="off">${off}</span><span data-if="on">${on}</span>`
  return `<${tag} value="${row}:${act}" row="${row}" act="${act}"><button>${text}</button></${tag}>`
}

const html = `
<h2>Inbox</h2>
<p id="b11-help">Swipe a message right to mark it read, or left to flag or archive it. A long swipe runs the action at once. With a mouse, use the buttons on the message. With the keyboard, Up and Down go between messages, Left and Right show the actions, and Escape hides them.</p>
<b11-inbox aria-label="Inbox" aria-describedby="b11-help" default-unread="${MESSAGES.filter((m) => m.unread).map((m) => m.id)}" default-flagged="${MESSAGES.filter((m) => m.flagged).map((m) => m.id)}">
  ${MESSAGES.map(
    (m) => `<b11-row value="${m.id}">
    <b11-row-content value="${m.id}">
      <span data-dot aria-hidden="true"></span>
      <span data-from><strong>${m.sender}</strong> <span data-badge="unread">Unread</span> <span data-badge="flagged">Flagged</span></span>
      <time>${m.time}</time>
      <span data-subject>${m.subject}</span>
      <span data-preview>${m.preview}</span>
      <span data-tools>${button("b11-row-tool", m.id, "read")}${button("b11-row-tool", m.id, "flag")}${button("b11-row-tool", m.id, "archive")}</span>
    </b11-row-content>
    <b11-row-actions value="${m.id}:start" row="${m.id}" side="start">${button("b11-row-action", m.id, "read")}</b11-row-actions>
    <b11-row-actions value="${m.id}:end" row="${m.id}" side="end">${button("b11-row-action", m.id, "flag")}${button("b11-row-action", m.id, "archive")}</b11-row-actions>
  </b11-row>`,
  ).join("")}
</b11-inbox>
<p role="status" data-status>No change yet.</p>`

const styles = `
[data-stage] { display: grid; gap: 16px; max-width: 760px; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] #b11-help, [data-stage] [data-status] { max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
[data-stage] b11-inbox { border: 1px solid var(--ui-border); border-radius: var(--ui-radius); overflow: hidden; }
[data-stage] b11-row { border-top: 1px solid var(--ui-border); user-select: none; }
[data-stage] b11-row:first-child { border-top: 0; }
[data-stage] b11-row[hidden] { display: none; }
[data-stage] b11-row:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: -2px; }
[data-stage] b11-row-content {
  display: grid;
  position: relative; z-index: 1; grid-template-columns: 10px minmax(0, 1fr) auto; column-gap: 12px; row-gap: 2px;
  padding: 12px 16px; background: var(--ui-background); color: var(--ui-foreground); font-size: 0.875rem; line-height: 1.4;
  transition: transform 180ms ease;
}
[data-stage] b11-row-content[data-swiping] { transition: none; }
[data-stage] [data-dot] { grid-row: 1; align-self: center; width: 8px; height: 8px; border-radius: 50%; }
[data-stage] b11-row[data-unread] [data-dot] { background: var(--ui-primary); }
[data-stage] [data-from] { grid-column: 2; font-weight: 400; }
[data-stage] b11-row[data-unread] [data-from] strong { font-weight: 700; }
[data-stage] b11-row:not([data-unread]) [data-from] strong { font-weight: 500; }
[data-stage] [data-badge] {
  display: none; margin-inline-start: 6px; padding: 0 6px; border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  font-size: 0.75rem; color: var(--ui-foreground);
}
[data-stage] b11-row[data-unread] [data-badge="unread"], [data-stage] b11-row[data-flagged] [data-badge="flagged"] { display: inline-block; }
[data-stage] b11-row-content time { grid-column: 3; justify-self: end; color: var(--ui-muted-foreground); font-size: 0.8125rem; }
[data-stage] [data-subject], [data-stage] [data-preview] { grid-column: 2; }
[data-stage] [data-subject] { font-weight: 600; }
[data-stage] [data-preview] { color: var(--ui-muted-foreground); }
[data-stage] [data-tools] { grid-column: 3; grid-row: 2 / span 2; align-self: end; display: flex; gap: 6px; }
[data-stage] b11-inbox[data-hover="none"] [data-tools] { display: none; }
[data-stage] b11-row-tool button {
  height: 28px; padding: 0 10px; border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); font: inherit; font-size: 0.8125rem; cursor: pointer; white-space: nowrap;
}
[data-stage] b11-row-tool button:hover { background: var(--ui-muted); }
[data-stage] button:not([data-on]) [data-if="on"], [data-stage] button[data-on] [data-if="off"] { display: none; }
[data-stage] b11-row-actions { display: flex; position: absolute; top: 0; bottom: 0; visibility: hidden; }
[data-stage] b11-row-actions[data-side="start"] { inset-inline-start: 0; }
[data-stage] b11-row-actions[data-side="end"] { inset-inline-end: 0; }
[data-stage] b11-row:has(> b11-row-content[data-swipe="start"]) > b11-row-actions[data-side="start"],
[data-stage] b11-row:has(> b11-row-content[data-swipe="end"]) > b11-row-actions[data-side="end"] { visibility: visible; }
[data-stage] b11-row-action button {
  width: 104px; height: 100%; border: 0; font: inherit; font-size: 0.875rem; font-weight: 600; cursor: pointer;
  background: var(--ui-primary); color: var(--ui-primary-foreground);
}
[data-stage] b11-row-action[act="flag"] button { background: var(--ui-muted); color: var(--ui-foreground); }
[data-stage] b11-row-action button:focus-visible, [data-stage] b11-row-tool button:focus-visible {
  outline: 2px solid var(--ui-ring); outline-offset: -4px;
}
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const box = root.querySelector("b11-inbox")!
  let value = MESSAGES.map((m) => m.id)
  let unread = MESSAGES.filter((m) => m.unread).map((m) => m.id)
  let flagged = MESSAGES.filter((m) => m.flagged).map((m) => m.id)
  const diff = (from: string[], to: string[]) => ({ added: to.find((id) => !from.includes(id)), removed: from.find((id) => !to.includes(id)) })
  const next = (event: Event) => (event as CustomEvent<{ value: string[] }>).detail.value
  box.addEventListener("valuechange", (event) => {
    const { removed } = diff(value, (value = next(event)))
    if (removed) status.textContent = `Archived "${TITLES[removed]}".`
  })
  box.addEventListener("unreadchange", (event) => {
    const { added, removed } = diff(unread, (unread = next(event)))
    if (added) status.textContent = `Marked "${TITLES[added]}" as unread.`
    else if (removed) status.textContent = `Marked "${TITLES[removed]}" as read.`
  })
  box.addEventListener("flaggedchange", (event) => {
    const { added, removed } = diff(flagged, (flagged = next(event)))
    if (added) status.textContent = `Flagged "${TITLES[added]}".`
    else if (removed) status.textContent = `Unflagged "${TITLES[removed]}".`
  })
}

const ui: UI = {
  id: "B11",
  request:
    "Build an inbox where a person swipes a message right to mark it read or left to flag or archive it, with the same actions as buttons for a mouse and from the keyboard.",
  css: styles,
  mount,
  task: {
    steps: [
      { ref: "Inbox", action: "markRead", args: ["invoice"] },
      { ref: "Inbox", action: "flag", args: ["Standup moves to 10:30"] },
      { ref: "Inbox", action: "archive", args: ["signin"] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === 'Archived "New sign-in on Windows".' &&
      !root.querySelector('b11-row[value="invoice"]')!.hasAttribute("data-unread") &&
      root.querySelector('b11-row[value="standup"]')!.hasAttribute("data-flagged") &&
      root.querySelector('b11-row[value="signin"]')!.hasAttribute("hidden"),
  },
  breaks: [
    {
      broke: "Left and Right no longer show the actions behind a message.",
      find: "if (api.swipe.keydown(event, key)) return",
      replace: "",
      caught: "keyboard: Left shows the end actions and focuses the first, Right goes to the next, and Left back to the message hides them",
    },
    {
      broke: "Hidden actions are no longer inert, so Tab and a screen reader reach them.",
      find: "attrs: (state, { api, props }) => api.swipe.actionsAttrs(state, props.row, props.side as SwipeSide),",
      replace: 'attrs: (_state, { props }) => ({ "data-side": props.side }),',
      caught: "keyboard: Left shows the end actions and focuses the first, Right goes to the next, and Left back to the message hides them",
    },
    {
      broke: "An action behind a message no longer gives focus back to the message.",
      find: 'if (behind && act !== "archive") swipe.close({ focus: true })',
      replace: "",
      caught: "keyboard: Space and Enter on an action run it, hide the actions and give focus back to the message",
    },
    {
      broke: "Archive no longer moves focus to the next message.",
      find: "if (done && had && next) roving.focus(next)",
      replace: "",
      caught: "keyboard: Archive hides the message, focus goes to the next one, and Up and Down skip it",
    },
    {
      broke: "An archived message stays in the arrow key order.",
      find: "focusable: ({ key }) => store.get().value.includes(key),",
      replace: "",
      caught: "keyboard: Archive hides the message, focus goes to the next one, and Up and Down skip it",
    },
    {
      broke: "A pointer press no longer starts a swipe.",
      find: "pointerdown: (event, { el, api, key }) => api.swipe.pointerdown(event, key, el!),",
      replace: "pointerdown: () => {},",
      caught: "pointer: a swipe past half the actions opens them, a short swipe springs back, and a press on another message closes them",
    },
    {
      broke: "A long swipe no longer runs the action.",
      find: "onFullSwipe: (row, side",
      replace: "unused: (row, side",
      caught: "pointer: a long swipe right marks the message read, and a long swipe left archives it",
    },
    {
      broke: "The inbox no longer follows the pointer kind, so a touch screen keeps the mouse buttons.",
      find: 'bind: (_el, { api, store }) => api.pointerKind.follow(store, "pointer"),',
      replace: "",
      caught: "pointer kind: the mouse buttons show with a pointer that hovers and hide on a touch screen",
    },
    {
      broke: "An agent can no longer act on a message.",
      find: 'actions: ["markRead", "flag", "archive"]',
      replace: "actions: []",
      caught: "agent: an agent finds the inbox and its messages, marks 1 read, flags 1 and archives 1, and an unknown message is refused",
    },
  ],
}

export { inbox }
export default ui
