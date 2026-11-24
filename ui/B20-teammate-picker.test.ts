import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui, { teammatePicker } from "./B20-teammate-picker"

// 4 names. "an" matches Bao Tran and Hana Sato.
const NAMES = ["Ada Okafor", "Bao Tran", "Carla Mendes", "Hana Sato"]
const markup = `<root aria-label="Teammate picker"><input aria-label="Search teammates" /><list aria-label="Teammates">${NAMES.map((name) => `<person value="${name}">${name}</person>`).join("")}</list><empty>No teammate matches.</empty></root>`
type View = ReturnType<typeof mount<typeof teammatePicker>>

const input = (view: View) => view.root.querySelector("input")!
const person = (view: View, name: string) => view.part("person", name)!
// A name that does not match the search is not on the page. The element stays in the markup, as web components keep it.
const shown = (view: View) => NAMES.filter((name) => person(view, name).isConnected && !person(view, name).hidden)
const emptyShown = (view: View) => view.part("empty")!.isConnected && !view.part("empty")!.hidden
const highlighted = (view: View) => NAMES.filter((name) => person(view, name).hasAttribute("data-highlighted"))

async function open() {
  const view = mount(teammatePicker, {}, markup)
  await view.keys("Tab")
  return view
}

test("keyboard: the picker is 1 tab stop, and focus stays in the search box", async () => {
  const view = await open()
  try {
    expect(document.activeElement).toBe(input(view))
    expect(input(view).getAttribute("role")).toBe("combobox")
    expect(input(view).getAttribute("aria-expanded")).toBe("true")
    expect(input(view).getAttribute("aria-controls")).toBe(view.part("list")!.id)
    expect(view.part("list")!.getAttribute("role")).toBe("listbox")
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(0)
    expect(view.root.querySelectorAll("[tabindex]").length).toBe(0)
    await view.keys("ArrowDown", "ArrowDown", "ArrowUp")
    expect(document.activeElement).toBe(input(view))
  } finally {
    view.unmount()
  }
})

test("keyboard: ArrowDown and ArrowUp move the highlight, and aria-activedescendant follows it", async () => {
  const view = await open()
  try {
    expect(input(view).hasAttribute("aria-activedescendant")).toBe(false)
    await view.keys("ArrowDown")
    expect(highlighted(view)).toEqual(["Ada Okafor"])
    expect(input(view).getAttribute("aria-activedescendant")).toBe(person(view, "Ada Okafor").id)
    await view.keys("ArrowDown", "ArrowDown")
    expect(highlighted(view)).toEqual(["Carla Mendes"])
    expect(input(view).getAttribute("aria-activedescendant")).toBe(person(view, "Carla Mendes").id)
    await view.keys("ArrowUp")
    expect(highlighted(view)).toEqual(["Bao Tran"])
    await view.keys("ArrowUp", "ArrowUp")
    expect(highlighted(view)).toEqual(["Hana Sato"])
  } finally {
    view.unmount()
  }
})

test("keyboard: typing narrows the list to the matches, and ignores case and where the text sits", async () => {
  const view = await open()
  try {
    await view.type("an")
    expect(input(view).value).toBe("an")
    expect(shown(view)).toEqual(["Bao Tran", "Hana Sato"])
    await view.keys("Escape")
    await view.type("OKA")
    expect(shown(view)).toEqual(["Ada Okafor"])
  } finally {
    view.unmount()
  }
})

test("keyboard: typing highlights the first match, so Enter chooses it", async () => {
  const view = await open()
  try {
    await view.type("an")
    expect(highlighted(view)).toEqual(["Bao Tran"])
    await view.keys("Enter")
    expect(view.state.value).toBe("Bao Tran")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
  } finally {
    view.unmount()
  }
})

test("keyboard: Enter chooses the highlighted name, and Enter with no highlight chooses nothing", async () => {
  const view = await open()
  try {
    await view.keys("Enter")
    expect(view.state.value).toBe(null)
    await view.keys("ArrowDown", "ArrowDown", "Enter")
    expect(view.state.value).toBe("Bao Tran")
    expect(person(view, "Bao Tran").getAttribute("aria-selected")).toBe("true")
    expect(person(view, "Bao Tran").hasAttribute("data-selected")).toBe(true)
    expect(person(view, "Ada Okafor").getAttribute("aria-selected")).toBe("false")
    expect(person(view, "Ada Okafor").hasAttribute("data-selected")).toBe(false)
    await view.keys("ArrowDown", "Enter")
    expect(view.state.value).toBe("Carla Mendes")
    expect(person(view, "Bao Tran").getAttribute("aria-selected")).toBe("false")
    expect(document.activeElement).toBe(input(view))
  } finally {
    view.unmount()
  }
})

test("keyboard: Escape clears the search text, and with no text it leaves the key alone", async () => {
  const view = await open()
  try {
    await view.type("an")
    await view.keys("Escape")
    expect(input(view).value).toBe("")
    expect(shown(view)).toEqual(NAMES)
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    input(view).dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: the highlight stays on the visible names, and a name with no match shows the empty message", async () => {
  const view = await open()
  try {
    await view.type("an")
    await view.keys("ArrowDown")
    expect(highlighted(view)).toEqual(["Hana Sato"])
    await view.keys("ArrowDown")
    expect(highlighted(view)).toEqual(["Bao Tran"])
    expect(emptyShown(view)).toBe(false)
    await view.keys("Escape")
    await view.type("zzz")
    expect(shown(view)).toEqual([])
    expect(emptyShown(view)).toBe(true)
    expect(highlighted(view)).toEqual([])
    await view.keys("Enter")
    expect(view.state.value).toBe(null)
    expect(view.announced.at(-1)).toBe("No teammate matches.")
  } finally {
    view.unmount()
  }
})

test("keyboard: a click chooses a name, and a press on a name keeps focus in the search box", async () => {
  const view = await open()
  try {
    // jsdom moves focus on a press whatever the page does, so the test reads whether the page cancels the focus move.
    const press = new MouseEvent("pointerdown", { bubbles: true, cancelable: true })
    person(view, "Carla Mendes").dispatchEvent(press)
    expect(press.defaultPrevented).toBe(true)
    await view.click(person(view, "Carla Mendes"))
    expect(view.state.value).toBe("Carla Mendes")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press" })
    expect(document.activeElement).toBe(input(view))
  } finally {
    view.unmount()
  }
})

test("keyboard: moving the mouse over a name highlights it", async () => {
  const view = await open()
  try {
    await view.hover(person(view, "Hana Sato"))
    expect(highlighted(view)).toEqual(["Hana Sato"])
    expect(input(view).getAttribute("aria-activedescendant")).toBe(person(view, "Hana Sato").id)
  } finally {
    view.unmount()
  }
})

test("agent: search and choose run through the api, and a name that is not on the page is refused", async () => {
  const view = mount(teammatePicker, {}, markup)
  try {
    view.api.search("an")
    await view.settle()
    expect(input(view).value).toBe("an")
    expect(shown(view)).toEqual(["Bao Tran", "Hana Sato"])
    expect(view.announced.at(-1)).toBe("2 teammates match.")
    expect(view.api.choose("Nobody Here")).toBe(false)
    expect(view.state.value).toBe(null)
    expect(view.api.choose("Hana Sato")).toBe(true)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "imperative" })
    view.api.clear()
    await view.settle()
    expect(input(view).value).toBe("")
    expect(shown(view)).toEqual(NAMES)
  } finally {
    view.unmount()
  }
})

test("keyboard: onValueChange can refuse a choice", async () => {
  const view = mount(teammatePicker, { value: "Ada Okafor", onValueChange: (_value, details) => details.cancel() }, markup)
  try {
    expect(person(view, "Ada Okafor").getAttribute("aria-selected")).toBe("true")
    await view.keys("Tab", "ArrowDown", "ArrowDown", "Enter")
    expect(view.state.value).toBe("Ada Okafor")
  } finally {
    view.unmount()
  }
})

test("server: the picker renders with no DOM", () => {
  checkServer(teammatePicker, {}, markup)
})

// The vertical list has no left or right to check, so checkDirection does not apply.
test("direction: the same keys give the same result in left to right and right to left", async () => {
  const results: string[][] = []
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = await open()
    try {
      await view.type("an")
      await view.keys("ArrowDown", "ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Enter")
      results.push([String(view.state.value), highlighted(view).join()])
      expect(input(view).value).toBe("an")
    } finally {
      view.unmount()
    }
  }
  document.documentElement.dir = "ltr"
  expect(results[1]).toEqual(results[0])
  expect(results[0]).toEqual(["Hana Sato", "Hana Sato"])
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const field = () => page.root.querySelector("input")!
const type = async (text: string) => {
  field().value = text
  field().dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
}

test("names: the page names the picker, the search box and the list", async () => {
  page = mountUI(ui)
  await settle()
  expect(page.root.querySelector("b20-picker")!.getAttribute("aria-label")).toBe("Teammate picker")
  expect(field().getAttribute("aria-label")).toBe("Search teammates")
  expect(field().getAttribute("role")).toBe("combobox")
  expect(page.root.querySelector("b20-picker-list")!.getAttribute("role")).toBe("listbox")
  expect(page.root.querySelector("b20-picker-list")!.getAttribute("aria-label")).toBe("Teammates")
  expect(page.root.querySelectorAll("b20-person").length).toBe(8)
  expect(status()).toBe("No teammate is chosen.")
  expect(tabbable(page.root)).toEqual([field()])
})

test("keyboard: on the page, typing, the arrow keys and Enter choose a teammate and the status line reports it", async () => {
  field().focus()
  await type("an")
  await keys("ArrowDown", "Enter")
  expect(status()).toBe("Chosen: Hana Sato.")
  expect(page.root.querySelector("b20-person[data-selected]")!.textContent).toBe("Hana Sato")
  await keys("Escape")
  expect(field().value).toBe("")
  expect(page.root.querySelectorAll("b20-person:not([hidden])").length).toBe(8)
})

test("agent: an agent finds the picker, searches, and chooses a name that is not an invented one", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const picker = page.live().find((entry) => entry.label === "Teammate picker")!
  expect([...picker.actions].sort()).toEqual(["choose", "clear", "search"])
  expect(JSON.stringify(page.agent.snapshot())).toContain("Hana Sato")

  const refused = await page.agent.act({ steps: [{ ref: "Teammate picker", action: "choose", args: ["Nobody Here"] }] })
  expect(refused.steps[0].result).toBe(false)
  expect(status()).toBe("Chosen: Hana Sato.")

  const result = await page.agent.act({
    steps: [
      { ref: "Teammate picker", action: "search", args: ["gr"] },
      { ref: "Teammate picker", action: "choose", args: ["Grace Kim"] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Chosen: Grace Kim.")
  expect(field().value).toBe("gr")
  const items = page.agent.snapshot().find((entry) => entry.label === "Teammate picker")!.items
  expect(JSON.stringify(items)).toBe(JSON.stringify([{ value: "Grace Kim", label: "Grace Kim" }]))
})
