import "@ui-sdk/web/listbox"
import type { UI } from "../src/ui"

type Mail = { id: string; from: string; subject: string; body: string }

const folders = [
  { value: "inbox", label: "Inbox" },
  { value: "starred", label: "Starred" },
  { value: "archive", label: "Archive" },
]

const mails: Record<string, Mail[]> = {
  inbox: [
    { id: "m1", from: "Mara Ellis", subject: "Launch checklist", body: "The launch is Thursday. Please confirm the 4 open items on the checklist before noon." },
    { id: "m2", from: "Theo Park", subject: "Invoice 2291", body: "Invoice 2291 for 1,240 USD is due on 30 November. Reply if the amount is wrong." },
    { id: "m3", from: "Ines Duarte", subject: "Lunch on Friday?", body: "Are you free for lunch on Friday at 12:30? The new noodle place has a table for 4." },
  ],
  starred: [
    { id: "m4", from: "Sam Okoye", subject: "Contract draft v3", body: "The third draft of the contract is attached. Section 4 now holds the new payment terms." },
    { id: "m5", from: "Mara Ellis", subject: "Board slides", body: "The board slides need your numbers for Q3 by Wednesday evening." },
  ],
  archive: [
    { id: "m6", from: "Ravi Menon", subject: "Trip receipts", body: "All 7 receipts from the Lisbon trip are in the shared folder." },
    { id: "m7", from: "Ines Duarte", subject: "Welcome aboard", body: "Welcome to the team. Your laptop will arrive on Monday." },
  ],
}

const html = `
<div data-mail>
  <ui-listbox data-folders aria-label="Mail folders" default-value="inbox">
    ${folders.map((f) => `<ui-listbox-item value="${f.value}">${f.label}</ui-listbox-item>`).join("")}
  </ui-listbox>
  <ui-listbox data-messages aria-label="Messages"></ui-listbox>
  <article data-reader aria-live="polite">
    <h2 data-subject>No message open</h2>
    <p data-from></p>
    <p data-body>Choose a message in the list.</p>
  </article>
</div>
<p role="status" data-status>No message is open.</p>`

const css = `
[data-stage] { display: grid; gap: 16px; max-width: 760px; }
[data-stage] [data-mail] { display: grid; grid-template-columns: 140px 240px 1fr; height: 300px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); overflow: hidden; }
[data-stage] [data-mail] > * { min-width: 0; overflow-y: auto; }
[data-stage] [data-mail] > ui-listbox { display: block; padding: 8px; border-inline-end: 1px solid var(--ui-border); }
[data-stage] ui-listbox-item { display: block; padding: 8px; border-radius: var(--ui-radius); cursor: pointer; }
[data-stage] ui-listbox-item[data-selected] { background: var(--ui-primary); color: var(--ui-primary-foreground); }
[data-stage] ui-listbox-item small { display: block; }
[data-stage] ui-listbox-item:not([data-selected]) small { color: var(--ui-muted-foreground); }
[data-stage] [data-reader] { padding: calc(var(--ui-spacing) * 4); display: grid; align-content: start; gap: 8px; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; overflow-wrap: anywhere; }
[data-stage] [data-from], [data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

const row = (m: Mail) =>
  `<ui-listbox-item value="${m.id}">${m.subject} <small>${m.from}</small></ui-listbox-item>`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const foldersEl = root.querySelector("[data-folders]")!
  const list = root.querySelector("[data-messages]")!
  const status = root.querySelector("[data-status]")!
  const all = Object.values(mails).flat()
  const show = (folder: string) => {
    list.innerHTML = mails[folder].map(row).join("")
  }
  show("inbox")
  foldersEl.addEventListener("valuechange", (e) => {
    const folder = (e as CustomEvent).detail.value as string | null
    if (!folder) return
    show(folder)
    root.querySelector("[data-subject]")!.textContent = "No message open"
    root.querySelector("[data-from]")!.textContent = ""
    root.querySelector("[data-body]")!.textContent = "Choose a message in the list."
    status.textContent = `Folder: ${folder}`
  })
  list.addEventListener("valuechange", (e) => {
    const mail = all.find((m) => m.id === (e as CustomEvent).detail.value)
    if (!mail) return
    root.querySelector("[data-subject]")!.textContent = mail.subject
    root.querySelector("[data-from]")!.textContent = `From ${mail.from}`
    root.querySelector("[data-body]")!.textContent = mail.body
    status.textContent = `Opened: ${mail.subject}`
  })
}

const ui: UI = {
  id: "A13",
  request: "Build a mail client with 3 panes: folders, a message list for the chosen folder, and a reading pane that shows the open message.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Mail folders", action: "setValue", args: ["archive"] },
      { ref: "Messages", action: "setValue", args: ["m6"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Opened: Trip receipts",
  },
}

export default ui
