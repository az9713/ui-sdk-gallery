import { checkServer, mount } from "@ui-sdk/core/testing"
import { afterAll, beforeAll, expect, test, vi } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { piano, startVisualizer } from "./B35-piano-keyboard"

// jsdom has no canvas and no Web Audio. The canvas gets no context, and a fake AudioContext counts what is made.
const getContext = HTMLCanvasElement.prototype.getContext
const made = { contexts: 0, tones: 0 }
const node: unknown = new Proxy(() => {}, {
  get: (_target, prop) => (prop === "then" ? undefined : node),
  apply: () => node,
  set: () => true,
})
class FakeAudio {
  currentTime = 0
  destination = node
  constructor() {
    made.contexts++
  }
  resume() {
    return Promise.resolve()
  }
  createOscillator() {
    made.tones++
    return node
  }
  createBiquadFilter() {
    return node
  }
  createGain() {
    return node
  }
}
const hadAudio = "AudioContext" in globalThis
const realAudio = (globalThis as { AudioContext?: unknown }).AudioContext
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof getContext
  ;(globalThis as { AudioContext?: unknown }).AudioContext = FakeAudio
})
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = getContext
  if (hadAudio) (globalThis as { AudioContext?: unknown }).AudioContext = realAudio
  else delete (globalThis as { AudioContext?: unknown }).AudioContext
})

const NATURALS = ["C4", "D4", "E4", "F4", "G4"]
const SHARPS = ["C#4", "D#4", "F#4"]
const markup = (dir = ' dir="ltr"') =>
  `<root aria-label="Piano keyboard"${dir}><naturals aria-label="White keys">${NATURALS.map((n) => `<natural value="${n}">${n}</natural>`).join("")}</naturals><sharps aria-label="Black keys">${SHARPS.map((n) => `<sharp value="${n}">${n}</sharp>`).join("")}</sharps></root>`
type View = ReturnType<typeof mount<typeof piano>>
const key = (view: View, name: string) =>
  [...view.root.querySelectorAll<HTMLElement>("[data-slot=piano-natural], [data-slot=piano-sharp]")].find((el) => el.textContent === name)!

test("keyboard: Left and Right move along the white keys, and Home and End go to the ends", async () => {
  const view = mount(piano, {}, markup())
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(key(view, "C4"))
    await view.keys("ArrowRight", "ArrowRight")
    expect(document.activeElement).toBe(key(view, "E4"))
    await view.keys("ArrowLeft")
    expect(document.activeElement).toBe(key(view, "D4"))
    await view.keys("End")
    expect(document.activeElement).toBe(key(view, "G4"))
    await view.keys("ArrowRight")
    expect(document.activeElement, "no wrap past the last key").toBe(key(view, "G4"))
    await view.keys("Home")
    expect(document.activeElement).toBe(key(view, "C4"))
    expect(view.state.value).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: the white keys and the black keys are 2 tab stops, and the arrows stay in their group", async () => {
  const view = mount(piano, {}, markup())
  try {
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(2)
    expect(key(view, "C4").getAttribute("tabindex")).toBe("0")
    expect(key(view, "C#4").getAttribute("tabindex")).toBe("0")
    await view.keys("Tab", "End")
    expect(document.activeElement).toBe(key(view, "G4"))
    await view.keys("Tab")
    expect(document.activeElement).toBe(key(view, "C#4"))
    await view.keys("ArrowRight", "ArrowRight", "ArrowRight")
    expect(document.activeElement, "the black keys end at F#4").toBe(key(view, "F#4"))
    await view.keys("Home", "ArrowLeft")
    expect(document.activeElement, "Left does not leave the black keys").toBe(key(view, "C#4"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(2)
    expect(key(view, "C4").getAttribute("role")).toBe("button")
    expect(view.part("naturals")!.getAttribute("role")).toBe("group")
    expect(view.part("sharps")!.getAttribute("role")).toBe("group")
  } finally {
    view.unmount()
  }
})

test("keyboard: each group keeps its own tab stop when focus leaves it and comes back", async () => {
  const view = mount(piano, {}, markup())
  try {
    await view.keys("Tab", "ArrowRight", "ArrowRight")
    expect(document.activeElement).toBe(key(view, "E4"))
    await view.keys("Tab", "ArrowRight")
    expect(document.activeElement).toBe(key(view, "D#4"))
    await view.keys("Shift+Tab")
    expect(document.activeElement, "the white keys remember E4").toBe(key(view, "E4"))
    await view.keys("Tab")
    expect(document.activeElement, "the black keys remember D#4").toBe(key(view, "D#4"))
    expect(key(view, "E4").getAttribute("tabindex")).toBe("0")
    expect(key(view, "D#4").getAttribute("tabindex")).toBe("0")
    expect(key(view, "C4").getAttribute("tabindex")).toBe("-1")
    expect(key(view, "C#4").getAttribute("tabindex")).toBe("-1")
  } finally {
    view.unmount()
  }
})

test("keyboard: Space and Enter play the focused key, and the same key again adds the note again", async () => {
  const view = mount(piano, {}, markup())
  try {
    await view.keys("Tab", "Space", "ArrowRight", "Enter", "Space")
    expect(view.state.value).toEqual(["C4", "D4", "D4"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
    expect(key(view, "D4").hasAttribute("data-last")).toBe(true)
    expect(key(view, "C4").hasAttribute("data-last")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: a click plays a black key and marks it as the last key", async () => {
  const view = mount(piano, {}, markup())
  try {
    await view.click(key(view, "F#4"))
    expect(view.state.value).toEqual(["F#4"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press" })
    expect(key(view, "F#4").hasAttribute("data-last")).toBe(true)
  } finally {
    view.unmount()
  }
})

test("api: play refuses a key that is not on the keyboard, and clear empties the melody", async () => {
  const view = mount(piano, {}, markup())
  try {
    expect(() => view.api.play("H4")).toThrow('No key "H4". Keys: C4, C#4, D4, D#4, E4, F4, F#4, G4.')
    expect(view.state.value).toEqual([])
    expect(view.api.play("D#4")).toBe(true)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "imperative" })
    expect(view.api.clear()).toBe(true)
    expect(view.state.value).toEqual([])
  } finally {
    view.unmount()
  }
})

test("server: the piano renders with no DOM", () => {
  checkServer(piano, {}, markup())
  checkServer(piano, { defaultValue: ["E4"] }, markup())
})

// A piano keeps its low notes on the left in any language, so the page sets dir="ltr" on the keyboard.
test("direction: the arrows follow the dir of the keyboard, not the page", async () => {
  document.documentElement.dir = "rtl"
  try {
    const fixed = mount(piano, {}, markup())
    try {
      await fixed.keys("Tab", "ArrowRight")
      expect(document.activeElement, "dir=ltr: Right goes up in pitch").toBe(key(fixed, "D4"))
      await fixed.keys("ArrowLeft")
      expect(document.activeElement).toBe(key(fixed, "C4"))
    } finally {
      fixed.unmount()
    }
    const free = mount(piano, {}, markup(""))
    try {
      await free.keys("Tab", "ArrowLeft")
      expect(document.activeElement, "with no dir, the page's rtl turns Left into the next key").toBe(key(free, "D4"))
    } finally {
      free.unmount()
    }
  } finally {
    document.documentElement.dir = ""
  }
})

test("visualizer: reduced motion draws each state at once, and the motion loop stops when the page is gone", () => {
  const calls: string[] = []
  const ctx: unknown = new Proxy(
    {},
    {
      get: (_target, prop) => () => (calls.push(String(prop)), ctx),
      set: () => true,
    },
  )
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof getContext
  const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 0)
  try {
    const host = document.body.appendChild(document.createElement("div"))
    const canvas = host.appendChild(document.createElement("canvas"))

    window.matchMedia = ((query: string) => ({ matches: query.includes("reduce") })) as typeof window.matchMedia
    const still = startVisualizer(canvas, host)
    const first = calls.length
    expect(first, "the first state is drawn in mount").toBeGreaterThan(0)
    still.hit("E5", true)
    still.set(1)
    expect(calls.length, "the next state is drawn at once").toBeGreaterThan(first)
    expect(raf, "no loop under reduced motion").not.toHaveBeenCalled()

    window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia
    const moving = startVisualizer(canvas, host)
    moving.hit("E5", true)
    moving.set(1)
    expect(raf).toHaveBeenCalledTimes(1)
    const tick = raf.mock.calls[0][0] as FrameRequestCallback
    tick(performance.now())
    expect(raf, "the loop continues while the notes fall").toHaveBeenCalledTimes(2)
    host.remove()
    tick(performance.now())
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
const pageKey = (name: string) =>
  [...page.root.querySelectorAll<HTMLElement>("b35-piano button")].find((el) => el.textContent === name)!
const restart = () => page.root.querySelector<HTMLElement>("[data-restart] button")!.click()

test("names: the page names the keyboard, its 2 groups, its 17 keys and the Start over button", async () => {
  page = mountUI(ui)
  await settle()
  const keyboard = page.root.querySelector("b35-piano")!
  expect(keyboard.getAttribute("aria-label")).toBe("Piano keyboard")
  expect(keyboard.getAttribute("role")).toBe("group")
  expect(keyboard.getAttribute("dir")).toBe("ltr")
  expect(page.root.querySelector("b35-naturals")!.getAttribute("aria-label")).toBe("White keys")
  expect(page.root.querySelector("b35-sharps")!.getAttribute("aria-label")).toBe("Black keys")
  expect(page.root.querySelectorAll("b35-natural button").length).toBe(10)
  expect(page.root.querySelectorAll("b35-sharp button").length).toBe(7)
  expect(page.root.querySelectorAll('b35-piano button[tabindex="0"]').length).toBe(2)
  expect(page.root.querySelector("b35-piano [data-last]")).toBeNull()
  expect(page.root.querySelector("[data-restart] button")!.textContent).toBe("Start over")
  expect(page.root.querySelector("canvas")!.getAttribute("aria-hidden")).toBe("true")
  expect([...page.root.querySelectorAll("[data-sheet] li")].map((li) => li.textContent)).toEqual(
    ["E5", "D#5", "E5", "D#5", "E5", "B4", "D5", "C5", "A4"],
  )
  expect(status()).toBe("Next note: E5. 0 of 9 notes played.")
})

test("audio: the AudioContext starts on a person's key press, not on mount or an agent's play", async () => {
  expect(made.contexts, "mount makes no AudioContext").toBe(0)
  const result = await page.agent.act({ steps: [{ ref: "Piano keyboard", action: "play", args: ["E5"] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("E5 is right. Next note: D#5. 1 of 9 notes played.")
  expect(made.contexts, "an agent's play makes no AudioContext").toBe(0)
  expect(made.tones).toBe(0)
  pageKey("D#5").focus()
  await keys("Space")
  expect(made.contexts, "a person's press makes the AudioContext").toBe(1)
  expect(made.tones, "and the note sounds").toBe(1)
  await keys("Enter")
  expect(made.contexts, "1 AudioContext serves each later note").toBe(1)
  expect(made.tones).toBe(2)
  restart()
  await settle()
  expect(status()).toBe("Next note: E5. 0 of 9 notes played.")
})

test("keyboard: on the page, the right notes advance the melody and a wrong note does not", async () => {
  pageKey("C4").click()
  await settle()
  expect(status()).toBe("C4 is not next. Next note: E5. 0 of 9 notes played.")
  pageKey("E5").focus()
  await keys("Space")
  expect(status()).toBe("E5 is right. Next note: D#5. 1 of 9 notes played.")
  const sheet = [...page.root.querySelectorAll("[data-sheet] li")]
  expect(sheet[0].hasAttribute("data-played")).toBe(true)
  expect(sheet[1].hasAttribute("data-next")).toBe(true)
  expect(pageKey("E5").hasAttribute("data-last")).toBe(true)
  await keys("Tab")
  expect(document.activeElement?.closest("b35-sharps"), "Tab goes from the white keys to the black keys").toBeTruthy()
  await keys("Home", "End")
  expect(document.activeElement).toBe(pageKey("D#5"))
  await keys("Enter")
  expect(status()).toBe("D#5 is right. Next note: E5. 2 of 9 notes played.")
  expect(pageKey("D#5").hasAttribute("data-last")).toBe(true)
  expect(pageKey("E5").hasAttribute("data-last")).toBe(false)
  page.root.querySelector<HTMLElement>("[data-restart] button")!.focus()
  await keys("Enter")
  expect(status()).toBe("Next note: E5. 0 of 9 notes played.")
  expect(page.root.querySelectorAll("[data-sheet] li[data-played]").length).toBe(0)
})

test("agent: an agent finds the keyboard, plays the melody, refuses a key that is not there and starts over", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const keyboard = page.live().find((entry) => entry.label === "Piano keyboard")!
  expect(keyboard.actions).toEqual(["play", "clear"])
  expect(page.live().some((entry) => entry.label === "Start over")).toBe(true)
  const found = await page.agent.query({ within: "Piano keyboard" })
  if ("error" in found) throw new Error(found.error)
  const values = found[0].items!.map((item) => item.value)
  expect(values.length).toBe(17)
  expect(values).toContain("D#5")

  const refused = await page.agent.act({ steps: [{ ref: "Piano keyboard", action: "play", args: ["H4"] }] })
  expect(refused.ok).toBe(false)
  expect(status()).toBe("Next note: E5. 0 of 9 notes played.")

  expect(ui.task!.done(page.root)).toBe(false)
  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Melody complete: 9 of 9 notes played.")
  expect(ui.task!.done(page.root)).toBe(true)
  expect(page.root.querySelectorAll("[data-sheet] li[data-played]").length).toBe(9)

  const over = await page.agent.act({ steps: [{ ref: "Start over", action: "press" }] })
  expect(over.ok, over.error?.message).toBe(true)
  expect(status()).toBe("Next note: E5. 0 of 9 notes played.")
  expect(ui.task!.done(page.root)).toBe(false)
})
