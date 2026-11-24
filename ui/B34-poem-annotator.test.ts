import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test, vi } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { annotator } from "./B34-poem-annotator"

// 4 lines. Line starts: 0, 18, 31, 41. The text ends at 56.
const LINES = ["Hope is the thing", "That perches", "And sings", "And never stops"]
const markup = `<root aria-label="Poem"><poem aria-label="Lines">${LINES.map((line, i) => `<line value="${i + 1}">${line}</line>`).join("")}</poem><toolbar><span data-arrow></span></toolbar></root>`
const options = { lines: LINES }
type View = ReturnType<typeof mount<typeof annotator>>

// jsdom has no Range.getBoundingClientRect. A range's box is 40 px lower for each line it starts on.
Range.prototype.getBoundingClientRect = function () {
  const node = this.startContainer
  const el = node instanceof Element ? node : node.parentElement
  const line = el?.closest<HTMLElement>("[data-slot=poem-annotator-line]")
  const y = 100 + 40 * (line ? [...line.parentElement!.children].indexOf(line) : 0)
  return { x: 300, y, width: 120, height: 32, top: y, left: 300, right: 420, bottom: y + 32, toJSON: () => ({}) } as DOMRect
}

const line = (view: View, n: number) => view.part("line", String(n))!
const selected = (root: ParentNode) => [...root.querySelectorAll("[data-sel]")].map((el) => el.textContent).join("|")
// In mount(), an absent part is a detached node that is not hidden.
const shown = (el: HTMLElement | undefined) => !!el && el.isConnected && !el.hidden
const inset = (el: HTMLElement) => (/inset: (-?[\d.]+)px auto auto (-?[\d.]+)px/.exec(el.getAttribute("style") ?? "") ?? []).slice(1).map(Number)
// The toolbar's box is where its inset puts it, 200 x 40 px, so position() can measure what it placed.
const measured = (el: HTMLElement) => {
  el.getBoundingClientRect = () => {
    const [y = 0, x = 0] = inset(el)
    return { x, y, width: 200, height: 40, top: y, left: x, right: x + 200, bottom: y + 40, toJSON: () => ({}) } as DOMRect
  }
  Object.defineProperty(el, "offsetWidth", { value: 200 })
  Object.defineProperty(el, "offsetHeight", { value: 40 })
  return el
}
const frames = () => new Promise((resolve) => setTimeout(resolve, 80))

test("keyboard: the poem is 1 tab stop, and Up, Down, Home and End move between lines", async () => {
  const view = mount(annotator, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(line(view, 1))
    await view.keys("ArrowDown", "ArrowDown")
    expect(document.activeElement).toBe(line(view, 3))
    await view.keys("End")
    expect(document.activeElement).toBe(line(view, 4))
    await view.keys("Home", "ArrowUp")
    expect(document.activeElement).toBe(line(view, 1))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(view.state.range).toBe(null)
    expect(line(view, 1).getAttribute("aria-selected")).toBe("false")
  } finally {
    view.unmount()
  }
})

test("keyboard: Space and Enter select the focused line", async () => {
  const view = mount(annotator, options, markup)
  try {
    expect(shown(view.part("toolbar"))).toBe(false)
    await view.keys("Tab", "Space")
    expect(view.state.range).toEqual({ from: 0, to: 17 })
    expect(view.changes.at(-1)).toMatchObject({ key: "range", reason: "item-press", source: "keyboard" })
    expect(line(view, 1).getAttribute("aria-selected")).toBe("true")
    expect(line(view, 1).hasAttribute("data-selected")).toBe(true)
    expect(selected(view.root)).toBe("Hope is the thing")
    expect(shown(view.part("toolbar"))).toBe(true)
    await view.keys("ArrowDown", "Enter")
    expect(view.state.range).toEqual({ from: 18, to: 30 })
    expect(line(view, 1).getAttribute("aria-selected")).toBe("false")
    expect(line(view, 2).getAttribute("aria-selected")).toBe("true")
  } finally {
    view.unmount()
  }
})

test("keyboard: Shift with Down or Up extends the selection by whole lines", async () => {
  const view = mount(annotator, options, markup)
  try {
    await view.keys("Tab", "ArrowDown", "Space", "Shift+ArrowDown", "Shift+ArrowDown")
    expect(document.activeElement).toBe(line(view, 4))
    expect(view.state.range).toEqual({ from: 18, to: 56 })
    expect(view.changes.at(-1)).toMatchObject({ key: "range", reason: "list-navigation" })
    expect(selected(view.root)).toBe("That perches|And sings|And never stops")
    await view.keys("Shift+ArrowUp", "Shift+ArrowUp", "Shift+ArrowUp")
    expect(view.state.range).toEqual({ from: 0, to: 30 })
    expect([1, 2, 3, 4].map((n) => line(view, n).getAttribute("aria-selected"))).toEqual(["true", "true", "false", "false"])
  } finally {
    view.unmount()
  }
})

test("keyboard: Escape clears the selection and the toolbar leaves", async () => {
  const view = mount(annotator, { ...options, defaultRange: { from: 5, to: 11 } }, markup)
  try {
    expect(shown(view.part("toolbar"))).toBe(true)
    expect(selected(view.root)).toBe("is the")
    await view.keys("Tab", "Escape")
    expect(view.state.range).toBe(null)
    expect(view.changes.at(-1)).toMatchObject({ key: "range", reason: "escape-key", source: "keyboard" })
    expect(shown(view.part("toolbar"))).toBe(false)
    expect(selected(view.root)).toBe("")
    // With nothing selected, Escape is left to the page.
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    line(view, 1).dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: the toolbar sits against the selected text and follows it", async () => {
  const view = mount(annotator, { ...options, defaultRange: { from: 5, to: 11 } }, markup)
  try {
    // jsdom's viewport is 0 px wide, which pushes any popup against its edge.
    Object.defineProperty(document.documentElement, "clientWidth", { value: 1024, configurable: true })
    Object.defineProperty(document.documentElement, "clientHeight", { value: 768, configurable: true })
    const bar = measured(view.part("toolbar")!)
    await frames()
    expect(bar.getAttribute("data-side")).toBe("top")
    expect(bar.getAttribute("data-align")).toBe("center")
    expect(bar.style.position).toBe("fixed")
    // The text box of line 1 is x 300, y 100, 120 x 32. Centered above it with a 10 px gap: x 260, y 50.
    expect(inset(bar)).toEqual([50, 260])
    await view.keys("Tab", "ArrowDown", "ArrowDown", "Space")
    await frames()
    expect(inset(bar)).toEqual([130, 260])
    await view.keys("ArrowUp", "ArrowUp", "Space")
    await frames()
    expect(inset(bar)).toEqual([50, 260])
  } finally {
    view.unmount()
    for (const key of ["clientWidth", "clientHeight"]) delete (document.documentElement as unknown as Record<string, number>)[key]
  }
})

test("pointer: a drag across words becomes the selection, and a click clears it", async () => {
  const view = mount(annotator, options, markup)
  try {
    const selection = document.getSelection()!
    const range = document.createRange()
    range.setStart(line(view, 1).firstChild!, 5)
    range.setEnd(line(view, 2).firstChild!, 4)
    selection.removeAllRanges()
    selection.addRange(range)
    view.part("poem")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }))
    expect(view.state.range).toEqual({ from: 5, to: 22 })
    expect(view.changes.at(-1)).toMatchObject({ key: "range", reason: "text-select" })
    expect(selected(view.root)).toBe("is the thing|That")
    expect(selection.rangeCount).toBe(0)
    expect(shown(view.part("toolbar"))).toBe(true)
    // Spaces at the ends of a drag are left out.
    view.api.deselect()
    range.setStart(line(view, 1).firstChild!, 4)
    range.setEnd(line(view, 1).firstChild!, 8)
    selection.addRange(range)
    view.part("poem")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }))
    expect(view.state.range).toEqual({ from: 5, to: 7 })
    // A click leaves a collapsed selection, which selects nothing.
    selection.collapse(line(view, 3).firstChild!, 2)
    view.part("poem")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }))
    expect(view.state.range).toBe(null)
    expect(shown(view.part("toolbar"))).toBe(false)
  } finally {
    view.unmount()
  }
})

test("visual: a mark is drawn on its words, only a new mark fades in, and not with reduced motion", async () => {
  const animate = vi.fn()
  Element.prototype.animate = animate as unknown as Element["animate"]
  try {
    const view = mount(annotator, { ...options, defaultValue: [{ kind: "sound", from: 0, to: 4 }], defaultRange: { from: 12, to: 17 } }, markup)
    await view.settle()
    expect(line(view, 1).querySelector("mark[data-kind=sound]")!.textContent).toBe("Hope")
    expect(animate).not.toHaveBeenCalled()
    view.api.annotate("imagery")
    expect(line(view, 1).querySelector("mark[data-kind=imagery]")!.textContent).toBe("thing")
    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate.mock.calls[0][0][0]).toEqual({ backgroundColor: "transparent" })
    expect(view.state.range).toBe(null)
    expect(view.state.value).toEqual([
      { kind: "sound", from: 0, to: 4 },
      { kind: "imagery", from: 12, to: 17 },
    ])
    expect(() => view.api.annotate("rhyme")).toThrow('No kind "rhyme". Kinds: imagery, sound, theme.')
    expect(() => view.api.annotate("theme")).toThrow("Select some text of the poem first.")
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia
    view.api.select("never stops")
    view.api.annotate("Theme")
    expect(line(view, 4).querySelector("mark[data-kind=theme]")!.textContent).toBe("never stops")
    expect(animate).toHaveBeenCalledTimes(1)
    view.api.select("hope IS")
    view.api.erase()
    expect(view.state.value).toEqual([
      { kind: "imagery", from: 12, to: 17 },
      { kind: "theme", from: 45, to: 56 },
    ])
    view.unmount()
  } finally {
    delete (Element.prototype as Partial<Element>).animate
    delete (window as Partial<Window>).matchMedia
  }
})

test("server: the poem renders with no DOM", () => {
  checkServer(annotator, { ...options, defaultRange: { from: 0, to: 4 } }, markup)
})

test("direction: the lines are vertical, so right to left changes nothing", async () => {
  const results: unknown[] = []
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(annotator, options, markup)
    await view.keys("Tab", "ArrowDown", "Space", "Shift+ArrowDown", "ArrowRight", "ArrowLeft")
    results.push({ range: view.state.range, focus: document.activeElement?.textContent })
    view.unmount()
  }
  document.documentElement.dir = ""
  expect(results[0]).toEqual({ range: { from: 18, to: 40 }, focus: "And sings" })
  expect(results[1]).toEqual(results[0])
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const bar = () => page.root.querySelector<HTMLElement>("b34-toolbar")!

test("names: the page names the poem, its lines, the toolbar and its buttons", async () => {
  page = mountUI(ui)
  await settle()
  const root = page.root.querySelector("b34-annotator")!
  expect(root.getAttribute("role")).toBe("group")
  expect(root.getAttribute("aria-label")).toBe("Poem")
  expect(page.root.querySelector("b34-poem")!.getAttribute("role")).toBe("listbox")
  expect(page.root.querySelectorAll("b34-line[role=option]").length).toBe(12)
  expect(bar().hidden).toBe(false)
  expect([...bar().querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Imagery", "Sound", "Theme", "Clear"])
  expect(status()).toBe("Selected “thing with feathers”.")
  expect(selected(page.root)).toBe("thing with feathers")
  expect(page.root.querySelectorAll("b34-line mark").length).toBe(3)
  expect([...page.root.querySelectorAll("[data-count]")].map((b) => b.textContent)).toEqual(["1", "1", "1"])
})

test("keyboard: on the page, Tab goes into the toolbar, a button marks the text, and focus goes back to the line", async () => {
  const lines = page.root.querySelectorAll<HTMLElement>("b34-line")
  lines[0].focus()
  await keys("ArrowDown", "Space")
  expect(status()).toBe("Selected “That perches in the soul –”.")
  await keys("Tab")
  expect(document.activeElement!.textContent).toBe("Imagery")
  await keys("ArrowRight", "Enter")
  expect(status()).toBe("Marked “That perches in the soul –” as sound.")
  expect(bar().hidden).toBe(true)
  expect(document.activeElement).toBe(lines[1])
  expect(page.root.querySelector('[data-count="sound"]')!.textContent).toBe("2")
  await keys("Space", "Tab", "Escape")
  expect(status()).toBe("No text is selected.")
  expect(document.activeElement).toBe(lines[1])
})

test("agent: an agent selects a phrase, presses Imagery in the toolbar, and gets an error for a phrase not in the poem", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const poem = page.live().find((entry) => entry.label === "Poem")!
  expect([...poem.actions].sort()).toEqual(["annotate", "deselect", "erase", "select"])
  const found = await page.agent.query({ within: "Poem", text: "soul" })
  expect(JSON.stringify(found)).toContain("That perches in the soul –")

  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(ui.task!.done(page.root)).toBe(true)
  expect(page.root.querySelector('[data-count="imagery"]')!.textContent).toBe("2")

  const wrong = await page.agent.act({ steps: [{ ref: "Poem", action: "select", args: ["golden bough"] }] })
  expect(wrong.ok).toBe(false)
  expect(wrong.error?.message).toContain('No "golden bough" in the poem.')

  const cleared = await page.agent.act({
    steps: [
      { ref: "Poem", action: "select", args: ["perches in the soul"] },
      { ref: "Selection tools", action: "press", args: ["Clear"] },
    ],
  })
  expect(cleared.ok, cleared.error?.message).toBe(true)
  expect(status()).toBe("Cleared 2 marks.")
})
