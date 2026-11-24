import { settle } from "@ui-sdk/core/testing"
import { createAgent } from "@ui-sdk/web/agent"
import type { UI } from "./ui"

// One bridge for each test file: a bridge has no destroy and keeps removed components as offPage.
function mountUI(ui: UI) {
  const person = { approves: false, asked: [] as string[] }
  const ask = async (question: string) => (person.asked.push(question), person.approves)
  const agent = createAgent({
    allow: (step) => (ui.allow ? ui.allow(step, ask) : step.confirm ? ask(step.confirm) : true),
  })
  const root = document.body.appendChild(document.createElement("section"))
  ui.mount(root, { agent, ask })
  const live = () => agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more")
  return { root, agent, person, live }
}

const tabbable = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")].filter(
    (el) => el.tabIndex >= 0 && !el.hasAttribute("disabled") && !el.closest("[hidden], [inert]"),
  )

// Presses keys on the focused element, like "Tab", "Shift+Tab", "Space" or "ArrowRight".
// jsdom does not move focus on Tab or click a button on Space and Enter, so this does.
async function keys(...names: string[]) {
  for (const name of names) {
    const parts = name.split("+")
    const key = parts.pop()!
    const init = {
      key: key === "Space" ? " " : key,
      shiftKey: parts.includes("Shift"),
      ctrlKey: parts.includes("Control"),
      bubbles: true,
      cancelable: true,
    }
    const target = (document.activeElement as HTMLElement | null) ?? document.body
    const went = target.dispatchEvent(new KeyboardEvent("keydown", init))
    if (went && key === "Tab") {
      const stops = tabbable(document)
      const next = stops[stops.indexOf(target) + (init.shiftKey ? -1 : 1)] ?? (init.shiftKey ? stops.at(-1) : stops[0])
      next?.focus()
    } else if (went && (key === "Space" || key === "Enter") && target.matches("button, [role=button], a[href]")) {
      target.click()
    }
    target.dispatchEvent(new KeyboardEvent("keyup", init))
    await settle()
  }
}

export { keys, mountUI, settle, tabbable }
