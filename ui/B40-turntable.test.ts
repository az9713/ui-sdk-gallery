import { createController } from "@ui-sdk/core"
import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { type DeckControls, turntable } from "./B40-turntable"

// jsdom has no WebGL. Without this stub it prints "Not implemented" for each mount; the UI returns early either way.
HTMLCanvasElement.prototype.getContext = (() => null) as never

const options = { tracks: ["Alpha", "Bravo", "Coda"] }
const markup = `<root aria-label="Turntable"><start>Start</start><skip>Skip</skip><tracklist>${options.tracks
  .map((t) => `<song value="${t}">${t}</song>`)
  .join("")}</tracklist></root>`
type View = ReturnType<typeof mount<typeof turntable>>
const part = (view: View, slot: string, value?: string) =>
  [...view.root.querySelectorAll<HTMLElement>(`[data-slot=turntable-${slot}]`)].find((el) => !value || el.textContent === value)!

test("keyboard: Space and Enter on Start toggle playing, and aria-pressed follows", async () => {
  const view = mount(turntable, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(part(view, "start"))
    expect(part(view, "start").getAttribute("aria-pressed")).toBe("false")
    await view.keys("Space")
    expect(view.state.playing).toBe(true)
    expect(part(view, "start").getAttribute("aria-pressed")).toBe("true")
    expect(part(view, "start").hasAttribute("data-playing")).toBe(true)
    expect(view.changes.at(-1)).toMatchObject({ key: "playing", reason: "toggle-press", source: "keyboard" })
    await view.keys("Enter")
    expect(view.state.playing).toBe(false)
    expect(part(view, "start").getAttribute("aria-pressed")).toBe("false")
  } finally {
    view.unmount()
  }
})

test("keyboard: Skip is the second tab stop, moves to the next track and wraps from the last to the first", async () => {
  const view = mount(turntable, options, markup)
  try {
    expect(part(view, "song", "Alpha").getAttribute("aria-current")).toBe("true")
    await view.keys("Tab", "Tab")
    expect(document.activeElement).toBe(part(view, "skip"))
    await view.keys("Enter")
    expect(view.state.value).toBe("Bravo")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "next-press", source: "keyboard" })
    expect(part(view, "song", "Bravo").getAttribute("aria-current")).toBe("true")
    expect(part(view, "song", "Alpha").hasAttribute("aria-current")).toBe(false)
    await view.keys("Space", "Space")
    expect(view.state.value).toBe("Alpha")
    expect(view.state.playing).toBe(false)
  } finally {
    view.unmount()
  }
})

test("controller: a handle made outside the deck plays, pauses and changes the track with the reason imperative", async () => {
  const remote = createController<DeckControls>()
  const view = mount(turntable, { ...options, controller: remote }, markup)
  try {
    await settle()
    remote.play()
    expect(view.state.playing).toBe(true)
    expect(view.changes.at(-1)).toMatchObject({ key: "playing", reason: "imperative" })
    remote.previous()
    expect(view.state.value).toBe("Coda")
    remote.next()
    expect(view.state.value).toBe("Alpha")
    remote.setValue("Bravo")
    expect(part(view, "song", "Bravo").getAttribute("aria-current")).toBe("true")
    remote.pause()
    expect(view.state.playing).toBe(false)
    expect(part(view, "start").getAttribute("aria-pressed")).toBe("false")
    expect(() => remote.setValue("Encore")).toThrow('No track "Encore". Tracks: Alpha, Bravo, Coda.')
  } finally {
    view.unmount()
  }
})

test("server: the turntable renders with no DOM", () => {
  checkServer(turntable, options, markup)
})

// checkDirection needs a key whose result depends on the direction. The deck has none: its buttons take Space and Enter only.
test("direction: Start and Skip do the same in left-to-right and right-to-left", async () => {
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(turntable, options, markup)
    try {
      await view.keys("Tab", "ArrowRight", "ArrowLeft")
      expect(document.activeElement).toBe(part(view, "start"))
      await view.keys("Space", "Tab", "Enter")
      expect(view.state).toMatchObject({ playing: true, value: "Bravo" })
    } finally {
      view.unmount()
      document.documentElement.dir = ""
    }
  }
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const press = async (label: string, key: "Enter" | "Space") => {
  ;[...page.root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === label)!.focus()
  await keys(key)
}

test("names: the page names the deck, its 2 buttons, its 4 tracks and the 4 remote buttons", async () => {
  page = mountUI(ui)
  await settle()
  const deck = page.root.querySelector("b40-turntable")!
  expect(deck.getAttribute("role")).toBe("group")
  expect(deck.getAttribute("aria-label")).toBe("Turntable")
  expect(page.root.querySelector("b40-start")!.getAttribute("role")).toBe("button")
  expect(page.root.querySelector("b40-skip")!.textContent).toBe("Skip")
  expect([...page.root.querySelectorAll("b40-song[role=listitem]")].length).toBe(4)
  expect(page.root.querySelector("canvas")!.getAttribute("aria-hidden")).toBe("true")
  expect([...page.root.querySelectorAll("[data-remote] button")].map((b) => b.textContent)).toEqual([
    "Play",
    "Pause",
    "Previous track",
    "Next track",
  ])
  expect(status()).toBe("Stopped on Low Tide, track 1 of 4.")
})

test("keyboard: the remote's buttons drive the deck from outside its tree, and the status line follows", async () => {
  const deck = page.root.querySelector("b40-turntable")!
  for (const button of page.root.querySelectorAll("[data-remote] button")) expect(deck.contains(button)).toBe(false)
  await press("Next track", "Enter")
  expect(status()).toBe("Stopped on Lanterns, track 2 of 4.")
  await press("Play", "Enter")
  expect(status()).toBe("Playing Lanterns, track 2 of 4.")
  expect(page.root.querySelector("b40-start")!.getAttribute("aria-pressed")).toBe("true")
  await press("Previous track", "Space")
  await press("Previous track", "Space")
  expect(status()).toBe("Playing Night Ferry, track 4 of 4.")
  expect(page.root.querySelector("b40-song[aria-current]")!.getAttribute("value")).toBe("Night Ferry")
  await press("Pause", "Space")
  expect(status()).toBe("Stopped on Night Ferry, track 4 of 4.")
  page.root.querySelector<HTMLElement>("b40-start")!.focus()
  await keys("Space")
  expect(status()).toBe("Playing Night Ferry, track 4 of 4.")
  page.root.querySelector<HTMLElement>("b40-skip")!.focus()
  await keys("Enter")
  expect(status()).toBe("Playing Low Tide, track 1 of 4.")
})

test("agent: an agent presses the remote's Next track and Play, and a track the album does not have is refused", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const deck = page.live().find((entry) => entry.label === "Turntable")!
  expect(deck.actions).toEqual(["play", "pause", "next", "previous", "setValue"])
  expect(deck).toMatchObject({ value: "Low Tide", playing: true })

  const reset = await page.agent.act({ steps: [{ ref: "Pause", action: "press" }] })
  expect(reset.ok, reset.error?.message).toBe(true)
  expect(ui.task!.done(page.root)).toBe(false)
  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Playing Lanterns, track 2 of 4.")
  expect(ui.task!.done(page.root)).toBe(true)

  const direct = await page.agent.act({ steps: [{ ref: "Turntable", action: "setValue", args: ["Salt Road"] }] })
  expect(direct.ok, direct.error?.message).toBe(true)
  expect(status()).toBe("Playing Salt Road, track 3 of 4.")
  const refused = await page.agent.act({ steps: [{ ref: "Turntable", action: "setValue", args: ["Blue Moon"] }] })
  expect(refused.ok).toBe(false)
  expect(refused.error?.message).toContain("Night Ferry")
  expect(status()).toBe("Playing Salt Road, track 3 of 4.")
})
