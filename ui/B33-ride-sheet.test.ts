import { checkServer, mount } from "@ui-sdk/core/testing"
import { afterAll, beforeAll, expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { tripSheet } from "./B33-ride-sheet"

// jsdom has no visualViewport. This stub plays the phone: shrinking its height while a field has focus is the on-screen keyboard.
const viewport = Object.assign(new EventTarget(), { width: 1024, height: 768, offsetTop: 0, offsetLeft: 0, scale: 1, pageTop: 0, pageLeft: 0 })
const keyboard = async (height: number) => {
  viewport.height = window.innerHeight - height
  viewport.dispatchEvent(new Event("resize"))
  await new Promise((resolve) => setTimeout(resolve, 50))
}
beforeAll(() => {
  Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true })
})
afterAll(() => {
  delete (window as { visualViewport?: unknown }).visualViewport
})

const markup = `<root aria-label="Trip planner"><surface><handle aria-label="Trip details"></handle><input aria-label="Destination" /><info><p>Gray Prius</p></info></surface></root>`
type View = ReturnType<typeof mount<typeof tripSheet>>
const handle = (view: View) => view.root.querySelector<HTMLElement>("[aria-label='Trip details']")!
// In mount(), a part that is not present is detached, so the text of the trip details is gone from the root.
const info = (view: View) => view.root.querySelector("p")?.parentElement
const shown = (el: Element | null | undefined) => !!el && el.isConnected && !el.hasAttribute("hidden")

test("keyboard: Enter and Space on the handle toggle the sheet, and aria-expanded follows", async () => {
  const view = mount(tripSheet, {}, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(handle(view))
    expect(handle(view).getAttribute("aria-expanded")).toBe("false")
    expect(view.root.hasAttribute("data-open")).toBe(false)
    await view.keys("Enter")
    expect(view.state.open).toBe(true)
    expect(view.changes.at(-1)).toMatchObject({ key: "open", reason: "trigger-press", source: "keyboard" })
    expect(handle(view).getAttribute("aria-expanded")).toBe("true")
    expect(view.root.hasAttribute("data-open")).toBe(true)
    expect(handle(view).getAttribute("aria-controls")).toBe(info(view)!.id)
    await view.keys("Space")
    expect(view.state.open).toBe(false)
    expect(handle(view).getAttribute("aria-expanded")).toBe("false")
  } finally {
    view.unmount()
  }
})

test("keyboard: ArrowUp expands and ArrowDown collapses the sheet from the handle", async () => {
  const view = mount(tripSheet, {}, markup)
  try {
    await view.keys("Tab", "ArrowUp")
    expect(view.state.open).toBe(true)
    expect(view.changes.at(-1)).toMatchObject({ key: "open", reason: "trigger-press", source: "keyboard" })
    await view.keys("ArrowUp")
    expect(view.state.open).toBe(true)
    await view.keys("ArrowDown")
    expect(view.state.open).toBe(false)
    await view.keys("ArrowDown")
    expect(view.state.open).toBe(false)
    expect(view.changes.length).toBe(2)
  } finally {
    view.unmount()
  }
})

test("keyboard: focus in the destination field expands the sheet, and focus on the handle does not", async () => {
  const view = mount(tripSheet, {}, markup)
  try {
    await view.keys("Tab")
    expect(view.state.open).toBe(false)
    await view.keys("Tab")
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toBe("Destination")
    expect(view.state.open).toBe(true)
    expect(view.changes.at(-1)).toMatchObject({ key: "open", reason: "focus-in" })
  } finally {
    view.unmount()
  }
})

test("keyboard: a click on the handle toggles the sheet, and the trip details show only while it is open", async () => {
  const view = mount(tripSheet, {}, markup)
  try {
    expect(shown(info(view))).toBe(false)
    await view.click(handle(view))
    expect(view.state.open).toBe(true)
    expect(shown(info(view))).toBe(true)
    await view.click(handle(view))
    expect(view.state.open).toBe(false)
    expect(shown(info(view))).toBe(false)
  } finally {
    view.unmount()
  }
})

test("api: expand and collapse change nothing when the sheet is already in that state", async () => {
  const view = mount(tripSheet, { defaultOpen: true }, markup)
  try {
    expect(view.state.open).toBe(true)
    view.api.expand()
    expect(view.changes.length).toBe(0)
    view.api.collapse()
    expect(view.state.open).toBe(false)
    expect(view.changes.at(-1)).toMatchObject({ key: "open", reason: "imperative" })
    view.api.collapse()
    expect(view.changes.length).toBe(1)
  } finally {
    view.unmount()
  }
})

test("server: the trip sheet renders with no DOM", () => {
  checkServer(tripSheet, {}, markup)
  checkServer(tripSheet, { defaultOpen: true }, markup)
})

// checkDirection needs a key that moves sideways. The handle moves the sheet up and down, so the test is by hand.
test("direction: ArrowUp and ArrowDown do the same in left-to-right and right-to-left text", async () => {
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(tripSheet, {}, markup)
    try {
      await view.keys("Tab", "ArrowUp")
      expect(view.state.open, dir).toBe(true)
      await view.keys("ArrowDown")
      expect(view.state.open, dir).toBe(false)
      await view.keys("ArrowLeft", "ArrowRight")
      expect(view.state.open, dir).toBe(false)
    } finally {
      view.unmount()
    }
  }
  document.documentElement.dir = ""
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const sheet = () => page.root.querySelector<HTMLElement>("b33-trip-sheet")!
const surface = () => page.root.querySelector<HTMLElement>("b33-sheet-surface")!
const field = () => page.root.querySelector<HTMLInputElement>("b33-trip-sheet input")!
const grip = () => page.root.querySelector<HTMLElement>("b33-sheet-handle button")!
const press = (el: Element) => {
  for (const type of ["pointerdown", "pointerup", "click"]) el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true }))
}
const blur = () => (document.activeElement as HTMLElement | null)?.blur()

test("names: the page names the sheet, its handle, the field, the button and the map", async () => {
  page = mountUI(ui)
  await settle()
  expect(sheet().getAttribute("aria-label")).toBe("Trip planner")
  expect(sheet().getAttribute("role")).toBe("group")
  expect(grip().getAttribute("aria-label")).toBe("Trip details")
  expect(grip().getAttribute("aria-expanded")).toBe("false")
  expect(page.root.querySelector("ui-field-label")!.textContent).toBe("Destination")
  expect(page.root.querySelector("[data-request] button")!.textContent).toBe("Request ride")
  const map = page.root.querySelector("[data-map]")!
  expect(map.getAttribute("role")).toBe("img")
  expect(map.getAttribute("aria-label")).toContain("5th Ave and Pine St")
  expect(map.querySelectorAll("path[data-flow]").length).toBe(1)
  expect(status()).toBe("Nearest car is 4 min away.")
})

test("keyboard: Escape and a press on the map collapse the open sheet, and a press in the sheet does not", async () => {
  blur()
  field().focus()
  await settle()
  expect(sheet().hasAttribute("data-open")).toBe(true)
  await keys("Escape")
  expect(sheet().hasAttribute("data-open")).toBe(false)
  grip().focus()
  await keys("Enter")
  expect(sheet().hasAttribute("data-open")).toBe(true)
  press(page.root.querySelector("[data-status]")!)
  await settle()
  expect(sheet().hasAttribute("data-open"), "a press in the sheet keeps it open").toBe(true)
  press(page.root.querySelector("[data-map]")!)
  await settle()
  expect(sheet().hasAttribute("data-open")).toBe(false)
  await keys("Escape")
  expect(sheet().hasAttribute("data-open"), "Escape on a closed sheet does nothing").toBe(false)
})

test("keyboard: a press on the handle of the open sheet closes it with 1 change", async () => {
  const changes: boolean[] = []
  const listen = (event: Event) => changes.push((event as CustomEvent<{ value: boolean }>).detail.value)
  sheet().addEventListener("openchange", listen)
  try {
    grip().click()
    await settle()
    expect(sheet().hasAttribute("data-open")).toBe(true)
    press(grip())
    await settle()
    expect(sheet().hasAttribute("data-open")).toBe(false)
    expect(changes).toEqual([true, false])
  } finally {
    sheet().removeEventListener("openchange", listen)
  }
})

test("keyboard: the sheet rises above the on-screen keyboard while the field has focus", async () => {
  surface().getBoundingClientRect = () => ({ top: 470, bottom: 760, left: 0, right: 380, width: 380, height: 290, x: 0, y: 470, toJSON() {} }) as DOMRect
  blur()
  await settle()
  expect(surface().hasAttribute("data-keyboard")).toBe(false)
  field().focus()
  await settle()
  await keyboard(300)
  try {
    expect(surface().hasAttribute("data-keyboard")).toBe(true)
    expect(surface().style.translate).toMatch(/-\d/)
  } finally {
    await keyboard(0)
  }
  expect(surface().hasAttribute("data-keyboard")).toBe(false)
  blur()
})

test("keyboard: the sheet follows the visual viewport and marks the open keyboard", async () => {
  expect(sheet().style.getPropertyValue("--visual-viewport-height")).toBe("768px")
  expect(sheet().hasAttribute("data-keyboard")).toBe(false)
  field().focus()
  await settle()
  await keyboard(300)
  try {
    expect(sheet().hasAttribute("data-keyboard")).toBe(true)
    expect(sheet().style.getPropertyValue("--visual-viewport-height")).toBe("468px")
    expect(sheet().style.getPropertyValue("--keyboard-inset")).toBe("300px")
  } finally {
    await keyboard(0)
  }
  expect(sheet().hasAttribute("data-keyboard")).toBe(false)
  blur()
})

test("keyboard: Request ride reads the field, and an empty field asks for a destination", async () => {
  const button = page.root.querySelector<HTMLElement>("[data-request] button")!
  button.focus()
  await keys("Enter")
  expect(status()).toBe("Enter a destination first.")
  ;(page.root.querySelector("ui-input") as HTMLElement & { api: { setValue(value: string): void } }).api.setValue("Pier 9")
  button.focus()
  await keys("Enter")
  expect(status()).toBe("Ride requested to Pier 9. Driver arrives in 4 min.")
  ;(page.root.querySelector("ui-input") as HTMLElement & { api: { setValue(value: string): void } }).api.setValue("")
})

test("motion: reduced motion shows the route with no animation", async () => {
  const original = window.matchMedia
  const other = document.body.appendChild(document.createElement("section"))
  try {
    window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query })) as typeof window.matchMedia
    ui.mount(other, { agent: page.agent, ask: async () => true })
    expect(other.querySelector("[data-phone]")!.getAttribute("data-motion")).toBe("reduce")
    expect(other.querySelector("path[data-flow]")).not.toBe(null)
    other.innerHTML = ""
    window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia
    ui.mount(other, { agent: page.agent, ask: async () => true })
    expect(other.querySelector("[data-phone]")!.hasAttribute("data-motion")).toBe(false)
  } finally {
    other.remove()
    if (original) window.matchMedia = original
    else delete (window as { matchMedia?: unknown }).matchMedia
    await settle()
  }
})

test("agent: an agent expands the sheet, enters a destination and requests the ride", async () => {
  blur()
  ;(sheet() as HTMLElement & { api: { collapse(): boolean } }).api.collapse()
  await settle()
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const entry = page.live().find((e) => e.label === "Trip planner")!
  // The handle is a button inside the sheet, so the bridge adds press to the sheet's own actions.
  expect(entry.actions).toEqual(expect.arrayContaining(["expand", "collapse"]))
  expect(entry.open).toBe(false)
  expect(ui.task!.done(page.root)).toBe(false)

  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Ride requested to Ferry Terminal. Driver arrives in 4 min.")
  expect(ui.task!.done(page.root)).toBe(true)

  const back = await page.agent.act({ steps: [{ ref: "Trip planner", action: "collapse" }] })
  expect(back.ok, back.error?.message).toBe(true)
  expect(sheet().hasAttribute("data-open")).toBe(false)
})
