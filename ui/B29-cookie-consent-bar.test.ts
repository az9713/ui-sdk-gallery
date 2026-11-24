import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { afterAll, beforeAll, expect, test, vi } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { consentBar, startScene } from "./B29-cookie-consent-bar"

// jsdom has no canvas: the page tests run with no scene, and one test gives the scene a fake context.
const getContext = HTMLCanvasElement.prototype.getContext
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof getContext
  expect(document.cookie, "module level must not write a cookie").toBe("")
})
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = getContext
})

const markup = `<root aria-label="Cookie consent"><ask><choice value="all">Accept all</choice><choice value="essential">Essential only</choice></ask><reopen>Cookie settings</reopen></root>`
type View = ReturnType<typeof mount<typeof consentBar>>
const choice = (view: View, name: string) =>
  [...view.root.querySelectorAll<HTMLElement>("[data-slot=consent-bar-choice]")].find((el) => el.textContent === name)!
const reopen = (view: View) => view.root.querySelector<HTMLElement>("[data-slot=consent-bar-reopen]")!
const shown = (el: Element | null | undefined) => !!el && el.isConnected && !el.hasAttribute("hidden")

test("keyboard: arrow keys, Home and End move focus between the choices", async () => {
  const view = mount(consentBar, {}, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(choice(view, "Accept all"))
    await view.keys("ArrowRight")
    expect(document.activeElement).toBe(choice(view, "Essential only"))
    await view.keys("ArrowLeft")
    expect(document.activeElement).toBe(choice(view, "Accept all"))
    await view.keys("End")
    expect(document.activeElement).toBe(choice(view, "Essential only"))
    await view.keys("Home")
    expect(document.activeElement).toBe(choice(view, "Accept all"))
    expect(view.state.value).toBe("")
  } finally {
    view.unmount()
  }
})

test("keyboard: the choices are 1 tab stop", async () => {
  const view = mount(consentBar, {}, markup)
  try {
    expect(view.root.querySelectorAll('[data-slot=consent-bar-choice][tabindex="0"]').length).toBe(1)
    expect(choice(view, "Accept all").getAttribute("tabindex")).toBe("0")
    expect(choice(view, "Essential only").getAttribute("tabindex")).toBe("-1")
    await view.keys("Tab", "ArrowRight")
    expect(choice(view, "Essential only").getAttribute("tabindex")).toBe("0")
    expect(view.root.querySelectorAll('[data-slot=consent-bar-choice][tabindex="0"]').length).toBe(1)
  } finally {
    view.unmount()
  }
})

test("keyboard: Space and Enter choose, and the question gives way to the settings button", async () => {
  const view = mount(consentBar, {}, markup)
  try {
    expect(view.root.getAttribute("role")).toBe("group")
    expect(view.root.getAttribute("aria-label")).toBe("Cookie consent")
    expect(view.root.hasAttribute("data-decided")).toBe(false)
    expect(shown(reopen(view))).toBe(false)
    await view.keys("Tab", "ArrowRight", "Space")
    expect(view.state.value).toBe("essential")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
    expect(view.root.getAttribute("data-value")).toBe("essential")
    expect(view.root.hasAttribute("data-decided")).toBe(true)
    expect(shown(choice(view, "Accept all"))).toBe(false)
    expect(shown(reopen(view))).toBe(true)
    await view.keys("Tab", "Enter")
    expect(view.state.value).toBe("")
    expect(shown(choice(view, "Accept all"))).toBe(true)
    expect(shown(reopen(view))).toBe(false)
    expect(view.root.hasAttribute("data-decided")).toBe(false)
    await view.keys("Tab", "Home", "Enter")
    expect(view.state.value).toBe("all")
  } finally {
    view.unmount()
  }
})

test("keyboard: a click on a choice chooses it", async () => {
  const view = mount(consentBar, {}, markup)
  try {
    await view.click(choice(view, "Accept all"))
    expect(view.state.value).toBe("all")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press" })
  } finally {
    view.unmount()
  }
})

test("api: choose refuses a value that is no choice", async () => {
  const view = mount(consentBar, {}, markup)
  try {
    expect(view.api.choose("marketing")).toBe(false)
    expect(view.state.value).toBe("")
    expect(view.api.choose("essential")).toBe(true)
    expect(view.api.reset()).toBe(true)
    expect(view.state.value).toBe("")
  } finally {
    view.unmount()
  }
})

test("keyboard: a default value starts the bar decided", async () => {
  const view = mount(consentBar, { defaultValue: "all" }, markup)
  try {
    expect(view.root.getAttribute("data-value")).toBe("all")
    expect(shown(choice(view, "Accept all"))).toBe(false)
    expect(shown(reopen(view))).toBe(true)
  } finally {
    view.unmount()
  }
})

test("server: the consent bar renders with no DOM", () => {
  checkServer(consentBar, {}, markup)
  checkServer(consentBar, { defaultValue: "essential" }, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(consentBar, {}, markup)
})

test("scene: reduced motion draws 1 frame and a full motion loop stops when the page is gone", () => {
  const calls: string[] = []
  const ctx = new Proxy({}, { get: () => () => calls.push("draw"), set: () => true })
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof getContext
  const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 0)
  try {
    const host = document.body.appendChild(document.createElement("div"))
    const canvas = host.appendChild(document.createElement("canvas"))

    window.matchMedia = ((query: string) => ({ matches: query.includes("reduce") })) as typeof window.matchMedia
    startScene(canvas, host)
    expect(calls.length, "the end state is drawn").toBeGreaterThan(0)
    expect(raf, "no loop under reduced motion").not.toHaveBeenCalled()

    window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia
    startScene(canvas, host)
    expect(raf).toHaveBeenCalledTimes(1)
    const tick = raf.mock.calls[0][0] as FrameRequestCallback
    tick(performance.now() + 1000)
    expect(raf, "the loop continues while the host is on the page").toHaveBeenCalledTimes(2)
    host.remove()
    tick(performance.now() + 2000)
    expect(raf, "the loop stops when the host is gone").toHaveBeenCalledTimes(2)
  } finally {
    raf.mockRestore()
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof getContext
    delete (window as { matchMedia?: unknown }).matchMedia
  }
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const pageChoice = (name: string) =>
  [...page.root.querySelectorAll<HTMLElement>("b29-choice button")].find((el) => el.textContent === name)!
const settings = () => page.root.querySelector<HTMLElement>("b29-reopen button")!
const scores = () => page.root.querySelector<HTMLElement>("ui-popover-content")!
const clearCookie = () => void (document.cookie = "b29-consent=; max-age=0; path=/")

test("names: the page names the bar and its buttons, and starts with no cookie", async () => {
  clearCookie()
  page = mountUI(ui)
  await settle()
  const bar = page.root.querySelector("b29-consent")!
  expect(bar.getAttribute("aria-label")).toBe("Cookie consent")
  expect(bar.getAttribute("role")).toBe("group")
  expect(bar.getAttribute("popover")).toBe("manual")
  expect([...page.root.querySelectorAll("b29-choice button")].map((el) => el.textContent)).toEqual(["Accept all", "Essential only"])
  expect(page.root.querySelector("b29-reopen button")!.textContent).toBe("Cookie settings")
  expect(page.root.querySelector("canvas")!.getAttribute("aria-hidden")).toBe("true")
  expect(document.cookie).toBe("")
  expect(status()).toBe("No choice saved. The bar waits for an answer.")
})

test("keyboard: Essential only writes the cookie and Cookie settings removes it", async () => {
  pageChoice("Accept all").focus()
  await keys("ArrowRight", "Space")
  expect(status()).toBe("Saved choice: essential cookies only.")
  expect(document.cookie).toContain("b29-consent=essential")
  expect(page.root.querySelector("[data-cookie]")!.textContent).toBe("Cookie: b29-consent=essential")
  settings().focus()
  await keys("Enter")
  expect(status()).toBe("No choice saved. The bar waits for an answer.")
  expect(document.cookie).not.toContain("b29-consent")
  expect(page.root.querySelector("[data-cookie]")!.textContent).toBe("Cookie: none.")
})

test("keyboard: after a choice focus moves to Cookie settings, and after Cookie settings back to Accept all", async () => {
  pageChoice("Accept all").focus()
  await keys("Enter")
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(document.activeElement).toBe(settings())
  await keys("Enter")
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(document.activeElement).toBe(pageChoice("Accept all"))
  expect(status()).toBe("No choice saved. The bar waits for an answer.")
})

test("keyboard: the bar stays usable while a modal layer is open", async () => {
  const trigger = page.root.querySelector<HTMLElement>("ui-popover-trigger button")!
  trigger.focus()
  await keys("Enter")
  await settle()
  expect(scores().hasAttribute("hidden"), "the modal layer is open").toBe(false)
  // A press outside a modal layer closes it. A press in a persistent layer does not.
  const button = pageChoice("Essential only")
  for (const type of ["pointerdown", "pointerup", "click"]) button.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true }))
  await settle()
  expect(status()).toBe("Saved choice: essential cookies only.")
  expect(document.cookie).toContain("b29-consent=essential")
  expect(scores().hasAttribute("hidden"), "a press in the bar does not close the modal layer").toBe(false)
  page.root.querySelector<HTMLElement>("ui-popover-close button")!.click()
  await settle()
  expect(scores().hasAttribute("hidden")).toBe(true)
  settings().click()
  await settle()
  expect(document.cookie).not.toContain("b29-consent")
})

test("keyboard: a saved cookie starts the bar already decided", async () => {
  document.cookie = "b29-consent=all; path=/"
  const again = document.body.appendChild(document.createElement("section"))
  ui.mount(again, { agent: page.agent, ask: async () => true })
  await settle()
  expect(again.querySelector("[data-status]")!.textContent).toBe("Saved choice: all cookies.")
  expect(again.querySelector("b29-consent")!.getAttribute("data-value")).toBe("all")
  expect(again.querySelector("b29-reopen")!.hasAttribute("hidden")).toBe(false)
  expect(again.querySelector("b29-ask")!.hasAttribute("hidden")).toBe(true)
  document.cookie = "b29-consent=marketing; path=/"
  const bad = document.body.appendChild(document.createElement("section"))
  ui.mount(bad, { agent: page.agent, ask: async () => true })
  await settle()
  expect(bad.querySelector("b29-consent")!.hasAttribute("data-decided"), "a cookie with an unknown value is ignored").toBe(false)
  again.remove()
  bad.remove()
  clearCookie()
})

test("agent: an agent finds the bar, chooses, refuses an unknown choice and resets", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const bar = page.live().find((entry) => entry.label === "Cookie consent")!
  expect(bar.actions).toEqual(["choose", "reset"])
  const refused = await page.agent.act({ steps: [{ ref: "Cookie consent", action: "choose", args: ["marketing"] }] })
  expect(refused.ok).toBe(false)
  expect(status()).toBe("No choice saved. The bar waits for an answer.")

  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Saved choice: essential cookies only.")
  expect(document.cookie).toContain("b29-consent=essential")
  expect(ui.task!.done(page.root)).toBe(true)

  const back = await page.agent.act({ steps: [{ ref: "Cookie consent", action: "reset" }] })
  expect(back.ok, back.error?.message).toBe(true)
  expect(document.cookie).not.toContain("b29-consent")
  expect(ui.task!.done(page.root)).toBe(false)
})
