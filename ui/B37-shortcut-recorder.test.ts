import { checkServer, mount, setPlatform } from "@ui-sdk/core/testing"
import { formatShortcut } from "@ui-sdk/core"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { shortcutRecorder } from "./B37-shortcut-recorder"

setPlatform("other")

// 4 commands. Play has no shortcut.
const markup = `<root aria-label="Timeline shortcuts">
  <recorder value="split" label="Split clip">Split clip</recorder>
  <recorder value="mark-in" label="Mark in">Mark in</recorder>
  <recorder value="step-back" label="Step back">Step back</recorder>
  <recorder value="play" label="Play">Play</recorder>
  <status></status>
</root>`
const options = { defaultValue: { split: "mod+k", "mark-in": "i", "step-back": "arrowleft" } as Record<string, string> }
type View = ReturnType<typeof mount<typeof shortcutRecorder>>
const recorder = (view: View, id: string) => view.part("recorder", id)!
const focus = (view: View, id: string) => recorder(view, id).focus()
const press = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
  document.body.dispatchEvent(event)
  return event
}
const run = (view: View, init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
  view.api.run(event)
  return event
}

test("keyboard: the arrow keys move between commands, Home and End go to the ends, and the list is 1 tab stop", async () => {
  const view = mount(shortcutRecorder, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(recorder(view, "split"))
    await view.keys("ArrowDown", "ArrowDown")
    expect(document.activeElement).toBe(recorder(view, "step-back"))
    await view.keys("End")
    expect(document.activeElement).toBe(recorder(view, "play"))
    await view.keys("ArrowUp")
    expect(document.activeElement).toBe(recorder(view, "step-back"))
    await view.keys("Home")
    expect(document.activeElement).toBe(recorder(view, "split"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    for (const el of view.root.querySelectorAll("[data-slot=shortcut-recorder-recorder]")) {
      expect(el.getAttribute("role")).toBe("button")
      expect(el.getAttribute("aria-pressed")).toBe("false")
    }
    expect(view.root.getAttribute("role")).toBe("group")
  } finally {
    view.unmount()
  }
})

test("keyboard: Enter and Space start a recording, and a chord records the shortcut", async () => {
  const view = mount(shortcutRecorder, options, markup)
  try {
    await view.keys("Tab", "ArrowDown", "Enter")
    expect(view.state.recording).toBe("mark-in")
    expect(recorder(view, "mark-in").getAttribute("aria-pressed")).toBe("true")
    expect(recorder(view, "mark-in").hasAttribute("data-recording")).toBe(true)
    expect(view.state.notice).toContain("Recording Mark in")
    await view.keys("Control+Shift+m")
    expect(view.state.value["mark-in"]).toBe("mod+shift+m")
    expect(view.state.recording).toBe(null)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "record", source: "keyboard" })
    expect(view.state.notice).toBe("Mark in is now Ctrl+Shift+M.")
    expect(recorder(view, "mark-in").getAttribute("aria-pressed")).toBe("false")
    await view.keys("ArrowDown", "ArrowDown", "Space", "p")
    expect(view.state.value.play).toBe("p")
    expect(view.state.notice).toBe("Play is now P.")
  } finally {
    view.unmount()
  }
})

test("keyboard: Escape cancels a recording and Backspace clears the shortcut", async () => {
  const view = mount(shortcutRecorder, options, markup)
  try {
    await view.keys("Tab", "Enter", "Escape")
    expect(view.state.recording).toBe(null)
    expect(view.state.value.split).toBe("mod+k")
    expect(view.changes.length).toBe(0)
    expect(view.state.notice).toBe("Recording cancelled. Split clip keeps Ctrl+K.")
    await view.keys("Enter", "Backspace")
    expect(view.state.value.split).toBe("")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "clear" })
    expect(recorder(view, "split").hasAttribute("aria-keyshortcuts")).toBe(false)
    expect(view.state.notice).toBe("Split clip has no shortcut.")
    await view.keys("Enter", "Shift+Backspace")
    expect(view.state.value.split).toBe("shift+backspace")
  } finally {
    view.unmount()
  }
})

test("keyboard: modifier keys alone light the keyboard and record nothing", async () => {
  const view = mount(shortcutRecorder, options, markup)
  try {
    await view.keys("Tab", "Enter")
    const down = (init: KeyboardEventInit) => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }))
    const up = (init: KeyboardEventInit) => document.activeElement!.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, ...init }))
    down({ key: "Control", ctrlKey: true })
    expect(view.state.held).toEqual(["mod"])
    down({ key: "Shift", ctrlKey: true, shiftKey: true })
    expect(view.state.held).toEqual(["mod", "shift"])
    expect(view.state.recording).toBe("split")
    expect(view.changes.length).toBe(0)
    up({ key: "Shift", ctrlKey: true })
    expect(view.state.held).toEqual(["mod"])
    down({ key: "j", code: "KeyJ", ctrlKey: true })
    expect(view.state.value.split).toBe("mod+j")
    expect(view.state.held).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: a shortcut that another command owns is refused and the recording goes on", async () => {
  const view = mount(shortcutRecorder, options, markup)
  try {
    await view.keys("Tab", "ArrowDown", "Enter", "i")
    expect(view.state.value["mark-in"]).toBe("i")
    await view.keys("ArrowDown", "ArrowDown", "Enter", "i")
    expect(view.state.value.play ?? "").toBe("")
    expect(view.state.recording).toBe("play")
    expect(view.state.notice).toBe("I already runs Mark in. Press another shortcut.")
    expect(view.changes.length).toBe(1)
    await view.keys("Alt+i")
    expect(view.state.value.play).toBe("alt+i")
    expect(view.state.recording).toBe(null)
  } finally {
    view.unmount()
  }
})

test("keyboard: a press of a recorded shortcut runs its command and counts the run", async () => {
  const view = mount(shortcutRecorder, options, markup)
  try {
    const event = run(view, { key: "k", code: "KeyK", ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(view.state.runs).toEqual({ split: 1 })
    expect(view.state.shown).toBe("split")
    expect(view.state.notice).toBe("Ran Split clip with Ctrl+K.")
    run(view, { key: "k", code: "KeyK", ctrlKey: true })
    expect(view.state.runs.split).toBe(2)
    run(view, { key: "i", code: "KeyI" })
    expect(view.state.runs["mark-in"]).toBe(1)
    const arrow = run(view, { key: "ArrowLeft" })
    expect(arrow.defaultPrevented).toBe(true)
    expect(view.state.notice).toBe("Ran Step back with Left.")
    const other = run(view, { key: "k", code: "KeyK" })
    expect(other.defaultPrevented).toBe(false)
    expect(view.state.runs.split).toBe(2)
    const shifted = run(view, { key: "I", code: "KeyI", shiftKey: true })
    expect(shifted.defaultPrevented).toBe(false)
    const field = document.body.appendChild(document.createElement("input"))
    const typed = new KeyboardEvent("keydown", { key: "i", code: "KeyI", bubbles: true, cancelable: true })
    field.dispatchEvent(typed)
    view.api.run(Object.defineProperty(typed, "target", { value: field }))
    expect(view.state.runs["mark-in"]).toBe(1)
    field.remove()
  } finally {
    view.unmount()
  }
})

test("keyboard: a shortcut does not run during a recording", async () => {
  const view = mount(shortcutRecorder, options, markup)
  try {
    await view.keys("Tab", "Enter")
    expect(view.state.recording).toBe("split")
    const event = run(view, { key: "i", code: "KeyI" })
    expect(event.defaultPrevented).toBe(false)
    expect(view.state.runs).toEqual({})
    await view.keys("Escape")
    run(view, { key: "i", code: "KeyI" })
    expect(view.state.runs).toEqual({ "mark-in": 1 })
  } finally {
    view.unmount()
  }
})

test("keyboard: leaving a recording cancels it", async () => {
  const view = mount(shortcutRecorder, options, markup)
  try {
    await view.keys("Tab", "Enter")
    expect(view.state.recording).toBe("split")
    ;(document.activeElement as HTMLElement).blur()
    await settle()
    expect(view.state.recording).toBe(null)
    expect(view.state.value.split).toBe("mod+k")
  } finally {
    view.unmount()
  }
})

test("keyboard: aria-keyshortcuts and the label follow the platform", async () => {
  const view = mount(shortcutRecorder, options, markup)
  try {
    expect(recorder(view, "split").getAttribute("aria-keyshortcuts")).toBe("Control+K")
    expect(recorder(view, "mark-in").getAttribute("aria-keyshortcuts")).toBe("I")
    expect(recorder(view, "step-back").getAttribute("aria-keyshortcuts")).toBe("ArrowLeft")
    expect(recorder(view, "play").hasAttribute("aria-keyshortcuts")).toBe(false)
    expect(formatShortcut("mod+k")).toContain("Ctrl+K")
    setPlatform("apple")
    expect(formatShortcut("mod+k")).toContain("⌘K")
    await view.keys("Tab", "Enter", "Meta+u")
    expect(view.state.value.split).toBe("mod+u")
    expect(recorder(view, "split").getAttribute("aria-keyshortcuts")).toBe("Meta+U")
    run(view, { key: "u", code: "KeyU", metaKey: true })
    expect(view.state.notice).toBe("Ran Split clip with ⌘U.")
    await view.keys("Enter", "Control+u")
    expect(view.state.value.split).toBe("mod+u")
    expect(view.state.notice).toBe("Use Command, Shift and Alt. Press another shortcut.")
  } finally {
    setPlatform("other")
    view.unmount()
  }
})

test("server: the recorder renders with no DOM", () => {
  checkServer(shortcutRecorder, options, markup)
})

test("direction: Up and Down do not change with the text direction", async () => {
  const seen: string[] = []
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(shortcutRecorder, options, markup)
    try {
      await view.keys("Tab", "ArrowDown", "ArrowDown", "ArrowUp")
      seen.push(`${dir}: ${document.activeElement?.textContent}`)
      await view.keys("ArrowLeft", "ArrowRight")
      expect(document.activeElement).toBe(recorder(view, "mark-in"))
    } finally {
      view.unmount()
      document.documentElement.dir = "ltr"
    }
  }
  expect(seen).toEqual(["ltr: Mark in", "rtl: Mark in"])
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const row = (id: string) => page.root.querySelector<HTMLElement>(`b37-recorder[value="${id}"]`)!
const caps = () => [...page.root.querySelectorAll("g[data-lit]")].map((g) => (g as SVGGElement).dataset.key)

test("names: the page names the group, each command and the status line", async () => {
  page = mountUI(ui)
  await settle()
  const group = page.root.querySelector("b37-shortcuts")!
  expect(group.getAttribute("aria-label")).toBe("Timeline shortcuts")
  expect(group.getAttribute("role")).toBe("group")
  expect([...page.root.querySelectorAll("b37-recorder")].map((el) => el.querySelector("[data-name]")!.textContent)).toEqual([
    "Split clip",
    "Ripple delete",
    "Mark in",
    "Mark out",
    "Step back",
    "Step forward",
    "Play or pause",
    "Zoom to fit",
  ])
  expect(row("split").querySelector("[data-keys]")!.textContent).toContain("Ctrl+K")
  expect(row("mark-in").getAttribute("aria-keyshortcuts")).toBe("I")
  expect(page.root.querySelector("b37-status")!.getAttribute("role")).toBe("status")
  expect(status()).toBe("Focus a command and press Enter to record its shortcut.")
  expect(page.root.querySelector("[data-board]")!.getAttribute("aria-hidden")).toBe("true")
  expect(page.root.querySelectorAll("[tabindex='0']").length).toBe(1)
})

test("keyboard: on the page, the keyboard lights the keys of the focused command", async () => {
  expect(caps().sort()).toEqual(["k", "mod"])
  row("mark-in").focus()
  await settle()
  expect(caps()).toEqual(["i"])
  expect(page.root.querySelector("[data-board]")!.getAttribute("data-mode")).toBe("shown")
  await keys("ArrowDown", "ArrowDown", "ArrowDown")
  expect(document.activeElement).toBe(row("step-forward"))
  expect(caps()).toEqual(["arrowright"])
})

test("keyboard: on the page, a recording lights the held keys and the status line reports the result", async () => {
  row("ripple-delete").focus()
  await keys("Enter")
  expect(status()).toContain("Recording Ripple delete.")
  expect(row("ripple-delete").querySelector("[data-keys]")!.textContent).toBe("Press keys")
  const down = (init: KeyboardEventInit) => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }))
  down({ key: "Control", ctrlKey: true })
  down({ key: "Alt", ctrlKey: true, altKey: true })
  await settle()
  expect(caps().sort()).toEqual(["alt", "mod"])
  expect(page.root.querySelector("[data-board]")!.getAttribute("data-mode")).toBe("recording")
  expect(row("ripple-delete").querySelector("[data-keys]")!.textContent).toBe("Ctrl+Alt")
  await keys("Control+Alt+x")
  expect(status()).toBe("Ripple delete is now Ctrl+Alt+X.")
  expect(row("ripple-delete").querySelector("[data-keys]")!.textContent).toContain("Ctrl+Alt+X")
  expect(row("ripple-delete").getAttribute("aria-keyshortcuts")).toBe("Control+Alt+X")
  expect(caps().sort()).toEqual(["alt", "mod", "x"])
  expect(page.root.querySelector("[data-board]")!.getAttribute("data-mode")).toBe("shown")
})

test("keyboard: on the page, a recorded shortcut runs its command from anywhere", async () => {
  ;(document.activeElement as HTMLElement).blur()
  const event = new KeyboardEvent("keydown", { key: "x", code: "KeyX", ctrlKey: true, altKey: true, bubbles: true, cancelable: true })
  document.body.dispatchEvent(event)
  await settle()
  expect(event.defaultPrevented).toBe(true)
  expect(status()).toBe("Ran Ripple delete with Ctrl+Alt+X.")
  const runs = row("ripple-delete").querySelector<HTMLElement>("[data-runs]")!
  expect(runs.hidden).toBe(false)
  expect(runs.textContent).toBe("1 run")
  expect(caps().sort()).toEqual(["alt", "mod", "x"])
  row("zoom-fit").focus()
  await keys("ArrowLeft")
  expect(status()).toBe("Ran Step back with Left.")
  expect(row("step-back").querySelector("[data-runs]")!.textContent).toBe("1 run")
})

test("agent: an agent finds the commands, assigns a shortcut, clears one, and is told about a conflict", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const group = page.live().find((entry) => entry.label === "Timeline shortcuts")!
  expect(group.actions).toEqual(["assign", "clear"])
  const found = await page.agent.query({ within: "Timeline shortcuts" })
  for (const name of ["Split clip", "Mark in", "Zoom to fit"]) expect(JSON.stringify(found)).toContain(name)

  const result = await page.agent.act({
    steps: [
      { ref: "Timeline shortcuts", action: "assign", args: ["Mark in", "alt+i"] },
      { ref: "Timeline shortcuts", action: "assign", args: ["Mark out", "alt+o"] },
      { ref: "Timeline shortcuts", action: "clear", args: ["Zoom to fit"] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Zoom to fit has no shortcut.")
  expect(ui.task!.done(page.root)).toBe(true)
  expect(row("mark-in").getAttribute("aria-keyshortcuts")).toBe("Alt+I")
  expect(row("mark-out").getAttribute("aria-keyshortcuts")).toBe("Alt+O")
  expect(row("zoom-fit").querySelector("[data-keys]")!.textContent).toBe("Not set")
  expect(row("zoom-fit").hasAttribute("aria-keyshortcuts")).toBe(false)

  const clash = await page.agent.act({ steps: [{ ref: "Timeline shortcuts", action: "assign", args: ["Split clip", "alt+o"] }] })
  expect(clash.ok).toBe(false)
  expect(clash.error?.message).toContain("Alt+O already runs Mark out.")
  expect(row("split").querySelector("[data-keys]")!.textContent).toContain("Ctrl+K")
  const bad = await page.agent.act({ steps: [{ ref: "Timeline shortcuts", action: "assign", args: ["Split clip", "shift"] }] })
  expect(bad.ok).toBe(false)
  expect(bad.error?.message).toContain("has no main key")
})
