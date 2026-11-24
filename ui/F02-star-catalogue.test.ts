import { afterAll, expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./F02-star-catalogue"

const getContext = HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = (() => null) as never
Element.prototype.scrollTo = function () {}

type Box = HTMLElement & { value: string | null; api: { setValue(value: string): boolean } }

const { root, agent, live } = mountUI(ui)
const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!
const status = () => q("[data-status]").textContent
const combobox = () => q<Box>("ui-combobox")
const input = () => q<HTMLInputElement>("ui-combobox-input input")
const content = () => q("ui-combobox-content")
const items = () => [...root.querySelectorAll<HTMLElement>("ui-combobox-item")]
const shown = () => items().filter((item) => !item.hidden).map((item) => item.getAttribute("label"))
const highlighted = () => items().filter((item) => item.hasAttribute("data-highlighted")).map((item) => item.getAttribute("value"))
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const opened: boolean[] = []
combobox().addEventListener("openchange", (event) => opened.push((event as CustomEvent<{ value: boolean }>).detail.value))

async function search(text: string) {
  input().value = text
  input().dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
}

async function reset() {
  if (!content().hidden) {
    input().focus()
    await keys("Escape")
  }
  combobox().api.setValue("sun")
  await settle()
  opened.length = 0
}

afterAll(() => {
  root.remove()
  HTMLCanvasElement.prototype.getContext = getContext
})

test("names: the star list, its trigger and the plot have names, and the Sun is selected at the start", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const entry = live().find((e) => e.label === "Star")!
  expect(entry.component).toBe("combobox")
  expect(entry.value).toBe("sun")
  expect(entry.actions).toContain("setValue")
  expect(q("ui-combobox-trigger button").getAttribute("aria-label")).toBe("Show stars")
  expect(input().value).toBe("Sun")
  expect(q("canvas").getAttribute("role")).toBe("img")
  expect(q("canvas").getAttribute("aria-label")).toBe(
    "Hertzsprung-Russell diagram of 5,000 stars. Highlighted: Sun: G2 V, 5,770 K, luminosity of 1 Sun.",
  )
  expect(status()).toBe("Sun: G2 V, 5,770 K, luminosity of 1 Sun. The list opened 0 times.")
  expect(ui.task!.done(root)).toBe(false)
})

test("agent: query finds a star among 5,000 without opening the list, and setValue selects it while the list stays closed", async () => {
  const all = await agent.query({ within: "Star" })
  if ("error" in all) throw new Error(all.error)
  expect(all[0].items).toHaveLength(50)
  expect(all[0].more).toBe(4950)

  const found = await agent.query({ within: "Star", text: "Vega" })
  if ("error" in found) throw new Error(found.error)
  expect(found[0].items).toEqual([{ value: "vega", label: "Vega" }])
  expect(content().hidden).toBe(true)

  const result = await agent.act({ steps: [{ ref: "Star", action: "setValue", args: [found[0].items![0].value] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(combobox().value).toBe("vega")
  expect(content().hidden).toBe(true)
  expect(opened).toEqual([])
  expect(status()).toBe("Vega: A0 V, 9,600 K, luminosity of 40 Suns. The list opened 0 times.")
  expect(q("canvas").getAttribute("aria-label")).toContain("Highlighted: Vega: A0 V")
  await reset()
})

test("agent: the scripted task names the star by its label, the list stays closed, and the snapshot stays small", async () => {
  expect(ui.task!.done(root)).toBe(false)
  const result = await agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(opened).toEqual([])
  expect(content().hidden).toBe(true)
  expect(ui.task!.done(root)).toBe(true)
  const snapshot = live().find((e) => e.label === "Star")!
  expect(snapshot.value).toBe("vega")
  expect(JSON.stringify(snapshot).length).toBeLessThan(1000)
  await reset()
})

test("agent: a star that is not in the catalogue is refused, and the selection stays", async () => {
  const result = await agent.act({ steps: [{ ref: "Star", action: "setValue", args: ["Tatooine"] }] })
  expect(result.ok).toBe(false)
  expect(combobox().value).toBe("sun")
  expect(status()).toContain("Sun: G2 V")
  await reset()
})

test("agent: clear empties the star, and the status and the plot say that no star is selected", async () => {
  const result = await agent.act({ steps: [{ ref: "Star", action: "clear" }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(combobox().value).toBeNull()
  expect(status()).toBe("No star is selected. The list opened 0 times.")
  expect(q('[data-fact="spectral"]').textContent).toBe("None")
  expect(q("canvas").getAttribute("aria-label")).toBe("Hertzsprung-Russell diagram of 5,000 stars. No star is selected.")
  await reset()
  expect(status()).toContain("Sun: G2 V")
})

test("keyboard: the star list is 1 tab stop, and only the rows near the scroll position render", async () => {
  expect(tabbable(root)).toEqual([input()])
  expect(input().getAttribute("role")).toBe("combobox")
  expect(input().getAttribute("aria-expanded")).toBe("false")
  expect(items().length).toBeGreaterThan(0)
  expect(items().length).toBeLessThan(20)
})

test("keyboard: typing opens the list with the matching stars, and ArrowDown then Enter chooses one and closes it", async () => {
  input().focus()
  await search("vega")
  expect(content().hidden).toBe(false)
  expect(input().getAttribute("aria-expanded")).toBe("true")
  expect(shown()).toEqual(["Vega"])
  await keys("ArrowDown")
  expect(highlighted()).toEqual(["vega"])
  await keys("Enter")
  expect(combobox().value).toBe("vega")
  expect(content().hidden).toBe(true)
  expect(input().value).toBe("Vega")
  expect(status()).toBe("Vega: A0 V, 9,600 K, luminosity of 40 Suns. The list opened 1 time.")
  expect(q('[data-fact="spectral"]').textContent).toBe("A0 V")
  expect(q('[data-fact="kind"]').textContent).toBe("Main sequence")
  expect(q('[data-fact="opens"]').textContent).toBe("1 time")
  await reset()
})

test("keyboard: ArrowDown and ArrowUp move the highlight through the first rows, and Escape closes the list and keeps the star", async () => {
  input().focus()
  await keys("ArrowDown")
  expect(content().hidden).toBe(false)
  const down: (string | null)[] = []
  for (let i = 0; i < 3; i++) {
    await keys("ArrowDown")
    down.push(highlighted()[0])
  }
  await keys("ArrowUp")
  expect(new Set(down).size).toBe(3)
  expect(highlighted()).toEqual([down[1]])
  await keys("Escape")
  expect(content().hidden).toBe(true)
  expect(combobox().value).toBe("sun")
  await reset()
})

test("keyboard: a query that matches no star shows the empty message", async () => {
  input().focus()
  await search("zzz")
  expect(shown()).toEqual([])
  expect(q("ui-combobox-empty").hidden).toBe(false)
  await search("")
  await reset()
})

// A 2D context that records the calls, so the frames of the highlight can be counted.
async function frames(reduce: boolean) {
  const calls: string[] = []
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) =>
      key in target ? target[key] : key === "measureText" ? () => ({ width: 40 }) : () => void calls.push(String(key)),
    set: (target, key, value) => ((target[key] = value), true),
  })
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never
  window.matchMedia = ((query: string) => ({ matches: reduce && query.includes("reduce") })) as never
  const other = document.body.appendChild(document.createElement("section"))
  ui.mount(other, { agent, ask: async () => true })
  await settle()
  const count = () => calls.filter((call) => call === "drawImage").length
  const first = count()
  other.querySelector<Box>("ui-combobox")!.api.setValue("rigel")
  await settle()
  await wait(150)
  const after = count()
  other.remove()
  HTMLCanvasElement.prototype.getContext = (() => null) as never
  delete (window as { matchMedia?: unknown }).matchMedia
  return { first, after }
}

test("motion: with reduced motion, a new star is drawn in 1 frame, and without it the ring animates", async () => {
  const still = await frames(true)
  expect(still.first).toBe(1)
  expect(still.after).toBe(2)
  const moving = await frames(false)
  expect(moving.first).toBe(1)
  expect(moving.after).toBeGreaterThan(3)
})
