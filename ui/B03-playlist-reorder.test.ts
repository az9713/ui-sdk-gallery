import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { playlist } from "./B03-playlist-reorder"

const names = ["A", "B", "C", "D"]
const markup = `<root aria-label="Playlist">${names.map((n) => `<song value="${n}">${n}</song>`).join("")}</root>`
const options = { defaultValue: names }
type View = ReturnType<typeof mount<typeof playlist>>
const song = (view: View, key: string) => view.part("song", key)!

// jsdom has no layout: each track is 40 px high with a 10 px gap, at the place it has in the order now.
function layOut(view: View) {
  const rect = HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect = function () {
    const index = view.api.order().indexOf(this.textContent!)
    if (index < 0) return rect.call(this)
    const top = index * 50
    return { x: 0, y: top, left: 0, top, right: 300, bottom: top + 40, width: 300, height: 40, toJSON: () => ({}) }
  }
  return () => (HTMLElement.prototype.getBoundingClientRect = rect)
}

test("keyboard: the list is 1 tab stop, and the arrow keys move focus without a change of order", async () => {
  const view = mount(playlist, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(song(view, "A"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(song(view, "B").getAttribute("tabindex")).toBe("-1")
    await view.keys("ArrowDown", "ArrowDown")
    expect(document.activeElement).toBe(song(view, "C"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await view.keys("ArrowUp")
    expect(document.activeElement).toBe(song(view, "B"))
    expect(view.state.value).toEqual(names)
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: Space picks up a track, the arrow keys move it, and Space drops it", async () => {
  const view = mount(playlist, options, markup)
  try {
    await view.keys("Tab", "Space")
    expect(song(view, "A").getAttribute("aria-selected")).toBe("true")
    expect(song(view, "A").hasAttribute("data-grabbed")).toBe(true)
    expect(song(view, "B").getAttribute("aria-selected")).toBe("false")
    await view.keys("ArrowDown", "ArrowDown")
    expect(view.api.order()).toEqual(["B", "C", "A", "D"])
    expect(view.state.value).toEqual(names)
    await view.keys("Space")
    expect(view.state.value).toEqual(["B", "C", "A", "D"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "move-key", source: "keyboard" })
    expect(song(view, "A").getAttribute("aria-selected")).toBe("false")
    expect(song(view, "A").hasAttribute("data-grabbed")).toBe(false)
    expect(view.announced.at(-1)).toBe("Dropped A at position 3 of 4.")
  } finally {
    view.unmount()
  }
})

test("keyboard: Enter picks up and drops, and Home and End send a track to either end", async () => {
  const view = mount(playlist, options, markup)
  try {
    await view.keys("Tab", "ArrowDown", "Enter", "End", "Enter")
    expect(view.state.value).toEqual(["A", "C", "D", "B"])
    await view.keys("Enter", "Home", "Enter")
    expect(view.state.value).toEqual(["B", "A", "C", "D"])
    expect(document.activeElement).toBe(song(view, "B"))
  } finally {
    view.unmount()
  }
})

test("keyboard: Escape puts a picked-up track back, and Tab puts it back and goes on", async () => {
  const view = mount(playlist, options, markup)
  try {
    await view.keys("Tab", "Space", "ArrowDown", "Escape")
    expect(view.state.value).toEqual(names)
    expect(view.state.moving).toBeNull()
    expect(view.changes).toEqual([])
    expect(song(view, "A").getAttribute("aria-selected")).toBe("false")
    await view.keys("Space", "ArrowDown", "Tab")
    expect(view.state.value).toEqual(names)
    expect(view.state.moving).toBeNull()
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: a picked-up track stops at both ends of the list", async () => {
  const view = mount(playlist, options, markup)
  try {
    await view.keys("Tab", "Space", "ArrowUp", "ArrowUp", "Space")
    expect(view.state.value).toEqual(names)
    await view.keys("Space", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "Space")
    expect(view.state.value).toEqual(["B", "C", "D", "A"])
  } finally {
    view.unmount()
  }
})

test("pointer: a drag moves a track to the place where it is dropped and reports the drag", async () => {
  const view = mount(playlist, options, markup)
  const restore = layOut(view)
  try {
    await view.drag(song(view, "A"), { by: { x: 0, y: 120 } })
    await view.settle()
    expect(view.state.value).toEqual(["B", "C", "A", "D"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag", source: "mouse" })
    expect(view.state.moving).toBeNull()
    await view.drag(song(view, "D"), { by: { x: 0, y: -400 } })
    await view.settle()
    expect(view.state.value).toEqual(["D", "B", "C", "A"])
  } finally {
    restore()
    view.unmount()
  }
})

test("pointer: a press without a move is a click and changes nothing", async () => {
  const view = mount(playlist, options, markup)
  try {
    await view.click(song(view, "B"))
    expect(view.state.value).toEqual(names)
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("server: the playlist renders with no DOM", () => {
  checkServer(playlist, options, markup)
})

// checkDirection needs horizontal arrows and fails on a vertical list: "ArrowRight changes nothing left to right".
test("direction: a right to left page moves tracks with the same keys, and Left and Right change nothing in both", async () => {
  const results: string[][] = []
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(playlist, options, markup)
    try {
      await view.keys("Tab", "ArrowRight", "ArrowLeft")
      expect(document.activeElement, dir).toBe(song(view, "A"))
      expect(view.state.value).toEqual(names)
      await view.keys("Space", "ArrowRight", "ArrowLeft", "ArrowDown", "ArrowDown", "Space")
      expect(view.state.value, dir).toEqual(["B", "C", "A", "D"])
      results.push(view.state.value)
    } finally {
      view.unmount()
      document.documentElement.removeAttribute("dir")
    }
  }
  expect(results[1]).toEqual(results[0])
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const tracks = () => [...page.root.querySelectorAll<HTMLElement>("b03-track")]
const titles = () => tracks().map((track) => track.querySelector("span")!.textContent)

test("names: the page names the list and describes how to move a track", async () => {
  page = mountUI(ui)
  await settle()
  const list = page.root.querySelector("b03-playlist")!
  expect(list.getAttribute("aria-label")).toBe("Playlist")
  expect(list.getAttribute("role")).toBe("listbox")
  expect(titles()).toEqual(["Night Drive", "Blue Hour", "Static Bloom", "Slow Burn", "Glass Harbor"])
  for (const track of tracks()) {
    expect(track.getAttribute("role")).toBe("option")
    expect(page.root.querySelector(`#${track.getAttribute("aria-describedby")}`)!.textContent).toContain("Space")
  }
  expect(tracks().filter((track) => track.tabIndex === 0).length).toBe(1)
  expect(tracks().some((track) => track.hasAttribute("aria-disabled"))).toBe(false)
})

test("keyboard: on the page, the tracks follow the new order, focus stays on the moved track and the status line reports it", async () => {
  tracks()[2].focus()
  await keys("Space", "ArrowUp", "ArrowUp")
  expect(titles()).toEqual(["Static Bloom", "Night Drive", "Blue Hour", "Slow Burn", "Glass Harbor"])
  expect(document.activeElement).toBe(tracks()[0])
  expect(tracks()[0].getAttribute("aria-selected")).toBe("true")
  expect(status()).toBe("The order has not changed.")
  await keys("Space")
  expect(status()).toBe("Order: Static Bloom, Night Drive, Blue Hour, Slow Burn, Glass Harbor.")
  expect(document.activeElement).toBe(tracks()[0])
  expect(tracks().filter((track) => track.tabIndex === 0).length).toBe(1)
  await keys("ArrowDown", "Space", "Escape")
  expect(titles()).toEqual(["Static Bloom", "Night Drive", "Blue Hour", "Slow Burn", "Glass Harbor"])
})

test("agent: an agent finds the list and its tracks, and moves 2 tracks", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const list = page.live().find((entry) => entry.label === "Playlist")!
  expect(list.actions).toEqual(["move"])
  const found = JSON.stringify(await page.agent.query({ within: "Playlist" }))
  for (const title of titles()) expect(found).toContain(title!)

  const result = await page.agent.act(ui.task!)
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Order: Static Bloom, Blue Hour, Slow Burn, Glass Harbor, Night Drive.")
  expect(titles()).toEqual(["Static Bloom", "Blue Hour", "Slow Burn", "Glass Harbor", "Night Drive"])
})
