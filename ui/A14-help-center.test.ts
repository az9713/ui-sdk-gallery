import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./A14-help-center"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const trigger = (text: string) => [...root.querySelectorAll<HTMLElement>("ui-accordion-trigger button, ui-collapsible-trigger button")].find((b) => b.textContent === text)!
const item = (value: string) => root.querySelector(`ui-accordion-item[value=${value}]`)!
const input = () => root.querySelector("ui-autocomplete input") as HTMLInputElement
const autocomplete = () => root.querySelector("ui-autocomplete") as HTMLElement & { api: { setValue(v: string): boolean; setOpen(v: boolean): boolean } }

test("names: each control has the name that the page shows", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const labels = live().map((entry) => entry.label)
  for (const label of ["Help topic", "Search", "Help questions", "Still need help? Contact details"]) expect(labels).toContain(label)
})

test("keyboard: Enter opens an answer, Enter closes it, and several answers stay open", async () => {
  trigger("What is your return policy?").focus()
  await keys("Enter")
  expect(item("returns").hasAttribute("data-open")).toBe(true)
  expect(trigger("What is your return policy?").getAttribute("aria-expanded")).toBe("true")
  trigger("How can I reach support?").focus()
  await keys("Space")
  expect(item("returns").hasAttribute("data-open")).toBe(true)
  expect(item("support").hasAttribute("data-open")).toBe(true)
  expect(status()).toBe("Open: returns, support.")
  trigger("What is your return policy?").focus()
  await keys("Enter")
  expect(item("returns").hasAttribute("data-open")).toBe(false)
  expect(item("returns").hasAttribute("data-closed")).toBe(true)
  trigger("How can I reach support?").focus()
  await keys("Enter")
  expect(status()).toBe("All answers are closed.")
})

test("keyboard: each question is 1 tab stop, and the arrow keys do not move focus", async () => {
  const triggers = [...root.querySelectorAll<HTMLElement>("ui-accordion-trigger button")]
  expect(triggers).toHaveLength(4)
  for (const t of triggers) expect(t.tabIndex).toBe(0)
  triggers[0].focus()
  await keys("ArrowDown")
  expect(document.activeElement).toBe(triggers[0])
})

test("keyboard: Enter and Space open and close the contact section", async () => {
  const button = trigger("Still need help? Contact details")
  const panel = root.querySelector("ui-collapsible-panel")!
  expect(button.getAttribute("aria-expanded")).toBe("false")
  expect(panel.hasAttribute("hidden")).toBe(true)
  button.focus()
  await keys("Enter")
  expect(button.getAttribute("aria-expanded")).toBe("true")
  expect(panel.hasAttribute("hidden")).toBe(false)
  expect(status()).toBe("Contact details are shown.")
  await keys("Space")
  expect(button.getAttribute("aria-expanded")).toBe("false")
  expect(status()).toBe("Contact details are hidden.")
})

test("keyboard: typing filters the suggestions, Down and Enter fill in the text, and Escape keeps it", async () => {
  input().focus()
  autocomplete().api.setValue("re")
  await settle()
  const options = [...root.querySelectorAll<HTMLElement>("ui-autocomplete-item")].filter((o) => !o.hidden)
  expect(options.map((o) => o.textContent)).toEqual(["Returns"])
  await keys("ArrowDown")
  expect(input().getAttribute("aria-expanded")).toBe("true")
  await keys("ArrowDown", "Enter")
  expect(input().value).toBe("Returns")
  expect(input().getAttribute("aria-expanded")).toBe("false")
  input().value = ""
  autocomplete().api.setValue("zzz")
  autocomplete().api.setOpen(true)
  await settle()
  expect(root.querySelector("ui-autocomplete-empty")!.textContent).toBe("No topics found.")
  await keys("Escape")
  expect(input().value).toBe("zzz")
  autocomplete().api.setValue("")
})

test("keyboard: Enter in the field searches for the typed text and opens its answer", async () => {
  autocomplete().api.setValue("Billing")
  await settle()
  input().focus()
  await keys("Escape", "Enter")
  expect(status()).toBe("Searched: Billing. Opened: How do I change my billing address?")
  expect(item("billing").hasAttribute("data-open")).toBe(true)
  autocomplete().api.setValue("Warranty")
  await settle()
  await keys("Enter")
  expect(status()).toBe("Searched: Warranty. No answer found.")
  autocomplete().api.setValue("")
})

test("agent: an agent searches, opens an answer and shows the contact details", async () => {
  const result = await agent.act({
    steps: [
      { ref: "Help topic", action: "setValue", args: ["Shipping"] },
      { ref: "Search", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Searched: Shipping. Opened: What are your shipping options?")
  const more = await agent.act({
    steps: [
      { ref: "Help questions", action: "open", args: ["support"] },
      { ref: "Still need help? Contact details", action: "press" },
    ],
  })
  expect(more.ok, more.error?.message).toBe(true)
  expect(item("shipping").hasAttribute("data-open")).toBe(true)
  expect(item("support").hasAttribute("data-open")).toBe(true)
  expect(status()).toBe("Contact details are shown.")
})
