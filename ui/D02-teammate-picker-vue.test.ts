import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import { TEAM } from "./D01-teammate-picker-react"
import ui, { renderTeammatePicker } from "./D02-teammate-picker-vue"

// The primitive itself is tested in B20-teammate-picker.test.ts. This file tests what the Vue adapter renders from it.
let page: ReturnType<typeof mountUI>
const LABEL = "Teammate picker in Vue"
const status = () => page.root.querySelector("[data-status]")!.textContent
const field = (within: ParentNode = page.root) => within.querySelector("input")!
const person = (name: string, within: ParentNode = page.root) =>
  [...within.querySelectorAll<HTMLElement>(".d02-person")].find((el) => el.textContent === name)
// Vue leaves an absent part out of the DOM. The hidden check covers an adapter that keeps it with `hidden`.
const shown = (within: ParentNode = page.root) =>
  [...within.querySelectorAll<HTMLElement>(".d02-person")].filter((el) => !el.hidden).map((el) => el.textContent)
const highlighted = () => [...page.root.querySelectorAll(".d02-person[data-highlighted]")].map((el) => el.textContent)
const emptyShown = (within: ParentNode = page.root) => {
  const empty = within.querySelector<HTMLElement>(".d02-empty")
  return !!empty && !empty.hidden
}

// Vue reads the value of the input in its input listener, so a plain set and an input event act as typing.
const type = async (text: string, input = field()) => {
  input.value = text
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
}

test("names: the Vue page names the picker, the search box and the list, and shows no empty text", async () => {
  page = mountUI(ui)
  await settle()
  const root = page.root.querySelector(".d02-picker")!
  expect(root.getAttribute("role")).toBe("group")
  expect(root.getAttribute("aria-label")).toBe(LABEL)
  expect(field().getAttribute("aria-label")).toBe("Search teammates")
  expect(field().getAttribute("role")).toBe("combobox")
  expect(field().getAttribute("aria-expanded")).toBe("true")
  const list = page.root.querySelector(".d02-list")!
  expect(list.getAttribute("role")).toBe("listbox")
  expect(list.getAttribute("aria-label")).toBe("Teammates")
  expect(field().getAttribute("aria-controls")).toBe(list.id)
  expect(shown()).toEqual(TEAM)
  expect(emptyShown()).toBe(false)
  expect(status()).toBe("No teammate is chosen.")
})

test("keyboard: the Vue picker is 1 tab stop, and the arrows keep focus in the search box", async () => {
  expect(tabbable(page.root)).toEqual([field()])
  field().focus()
  await keys("ArrowDown", "ArrowDown", "ArrowUp")
  expect(document.activeElement).toBe(field())
  await keys("Escape")
})

test("keyboard: ArrowDown and ArrowUp move the highlight, and aria-activedescendant names an element on the page", async () => {
  field().focus()
  await type("")
  await keys("ArrowUp")
  expect(highlighted()).toEqual(["Hana Sato"])
  await keys("ArrowDown")
  expect(highlighted()).toEqual(["Ada Okafor"])
  await keys("ArrowDown", "ArrowDown")
  expect(highlighted()).toEqual(["Carla Mendes"])
  const active = field().getAttribute("aria-activedescendant")!
  expect(active).toBe(person("Carla Mendes")!.id)
  expect(document.getElementById(active)).toBe(person("Carla Mendes"))
  await keys("ArrowUp")
  expect(highlighted()).toEqual(["Bao Tran"])
})

test("keyboard: typing narrows the list and highlights the first match, and Enter chooses it", async () => {
  field().focus()
  await type("an")
  expect(shown()).toEqual(["Bao Tran", "Hana Sato"])
  // Vue removes a part that is not present. The web adapter keeps it with `hidden`.
  expect(page.root.querySelectorAll(".d02-person").length).toBe(2)
  expect(highlighted()).toEqual(["Bao Tran"])
  await keys("ArrowDown", "Enter")
  expect(status()).toBe("Chosen: Hana Sato.")
  expect(person("Hana Sato")!.getAttribute("aria-selected")).toBe("true")
  expect(person("Hana Sato")!.hasAttribute("data-selected")).toBe(true)
  expect(person("Bao Tran")!.getAttribute("aria-selected")).toBe("false")
  expect(person("Bao Tran")!.hasAttribute("data-selected")).toBe(false)
  expect(document.activeElement).toBe(field())
})

test("keyboard: Escape clears the search text, and with no text it leaves the key alone", async () => {
  field().focus()
  await type("an")
  await keys("Escape")
  expect(field().value).toBe("")
  expect(shown()).toEqual(TEAM)
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
  field().dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
})

test("keyboard: a search with no match shows the empty text, and Enter then chooses nothing", async () => {
  field().focus()
  await type("zzz")
  expect(shown()).toEqual([])
  expect(emptyShown()).toBe(true)
  expect(highlighted()).toEqual([])
  await keys("Enter")
  expect(status()).toBe("Chosen: Hana Sato.")
  await keys("Escape")
  expect(emptyShown()).toBe(false)
})

test("keyboard: a click chooses a name, and a press on a name keeps focus in the search box", async () => {
  field().focus()
  // jsdom moves focus on a press whatever the page does, so the test reads whether the page cancels the focus move.
  const press = new MouseEvent("pointerdown", { bubbles: true, cancelable: true })
  person("Carla Mendes")!.dispatchEvent(press)
  expect(press.defaultPrevented).toBe(true)
  person("Carla Mendes")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }))
  await settle()
  expect(status()).toBe("Chosen: Carla Mendes.")
  expect(person("Carla Mendes")!.getAttribute("aria-selected")).toBe("true")
  expect(document.activeElement).toBe(field())
})

test("agent: the web bridge sees the Vue picker, refuses an invented name, and runs search and choose", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const picker = page.live().find((entry) => entry.label === LABEL)!
  expect(picker, JSON.stringify(page.agent.snapshot())).toBeTruthy()
  expect([...picker.actions].sort()).toEqual(["choose", "clear", "search"])

  const refused = await page.agent.act({ steps: [{ ref: LABEL, action: "choose", args: ["Nobody Here"] }] })
  expect(refused.steps[0].result).toBe(false)
  await settle()
  expect(status()).toBe("Chosen: Carla Mendes.")

  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  await settle()
  expect(status()).toBe("Chosen: Hana Sato.")
  expect(ui.task!.done(page.root)).toBe(true)
  // The slot's bind writes the agent's search into the field, and the list follows it.
  expect(field().value).toBe("an")
  expect(shown()).toEqual(["Bao Tran", "Hana Sato"])

  await page.agent.act({ steps: [{ ref: LABEL, action: "clear" }] })
  await settle()
  expect(field().value).toBe("")
  expect(shown()).toEqual(TEAM)
})

// Row D05 puts several renderings on 1 page. The 2 here share a label, so the test drives them by DOM and keys, not by the bridge.
test("keyboard: 2 renderings on 1 page share no id, keep their own state, and unmount clean", async () => {
  const a = document.body.appendChild(document.createElement("div"))
  const b = document.body.appendChild(document.createElement("div"))
  const removeA = renderTeammatePicker(a)
  const removeB = renderTeammatePicker(b)
  await settle()
  const ids = [...document.querySelectorAll("[id]")].map((el) => el.id)
  expect(ids.length).toBeGreaterThan(0)
  expect(new Set(ids).size).toBe(ids.length)
  const byId = (box: HTMLElement, id: string | null) => [...box.querySelectorAll("[id]")].find((el) => el.id === id)
  for (const box of [a, b]) {
    expect(emptyShown(box)).toBe(false)
    expect(byId(box, field(box).getAttribute("aria-controls"))).toBe(box.querySelector(".d02-list"))
    field(box).focus()
    await keys("ArrowDown")
    expect(byId(box, field(box).getAttribute("aria-activedescendant"))).toBe(person("Ada Okafor", box))
  }
  await type("oka", field(a))
  expect(shown(a)).toEqual(["Ada Okafor"])
  expect(shown(b)).toEqual(TEAM)
  removeA()
  removeB()
  await settle()
  expect(a.childElementCount).toBe(0)
  expect(b.childElementCount).toBe(0)
  a.remove()
  b.remove()
})
