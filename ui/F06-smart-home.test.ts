import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./F06-smart-home"

type Tool = { name: string; annotations: Record<string, boolean>; execute: (input: object, client: object) => Promise<unknown> }

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const device = (key: string) => root.querySelector<SVGGElement>(`[data-device="${key}"]`)!
const control = (key: string) => root.querySelector<HTMLElement>(`[data-control="${key}"]`)!
const thumb = (key: string) => control(key).querySelector<HTMLElement>("[data-slot=slider-thumb-input]")!
const button = (text: string) => [...root.querySelectorAll<HTMLElement>("ui-button button")].find((b) => b.textContent === text)!
const toolNames = () => [...root.querySelectorAll("[data-tools] code")].map((c) => c.textContent)
const logLines = () => [...root.querySelectorAll("[data-log] li")].map((li) => li.textContent)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const mock = () => (document as unknown as { modelContext: { registerTool: unknown } }).modelContext
// The probe of the mock: each registered tool, as registerTools gave it.
const registered = () => {
  const seen = new Map<string, Tool>()
  const real = mock().registerTool as (tool: Tool, options: { signal: AbortSignal }) => Promise<void>
  return { seen, wrap: (tool: Tool, options: { signal: AbortSignal }) => (seen.set(tool.name, tool), real(tool, options)) }
}

test("names: each device, the WebMCP switch and each request has the name that the page shows", async () => {
  await wait(80)
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Living room lamp", "Kitchen lights", "Front door lock", "Thermostat", "Bedroom blinds", "WebMCP tools", "Evening scene", "Leave for work", "Let the courier in", "Read the house"])
    expect(labels, `${label} is not in the snapshot`).toContain(label)
})

test("webmcp: registerTools puts snapshot, act and query on the mock document.modelContext at mount, with their hints", () => {
  expect(toolNames()).toEqual(["snapshot", "act", "query"])
  expect(root.querySelector("[data-count]")!.textContent).toBe("3 tools")
  const hints = [...root.querySelectorAll("[data-tools] li")].map((li) => li.querySelector(".f06-hint")!.textContent)
  expect(hints).toEqual(["read-only, untrusted content", "untrusted content, consequential", "read-only, untrusted content"])
})

test("visual: the opening snapshot call makes each of the 5 devices glow teal on the isometric plan", () => {
  const svg = root.querySelector("svg.f06-svg")!
  expect(svg.getAttribute("aria-hidden")).toBe("true")
  expect(svg.querySelectorAll("[data-device]")).toHaveLength(5)
  expect([...svg.querySelectorAll("[data-device]")].map((g) => g.getAttribute("data-glow"))).toEqual(["read", "read", "read", "read", "read"])
  expect(logLines()[0]).toMatch(/^Read the house: snapshot read \d+ components\.$/)
  expect([...root.querySelectorAll(".f06-room")].map((r) => r.textContent)).toEqual(["Living room", "Kitchen", "Bedroom", "Hall"])
  expect(device("kitchen").getAttribute("data-on")).toBe("true")
  expect(device("lamp").getAttribute("data-on")).toBe("false")
})

test("agent: the scripted task turns the kitchen off, then the browser agent's act tool runs the evening scene", async () => {
  expect(ui.task!.done(root)).toBe(false)
  const outcome = await agent.act({ steps: ui.task!.steps })
  expect(outcome.ok, outcome.error?.message).toBe(true)
  for (let i = 0; i < 20; i++) await Promise.resolve()
  expect(ui.task!.done(root)).toBe(true)
  await wait(600)
  expect(device("kitchen").getAttribute("data-glow")).toBeNull()
  for (const key of ["lamp", "blinds", "thermostat"]) {
    expect(device(key).getAttribute("data-glow")).toBe("act")
    expect(device(key).getAttribute("data-via")).toBe("tool")
  }
  expect(device("blinds").getAttribute("data-level")).toBe("20")
  expect(root.querySelector('[data-read="blinds"]')!.textContent).toBe("20% open")
  expect(status()).toBe("Browser agent set Thermostat to 21 °C through the WebMCP act tool.")
  expect(logLines()[0]).toBe("Evening scene: act ran 3 steps.")
})

test("agent: the act tool's allow refuses the front door lock, and the lock stays locked", async () => {
  button("Let the courier in").click()
  await settle()
  expect(status()).toBe("registerTools allow refused setChecked on Front door lock.")
  expect(device("lock").getAttribute("data-on")).toBe("true")
  await wait(600)
  expect(logLines()[0]).toMatch(/^Let the courier in: act stopped\. The app refused setChecked on c\d+\.$/)
})

test("agent: unregistering aborts each tool so the mock holds 0, and the re-registered act tool changes a device and refuses the WebMCP switch and a request button", async () => {
  const probe = registered()
  ;(mock() as { registerTool: unknown }).registerTool = probe.wrap
  const off = await agent.act({ steps: [{ ref: "WebMCP tools", action: "setChecked", args: [false] }] })
  expect(off.ok, off.error?.message).toBe(true)
  expect(toolNames()).toEqual([])
  expect(status()).toBe("The cleanup aborted 3 tool signals. document.modelContext holds 0 tools.")
  button("Read the house").click()
  await settle()
  expect(status()).toBe("Read the house: document.modelContext has no snapshot tool.")

  const on = await agent.act({ steps: [{ ref: "WebMCP tools", action: "setChecked", args: [true] }] })
  expect(on.ok, on.error?.message).toBe(true)
  expect(toolNames()).toEqual(["snapshot", "act", "query"])
  expect(status()).toBe("registerTools put snapshot, act, query on document.modelContext.")
  const act = probe.seen.get("act")!
  expect(act.annotations).toMatchObject({ readOnlyHint: false, consequentialHint: true })
  const result = (await act.execute({ steps: [{ ref: "Thermostat", action: "setValue", args: [24] }] }, {})) as { ok: boolean }
  expect(result.ok).toBe(true)
  expect(device("thermostat").getAttribute("data-level")).toBe("24")
  expect(status()).toBe("Browser agent set Thermostat to 24 °C through the WebMCP act tool.")
  const refused = (await act.execute({ steps: [{ ref: "WebMCP tools", action: "setChecked", args: [false] }] }, {})) as { ok: boolean }
  expect(refused.ok).toBe(false)
  expect(status()).toBe("registerTools allow refused setChecked on WebMCP tools.")
  expect(toolNames()).toEqual(["snapshot", "act", "query"])
  const pressed = (await act.execute({ steps: [{ ref: "Evening scene", action: "press" }] }, {})) as { ok: boolean }
  expect(pressed.ok).toBe(false)
  expect(status()).toBe("registerTools allow refused press on Evening scene.")
  const query = (await probe.seen.get("query")!.execute({ text: "Thermostat" }, {})) as { label: string; value: number }[]
  expect(query.map((entry) => [entry.label, entry.value])).toEqual([["Thermostat", 24]])
})

test("agent: a tool step that sets the value a device already has leaves no glow and no tool mark", async () => {
  button("Evening scene").click()
  await wait(600)
  expect(device("thermostat").getAttribute("data-glow")).toBe("act")
  button("Evening scene").click()
  await wait(600)
  expect(logLines()[0]).toBe("Evening scene: act ran 3 steps.")
  expect(root.querySelectorAll("[data-glow]")).toHaveLength(0)
  const outcome = await agent.act({ steps: [{ ref: "Thermostat", action: "setValue", args: [20] }] })
  expect(outcome.ok, outcome.error?.message).toBe(true)
  expect(status()).toBe("Page agent set Thermostat to 20 °C.")
})

test("agent: a change by the page agent is not a tool act, so it does not glow", async () => {
  const outcome = await agent.act({ steps: [{ ref: "Bedroom blinds", action: "setValue", args: [80] }] })
  expect(outcome.ok, outcome.error?.message).toBe(true)
  expect(status()).toBe("Page agent set Bedroom blinds to 80% open.")
  expect(device("blinds").getAttribute("data-glow")).toBeNull()
})

test("keyboard: Space toggles a device switch, the arrows move the thermostat, and Enter runs a request", async () => {
  const lamp = control("lamp")
  lamp.focus()
  const before = device("lamp").getAttribute("data-on")
  await keys("Space")
  expect(device("lamp").getAttribute("data-on")).not.toBe(before)
  expect(status()).toMatch(/^You set Living room lamp to (on|off)\.$/)

  const value = Number(device("thermostat").getAttribute("data-level"))
  thumb("thermostat").focus()
  await keys("ArrowRight")
  expect(device("thermostat").getAttribute("data-level")).toBe(String(value + 1))
  await keys("ArrowLeft", "ArrowLeft")
  expect(device("thermostat").getAttribute("data-level")).toBe(String(value - 1))
  expect(status()).toBe(`You set Thermostat to ${value - 1} °C.`)

  button("Read the house").focus()
  await keys("Enter")
  await settle()
  expect(status()).toMatch(/^Browser agent read \d+ components with the WebMCP snapshot tool\.$/)
})

test("keyboard: each control is 1 tab stop, in the order of the page", () => {
  const expected = [
    control("lamp"),
    control("kitchen"),
    control("lock"),
    thumb("thermostat"),
    thumb("blinds"),
    control("webmcp"),
    ...["Evening scene", "Leave for work", "Let the courier in", "Read the house"].map(button),
  ]
  expect(tabbable(root)).toEqual(expected)
})

test("motion: with reduced motion, a glow is drawn with no pulse", async () => {
  const real = window.matchMedia
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query })) as unknown as typeof window.matchMedia
  button("Read the house").click()
  await settle()
  expect(root.querySelector("svg.f06-svg")!.hasAttribute("data-calm")).toBe(true)
  expect(root.querySelectorAll("[data-glow]").length).toBeGreaterThan(0)
  window.matchMedia = real
})
