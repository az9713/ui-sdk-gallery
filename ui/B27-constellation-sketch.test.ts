import { checkServer, mount, setPlatform } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { starSky } from "./B27-constellation-sketch"

setPlatform("other")

// 4 stars on the corners of a box, in sky units. Vega to Deneb is drawn at the start.
const markup = `<root aria-label="Star chart"><star value="Vega" x="20" y="20">Vega</star><star value="Deneb" x="100" y="20">Deneb</star><star value="Altair" x="20" y="70">Altair</star><star value="Albireo" x="100" y="70">Albireo</star><undo>Undo</undo><redo>Redo</redo></root>`
const options = { defaultValue: ["Vega-Deneb"] }
type View = ReturnType<typeof mount<typeof starSky>>
const focused = () => document.activeElement?.textContent
const star = (view: View, name: string) => view.part("star", name)!

test("keyboard: the arrow keys move to the nearest star in their direction, and Home, End go to the first and last star", async () => {
  const view = mount(starSky, options, markup)
  try {
    await view.keys("Tab")
    expect(focused()).toBe("Vega")
    await view.keys("ArrowRight")
    expect(focused()).toBe("Deneb")
    await view.keys("ArrowDown")
    expect(focused()).toBe("Albireo")
    await view.keys("ArrowLeft")
    expect(focused()).toBe("Altair")
    await view.keys("ArrowUp")
    expect(focused()).toBe("Vega")
    await view.keys("End")
    expect(focused()).toBe("Albireo")
    await view.keys("Home")
    expect(focused()).toBe("Vega")
  } finally {
    view.unmount()
  }
})

test("keyboard: the stars are 1 tab stop, and each star is a named button", async () => {
  const view = mount(starSky, options, markup)
  try {
    await view.keys("Tab", "ArrowRight")
    const stars = [...view.root.querySelectorAll<HTMLElement>("[data-slot=star-sky-star]")]
    expect(stars.length).toBe(4)
    expect(stars.filter((el) => el.getAttribute("tabindex") === "0").map((el) => el.textContent)).toEqual(["Deneb"])
    for (const el of stars) {
      expect(el.getAttribute("role")).toBe("button")
      expect(el.getAttribute("aria-pressed")).toBe("false")
      expect(el.hasAttribute("data-anchor")).toBe(false)
    }
    expect(view.root.getAttribute("role")).toBe("group")
  } finally {
    view.unmount()
  }
})

test("keyboard: Space on a star starts a line, Space on a second star draws it, and Space or Escape on the start drops it", async () => {
  const view = mount(starSky, options, markup)
  try {
    await view.keys("Tab", "Space")
    expect(star(view, "Vega").getAttribute("aria-pressed")).toBe("true")
    expect(star(view, "Vega").hasAttribute("data-anchor")).toBe(true)
    expect(view.announced.join(" ")).toContain("Line starts at Vega.")
    await view.keys("ArrowDown", "Enter")
    expect(view.state.value).toEqual(["Vega-Deneb", "Vega-Altair"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
    expect(star(view, "Vega").getAttribute("aria-pressed")).toBe("false")

    await view.keys("Space", "Space")
    expect(view.state.anchor).toBe(null)
    expect(view.announced.at(-1)).toBe("Line dropped.")
    await view.keys("Space")
    expect(star(view, "Altair").getAttribute("aria-pressed")).toBe("true")
    await view.keys("Escape")
    expect(view.state.anchor).toBe(null)
    expect(star(view, "Altair").getAttribute("aria-pressed")).toBe("false")
    expect(view.state.value).toEqual(["Vega-Deneb", "Vega-Altair"])
  } finally {
    view.unmount()
  }
})

test("keyboard: a line that is already drawn, or from a star to itself, is not drawn again", async () => {
  const view = mount(starSky, options, markup)
  try {
    await view.keys("Tab", "Space", "ArrowRight", "Space")
    expect(view.state.value).toEqual(["Vega-Deneb"])
    expect(view.announced.at(-1)).toBe("Vega to Deneb is already drawn.")
    expect(() => view.api.drawLine("Deneb", "Vega")).toThrow("Deneb to Vega is already drawn.")
    expect(() => view.api.drawLine("Vega", "vega")).toThrow("A line needs 2 stars. Both ends are Vega.")
    expect(() => view.api.drawLine("Vega", "Sirius")).toThrow('No star "Sirius". Stars: Vega, Deneb, Altair, Albireo.')
    expect(view.state.value).toEqual(["Vega-Deneb"])
  } finally {
    view.unmount()
  }
})

test("keyboard: Control+Z undoes the last line, Control+Shift+Z redoes it, and the buttons follow", async () => {
  const view = mount(starSky, options, markup)
  const undo = () => view.part("undo")!
  const redo = () => view.part("redo")!
  try {
    expect(undo().getAttribute("aria-disabled")).toBe("true")
    expect(redo().getAttribute("aria-disabled")).toBe("true")
    await view.keys("Tab", "Space", "ArrowDown", "Space")
    expect(view.state.value).toEqual(["Vega-Deneb", "Vega-Altair"])
    expect(undo().hasAttribute("aria-disabled")).toBe(false)

    await view.keys("Control+z")
    expect(view.state.value).toEqual(["Vega-Deneb"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "undo", source: "keyboard" })
    expect(undo().getAttribute("aria-disabled")).toBe("true")
    expect(redo().hasAttribute("aria-disabled")).toBe(false)

    await view.keys("Control+Shift+z")
    expect(view.state.value).toEqual(["Vega-Deneb", "Vega-Altair"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "redo" })
    expect(redo().getAttribute("aria-disabled")).toBe("true")

    await view.click(undo())
    await view.click(undo())
    expect(view.state.value).toEqual(["Vega-Deneb"])
    await view.click(redo())
    expect(view.state.value).toEqual(["Vega-Deneb", "Vega-Altair"])
  } finally {
    view.unmount()
  }
})

test("pointer: a drag from a star to another star draws a line, and a drop on empty sky draws nothing", async () => {
  const view = mount(starSky, options, markup)
  try {
    await view.drag(star(view, "Vega"), { to: star(view, "Albireo") })
    expect(view.state.value).toEqual(["Vega-Deneb", "Vega-Albireo"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag" })
    expect(view.state.draft).toBe(null)
    await view.drag(star(view, "Deneb"), { by: { x: 150, y: 0 } })
    expect(view.state.value).toEqual(["Vega-Deneb", "Vega-Albireo"])
    expect(view.state.draft).toBe(null)
    expect(view.part("undo")!.hasAttribute("aria-disabled")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("server: the star chart renders with no DOM", () => {
  checkServer(starSky, options, markup)
})

// The stars sit where they are drawn on the sky, so Right is right on screen in both text directions.
test("direction: Left and Right move on the sky the same way in both text directions", async () => {
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(starSky, options, markup)
    try {
      await view.keys("Tab", "ArrowRight")
      expect(focused(), dir).toBe("Deneb")
      await view.keys("ArrowLeft")
      expect(focused(), dir).toBe("Vega")
    } finally {
      view.unmount()
      document.documentElement.dir = ""
    }
  }
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const canvasLabel = () => page.root.querySelector("canvas")!.getAttribute("aria-label")
const onPage = (name: string) => page.root.querySelector<HTMLElement>(`b27-star[value="${name}"]`)!

test("names: the page names the chart, each star, the drawing and the buttons", async () => {
  page = mountUI(ui)
  await settle()
  const chart = page.root.querySelector("b27-sky")!
  expect(chart.getAttribute("aria-label")).toBe("Star chart")
  expect(chart.getAttribute("role")).toBe("group")
  const stars = [...page.root.querySelectorAll("b27-star")]
  expect(stars.map((el) => el.textContent)).toEqual(["Meissa", "Betelgeuse", "Bellatrix", "Mintaka", "Alnilam", "Alnitak", "Saiph", "Rigel"])
  expect(stars.every((el) => el.getAttribute("role") === "button")).toBe(true)
  expect(page.root.querySelector("canvas")!.getAttribute("role")).toBe("img")
  expect(canvasLabel()).toBe("Chalk lines: Alnitak to Alnilam, Alnilam to Mintaka, Betelgeuse to Alnitak, Bellatrix to Mintaka.")
  expect([...page.root.querySelectorAll("[data-actions] button")].map((el) => el.textContent)).toEqual(["Undo", "Redo"])
  expect(page.root.querySelector("b27-undo button")!.getAttribute("aria-disabled")).toBe("true")
  expect(status()).toBe("4 lines on the chart.")
})

test("keyboard: on the page, Space draws a line, Control+Z and the Undo button undo it, and the status line reports each step", async () => {
  onPage("Betelgeuse").focus()
  await keys("Space")
  onPage("Bellatrix").focus()
  await keys("Space")
  expect(status()).toBe("Drew Betelgeuse to Bellatrix. 5 lines.")
  expect(canvasLabel()).toContain("Betelgeuse to Bellatrix")
  await keys("Control+z")
  expect(status()).toBe("Undid Betelgeuse to Bellatrix. 4 lines.")
  // A browser sends a capital Z with Shift held.
  await keys("Control+Shift+Z")
  expect(status()).toBe("Redid Betelgeuse to Bellatrix. 5 lines.")
  page.root.querySelector<HTMLElement>("b27-undo button")!.focus()
  await keys("Enter")
  expect(status()).toBe("Undid Betelgeuse to Bellatrix. 4 lines.")
  expect(canvasLabel()).not.toContain("Betelgeuse to Bellatrix")
})

test("agent: an agent finds the chart and its stars, draws a line, undoes and redoes it, and cannot draw a star that is not there", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const chart = page.live().find((entry) => entry.label === "Star chart")!
  expect(chart.actions).toEqual(["drawLine", "undo", "redo"])
  const found = await page.agent.query({ within: "Star chart" })
  expect(JSON.stringify(found)).toContain("Rigel")

  const result = await page.agent.act({
    steps: [
      { ref: "Star chart", action: "drawLine", args: ["Saiph", "Rigel"] },
      { ref: "Star chart", action: "undo" },
      { ref: "Star chart", action: "redo" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Redid Saiph to Rigel. 5 lines.")

  const wrong = await page.agent.act({ steps: [{ ref: "Star chart", action: "drawLine", args: ["Sirius", "Rigel"] }] })
  expect(wrong.ok).toBe(false)
  expect(wrong.error?.message).toContain('No star "Sirius"')
  const twice = await page.agent.act({ steps: [{ ref: "Star chart", action: "drawLine", args: ["Rigel", "Saiph"] }] })
  expect(twice.ok).toBe(false)
  expect(twice.error?.message).toContain("Rigel to Saiph is already drawn.")
  expect(status()).toBe("Redid Saiph to Rigel. 5 lines.")
})
