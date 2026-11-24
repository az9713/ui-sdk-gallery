import "@ui-sdk/web/button"
import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"
import type { UI } from "../src/ui"

const html = `
<h2>Inbox</h2>
<ui-button data-archive><button type="button">Archive message</button></ui-button>
<ui-button data-send><button type="button">Send reply</button></ui-button>
<p role="status" data-status>No message is archived.</p>
<ui-toast-region aria-label="Notifications">
  <template>
    <ui-toast>
      <div data-slot="stack">
        <ui-toast-title></ui-toast-title>
        <ui-toast-description></ui-toast-description>
      </div>
      <ui-toast-action><button data-variant="solid"></button></ui-toast-action>
      <ui-toast-close><button></button></ui-toast-close>
    </ui-toast>
  </template>
</ui-toast-region>`

const css = `
[data-stage] { display: grid; gap: 16px; justify-items: start; max-width: 520px; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const toast = createToaster({ duration: Infinity })
  root.querySelector("ui-toast-region")!.toaster = toast
  const status = root.querySelector("[data-status]")!
  root.querySelector("[data-archive]")!.addEventListener("action", () => {
    status.textContent = "Message archived."
    toast("Message archived", {
      description: "Launch plan, from Hollis Grant",
      action: { label: "Undo archive", onAction: () => (status.textContent = "Message restored.") },
    })
  })
  root.querySelector("[data-send]")!.addEventListener("action", () => {
    toast("Reply sent", {
      description: "To Hollis Grant",
      action: { label: "Undo send", onAction: () => (status.textContent = "Reply unsent.") },
    })
  })
  return () => toast.dismiss()
}

const ui: UI = {
  id: "A21",
  request: "Build a notification center where archiving a message shows a toast with an Undo action.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Archive message", action: "press" },
      { ref: "Message archived", action: "press", args: ["Undo archive"] },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Message restored.",
  },
}

export default ui
