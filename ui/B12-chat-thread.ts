import {
  type ChangeDetails,
  createChange,
  createInputHistory,
  createStickToBottom,
  definePrimitive,
  isComposing,
} from "@ui-sdk/core"
import { createParts, wrappedButton, wrappedChild } from "@ui-sdk/web"
import type { UI } from "../src/ui"

type DraftReason = "input-change" | "history-key" | "send"
type Options = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, details: ChangeDetails<DraftReason>) => void
  defaultSent?: string[]
  onSentChange?: (value: string[], details: ChangeDetails<"send">) => void
}
type State = { value: string; sent: string[]; following: boolean }

const chatThread = definePrimitive({
  name: "chat-thread",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    defaultSent: "list",
    onSentChange: "callback",
  },
  // The snapshot shows the draft only. The sent messages are on the page.
  controlled: ["value"],
  state: (options: Options): State => ({
    value: options.value ?? options.defaultValue ?? "",
    sent: options.defaultSent ?? [],
    following: true,
  }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    const stick = createStickToBottom({
      onChange: ({ following }) => context.store.set({ following }),
    })
    const history = createInputHistory({
      entries: () => context.store.get().sent,
      read: () => context.store.get().value,
      write: (value, event) => change("value", value, { reason: "history-key", event }),
    })
    const send = (text?: string, event?: Event) => {
      const message = (text ?? context.store.get().value).trim()
      if (!message) return false
      if (!change("sent", [...context.store.get().sent, message], { reason: "send", event })) return false
      change("value", "", { reason: "send", event })
      stick.scrollToBottom()
      return true
    }
    return {
      stick,
      history,
      send,
      setValue: (value: string, event?: Event) => change("value", value, { reason: "input-change", event }),
      latest: () => stick.scrollToBottom({ behavior: "smooth" }),
    }
  },
  slots: (slot) => ({
    root: slot({ role: "group" }),
    scroller: slot({
      role: "region",
      attrs: () => ({ tabindex: "0" }),
      bind: (el, { api }) => api.stick.connect(el),
    }),
    log: slot({ role: "log" }),
    jump: slot({
      present: (state) => !state.following,
      attrs: () => ({ type: "button" }),
      press: ({ api }) => api.latest(),
    }),
    composer: slot({
      focus: "native",
      // A string type makes mount render an <input>. A web part already holds one.
      attrs: () => ({ type: "text", autocomplete: "off", enterkeyhint: "send" }),
      on: {
        input: (event, { api }) => void api.setValue((event.target as HTMLInputElement).value, event),
        keydown: (event, { api }) => {
          if (api.history.keydown(event)) return
          if (event.key === "Enter" && !event.shiftKey && !isComposing(event)) {
            event.preventDefault()
            api.send(undefined, event)
          }
        },
      },
      // An agent's setValue and a recalled message change the state, so the field follows it.
      bind: (el, { store }) => {
        const input = el as HTMLInputElement
        const show = () => {
          if (input.value !== store.get().value) input.value = store.get().value
        }
        show()
        return store.subscribe(show)
      },
    }),
    send: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }, event) => void api.send(undefined, event),
    }),
  }),
  agent: { actions: ["setValue", "send"] },
})

createParts(chatThread, {
  root: { tag: "b12-thread", display: "block" },
  scroller: { tag: "b12-scroller", display: "block" },
  log: { tag: "b12-log", display: "block" },
  jump: { tag: "b12-jump", target: wrappedButton, display: "contents" },
  composer: { tag: "b12-composer", target: wrappedChild("input"), display: "block" },
  send: { tag: "b12-send", target: wrappedButton, display: "contents" },
})

type Message = { from: "Mara" | "You"; text: string; at: string }
const THREAD: Message[] = [
  { from: "Mara", text: "Morning! Are you still on for the venue walk-through today?", at: "08:58" },
  { from: "You", text: "Yes. I will leave the office at 9:40", at: "09:02" },
  { from: "Mara", text: "Great. The caterer wants a head count by noon.", at: "09:05" },
  { from: "You", text: "We are at 46 people with the late sign-ups", at: "09:07" },
  { from: "Mara", text: "Do we need the second room for the workshop?", at: "09:12" },
  { from: "You", text: "Only for the afternoon session", at: "09:14" },
  { from: "Mara", text: "Noted. I will ask them to hold it from 13:00.", at: "09:15" },
  { from: "Mara", text: "Also, the projector in room B is broken. They offer a big screen instead.", at: "09:21" },
  { from: "You", text: "The screen is fine. Please confirm the hold for room B", at: "09:24" },
  { from: "Mara", text: "Done. See you at the front desk at 10.", at: "09:30" },
]
const EARLIER = THREAD.filter((m) => m.from === "You").map((m) => m.text)

const bubble = (m: Message) =>
  `<article data-from="${m.from === "You" ? "you" : "mara"}"><p><b>${m.from}</b> <time>${m.at}</time></p><p>${m.text}</p></article>`

const html = `
<h2>Chat with Mara Lund</h2>
<b12-thread aria-label="Chat with Mara" default-sent="${EARLIER}">
  <b12-scroller aria-label="Messages">
    <b12-log>${THREAD.map(bubble).join("")}</b12-log>
  </b12-scroller>
  <b12-jump><button>Jump to latest</button></b12-jump>
  <div data-compose>
    <b12-composer><input aria-label="Message" placeholder="Write a message" /></b12-composer>
    <b12-send><button>Send</button></b12-send>
  </div>
</b12-thread>
<p data-hint>Enter sends. ArrowUp in the field brings back your earlier messages, and ArrowDown goes back to your draft.</p>
<p role="status" data-status>No message is sent yet.</p>`

const css = `
[data-stage] { display: grid; gap: 12px; max-width: 32rem; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] b12-thread { display: grid; gap: 8px; }
[data-stage] b12-scroller {
  height: 18rem; overflow-y: auto; padding: 12px;
  border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-background);
}
[data-stage] b12-scroller:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] b12-log { display: grid; gap: 8px; }
[data-stage] article {
  max-width: 80%; padding: 8px 12px; border-radius: var(--ui-radius);
  background: var(--ui-muted); color: var(--ui-foreground); justify-self: start;
}
[data-stage] article[data-from="you"] { justify-self: end; background: var(--ui-primary); color: var(--ui-primary-foreground); }
[data-stage] article p { max-width: 60ch; overflow-wrap: anywhere; }
[data-stage] article p:first-child { font-size: 0.8125rem; }
[data-stage] article time { font-weight: 400; }
[data-stage] b12-send button, [data-stage] b12-jump button {
  height: calc(var(--ui-spacing) * 9); padding: 0 16px; border: 1px solid var(--ui-primary);
  border-radius: var(--ui-radius); background: var(--ui-primary); color: var(--ui-primary-foreground);
  font: inherit; font-weight: 600; cursor: pointer;
}
[data-stage] b12-jump button {
  justify-self: center; border-color: var(--ui-input); background: var(--ui-background); color: var(--ui-foreground);
}
[data-stage] b12-send button:focus-visible, [data-stage] b12-jump button:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] [data-compose] { display: flex; gap: 8px; }
[data-stage] b12-composer { flex: 1; }
[data-stage] b12-composer input {
  box-sizing: border-box; width: 100%; height: calc(var(--ui-spacing) * 9); padding: 0 12px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); font: inherit;
}
[data-stage] b12-composer input::placeholder { color: var(--ui-muted-foreground); opacity: 1; }
[data-stage] b12-composer input:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] [data-hint], [data-stage] [data-status] { color: var(--ui-muted-foreground); font-size: 0.875rem; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const log = root.querySelector("b12-log")!
  root.querySelector("b12-thread")!.addEventListener("sentchange", (event) => {
    const text = (event as CustomEvent<{ value: string[] }>).detail.value.at(-1)!
    const now = new Date()
    const at = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    // The text is set as text, so a sent message cannot add markup.
    log.insertAdjacentHTML("beforeend", bubble({ from: "You", text: "", at }))
    log.lastElementChild!.querySelector("p:last-child")!.textContent = text
    status.textContent = `Sent: ${text}`
  })
}

const ui: UI = {
  id: "B12",
  request:
    "Build a chat thread whose message list stays at the bottom as messages arrive, with a field where Enter sends and ArrowUp brings back my earlier messages.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Chat with Mara", action: "setValue", args: ["Leaving now. See you at 10"] },
      { ref: "Chat with Mara", action: "send" },
    ],
    done: (root) => {
      const scroller = root.querySelector("b12-scroller")!
      const atEnd = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 2
      return root.querySelector("[data-status]")!.textContent === "Sent: Leaving now. See you at 10" && atEnd
    },
  },
  breaks: [
    {
      broke: "ArrowUp no longer brings back an earlier message.",
      find: "if (api.history.keydown(event)) return",
      replace: "",
      caught: "keyboard: ArrowUp brings back earlier messages, newest first, and ArrowDown returns to the draft",
    },
    {
      broke: "Enter no longer sends the draft.",
      find: 'if (event.key === "Enter" && !event.shiftKey && !isComposing(event)) {',
      replace: "if (false) {",
      caught: "keyboard: Enter sends the draft, clears the field, and the sent message is the first that ArrowUp brings back",
    },
    {
      broke: "An empty draft is sent.",
      find: "if (!message) return false",
      replace: "",
      caught: "keyboard: Enter on an empty or blank field sends nothing",
    },
    {
      broke: "The jump button does not show when the reader leaves the bottom.",
      find: "present: (state) => !state.following,",
      replace: "",
      caught: "keyboard: the jump button shows only after the reader leaves the bottom, and it goes back to the end",
    },
    {
      broke: "The field does not follow a value that comes from the state.",
      find: "if (input.value !== store.get().value) input.value = store.get().value",
      replace: "",
      caught: "keyboard: ArrowUp brings back earlier messages, newest first, and ArrowDown returns to the draft",
    },
    {
      broke: "The list no longer follows new content.",
      find: "bind: (el, { api }) => api.stick.connect(el),",
      replace: "",
      caught: "keyboard: the log follows new content while the reader is at the bottom",
    },
    {
      broke: "Sending while scrolled up leaves the list where it is.",
      find: "stick.scrollToBottom()",
      replace: "void 0",
      caught: "keyboard: sending while scrolled up goes back to the end",
    },
  ],
}

export { chatThread }
export default ui
