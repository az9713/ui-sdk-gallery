import { checkServer, mount } from "@ui-sdk/core/testing"
import { afterEach, expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui, { fontPicker } from "./B31-font-picker"

const markup = `<root aria-label="Typeface"><font value="a">Alpha</font><font value="b">Bravo</font><font value="c">Charlie</font></root>`
const options = { defaultValue: "a" }
type View = ReturnType<typeof mount<typeof fontPicker>>
const font = (view: View, key: string) => view.part("font", key)!
const previews = (view: View) => view.changes.filter((change) => change.key === "preview").map((change) => change.value)

const outside: HTMLElement[] = []
afterEach(() => outside.splice(0).forEach((el) => el.remove()))
const button = () => {
  const el = document.body.appendChild(document.createElement("button"))
  outside.push(el)
  return el
}

test("keyboard: the list is 1 tab stop on the chosen typeface", async () => {
  const view = mount(fontPicker, { defaultValue: "b" }, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(font(view, "b"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(font(view, "a").getAttribute("tabindex")).toBe("-1")
    expect(view.root.getAttribute("role")).toBe("listbox")
    expect(font(view, "b").getAttribute("role")).toBe("option")
    expect(font(view, "b").getAttribute("aria-selected")).toBe("true")
    expect(font(view, "a").getAttribute("aria-selected")).toBe("false")
  } finally {
    view.unmount()
  }
})

test("keyboard: the arrow keys preview a typeface and Enter keeps it", async () => {
  const view = mount(fontPicker, options, markup)
  try {
    await view.keys("Tab", "ArrowDown")
    expect(document.activeElement).toBe(font(view, "b"))
    expect(view.state.preview).toBe("b")
    expect(view.state.value).toBe("a")
    expect(font(view, "b").hasAttribute("data-previewing")).toBe(true)
    expect(font(view, "a").hasAttribute("data-previewing")).toBe(false)
    expect(view.changes.at(-1)).toMatchObject({ key: "preview", reason: "list-navigation", source: "keyboard" })
    await view.keys("ArrowDown")
    expect(view.state.preview).toBe("c")
    expect(view.state.value).toBe("a")
    await view.keys("ArrowUp", "ArrowUp")
    expect(document.activeElement).toBe(font(view, "a"))
    expect(view.state.preview).toBe(null)
    await view.keys("End")
    expect(view.state.preview).toBe("c")
    await view.keys("Enter")
    expect(view.state.value).toBe("c")
    expect(view.state.preview).toBe(null)
    expect(view.changes.filter((change) => change.key === "value").at(-1)).toMatchObject({ reason: "item-press", source: "keyboard" })
    expect(font(view, "c").getAttribute("aria-selected")).toBe("true")
    expect(font(view, "a").getAttribute("aria-selected")).toBe("false")
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
  } finally {
    view.unmount()
  }
})

test("keyboard: Space keeps the previewed typeface and Escape puts the poster back", async () => {
  const view = mount(fontPicker, options, markup)
  try {
    await view.keys("Tab", "ArrowDown", "Escape")
    expect(view.state.preview).toBe(null)
    expect(view.state.value).toBe("a")
    expect(document.activeElement).toBe(font(view, "b"))
    await view.keys("ArrowDown", "Space")
    expect(view.state.value).toBe("c")
    expect(view.state.preview).toBe(null)
    await view.keys("Home")
    expect(document.activeElement).toBe(font(view, "a"))
    expect(view.state.value).toBe("c")
  } finally {
    view.unmount()
  }
})

test("keyboard: leaving the list puts the poster back to the chosen typeface", async () => {
  const view = mount(fontPicker, options, markup)
  const next = button()
  try {
    await view.keys("Tab", "ArrowDown")
    expect(view.state.preview).toBe("b")
    next.focus()
    await settle()
    expect(view.state.preview).toBe(null)
    expect(view.state.value).toBe("a")
    expect(previews(view).at(-1)).toBe(null)
    expect(view.changes.filter((change) => change.key === "preview").at(-1)).toMatchObject({ reason: "focus-out" })
  } finally {
    view.unmount()
  }
})

test("keyboard: hover previews a typeface and a click keeps it", async () => {
  const view = mount(fontPicker, options, markup)
  try {
    await view.hover(font(view, "b"))
    expect(view.state.preview).toBe("b")
    expect(view.state.value).toBe("a")
    await view.hover(font(view, "c"))
    expect(view.state.preview).toBe("c")
    await view.click(font(view, "c"))
    expect(view.state.value).toBe("c")
    expect(view.state.preview).toBe(null)
    expect(font(view, "c").getAttribute("aria-selected")).toBe("true")
  } finally {
    view.unmount()
  }
})

test("keyboard: the chosen typeface does not show as a preview", async () => {
  const view = mount(fontPicker, options, markup)
  try {
    await view.hover(font(view, "a"))
    expect(view.state.preview).toBe(null)
  } finally {
    view.unmount()
  }
})

test("server: the font picker renders with no DOM", () => {
  checkServer(fontPicker, options, markup)
})

test("direction: Up and Down act the same in left to right and right to left", async () => {
  const seen: string[] = []
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(fontPicker, options, markup)
    try {
      await view.keys("Tab", "ArrowDown", "ArrowDown", "ArrowUp")
      expect(document.activeElement).toBe(font(view, "b"))
      expect(view.state.preview).toBe("b")
      seen.push(`${dir}:${view.state.preview}`)
      await view.keys("Enter")
      expect(view.state.value).toBe("b")
    } finally {
      view.unmount()
      document.documentElement.dir = ""
    }
  }
  expect(seen).toEqual(["ltr:b", "rtl:b"])
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const poster = () => page.root.querySelector<HTMLElement>("[data-poster]")!
const option = (label: string) => [...page.root.querySelectorAll<HTMLElement>("b31-font")].find((el) => el.textContent === label)!

test("names: the page names the list and each typeface, and the poster starts in Arial Black", async () => {
  page = mountUI(ui)
  await settle()
  const list = page.root.querySelector("b31-font-picker")!
  expect(list.getAttribute("aria-label")).toBe("Poster typeface")
  expect(list.getAttribute("role")).toBe("listbox")
  expect([...page.root.querySelectorAll("b31-font")].map((el) => el.textContent)).toEqual([
    "Arial Black",
    "Impact",
    "Georgia",
    "Courier New",
    "Trebuchet MS",
    "Times New Roman",
    "Verdana",
    "Palatino",
  ])
  expect(tabbable(page.root).length).toBe(1)
  expect(status()).toBe("Poster set in Arial Black.")
  expect(poster().getAttribute("data-font")).toBe("arial-black")
})

test("keyboard: on the page, the arrow keys preview on the poster and Escape puts it back", async () => {
  option("Arial Black").focus()
  await keys("ArrowDown")
  expect(status()).toBe("Previewing Impact.")
  expect(poster().getAttribute("data-font")).toBe("impact")
  expect(option("Impact").hasAttribute("data-previewing")).toBe(true)
  await keys("ArrowDown")
  expect(status()).toBe("Previewing Georgia.")
  expect(poster().getAttribute("data-font")).toBe("georgia")
  await keys("Escape")
  expect(status()).toBe("Poster set in Arial Black.")
  expect(poster().getAttribute("data-font")).toBe("arial-black")
})

test("keyboard: on the page, Enter keeps a typeface and Space keeps another", async () => {
  option("Arial Black").focus()
  await keys("ArrowDown", "Enter")
  expect(status()).toBe("Poster set in Impact.")
  expect(poster().getAttribute("data-font")).toBe("impact")
  expect(option("Impact").getAttribute("aria-selected")).toBe("true")
  await keys("ArrowDown", "ArrowDown", "Space")
  expect(status()).toBe("Poster set in Courier New.")
  expect(poster().getAttribute("data-font")).toBe("courier")
  expect(tabbable(page.root).length).toBe(1)
})

test("keyboard: on the page, leaving the list puts the poster back", async () => {
  option("Courier New").focus()
  await keys("ArrowDown")
  expect(status()).toBe("Previewing Trebuchet MS.")
  const away = button()
  away.focus()
  await settle()
  expect(status()).toBe("Poster set in Courier New.")
  expect(poster().getAttribute("data-font")).toBe("courier")
})

test("visual: a change of typeface plays the kinetic type, and the first draw does not", async () => {
  const letters = [...poster().querySelectorAll<HTMLElement>("[data-letter]")]
  expect(letters.length).toBe(11)
  option("Courier New").focus()
  await keys("ArrowUp")
  expect(letters.some((el) => el.style.opacity === "0")).toBe(true)
  await keys("Escape")
})

test("agent: an agent peeks at a typeface, puts the poster back, and keeps another", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const list = page.live().find((entry) => entry.label === "Poster typeface")!
  expect(list.actions).toEqual(["peek", "pick", "reset"])
  const found = await page.agent.query({ within: "Poster typeface" })
  expect(JSON.stringify(found)).toContain("Verdana")

  const peek = await page.agent.act({ steps: [{ ref: "Poster typeface", action: "peek", args: ["Georgia"] }] })
  expect(peek.ok, peek.error?.message).toBe(true)
  expect(status()).toBe("Previewing Georgia.")
  expect(poster().getAttribute("data-font")).toBe("georgia")
  expect(option("Georgia").getAttribute("aria-selected")).toBe("false")

  const reset = await page.agent.act({ steps: [{ ref: "Poster typeface", action: "reset" }] })
  expect(reset.ok, reset.error?.message).toBe(true)
  expect(poster().getAttribute("data-font")).toBe("courier")

  const bad = await page.agent.act({ steps: [{ ref: "Poster typeface", action: "pick", args: ["Comic Sans"] }] })
  expect(bad.ok).toBe(false)
  expect(poster().getAttribute("data-font")).toBe("courier")

  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Poster set in Impact.")
  expect(option("Impact").getAttribute("aria-selected")).toBe("true")
  expect(ui.task!.done(page.root)).toBe(true)
})

test("visual: with reduced motion a change shows its end state at once", async () => {
  const section = document.body.appendChild(document.createElement("section"))
  const saved = window.matchMedia
  window.matchMedia = ((query: string) => ({ matches: true, media: query })) as unknown as typeof window.matchMedia
  try {
    ui.mount(section, { agent: page.agent, ask: async () => false })
    await settle()
    const letters = [...section.querySelectorAll<HTMLElement>("[data-letter]")]
    section.querySelector<HTMLElement>("b31-font[value=verdana]")!.focus()
    await keys("ArrowUp")
    expect(section.querySelector("[data-poster]")!.getAttribute("data-font")).toBe("times")
    expect(letters.every((el) => el.style.opacity === "")).toBe(true)
  } finally {
    window.matchMedia = saved
    section.remove()
  }
})
