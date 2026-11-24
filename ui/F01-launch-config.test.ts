import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./F01-launch-config"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const read = (key: string) => root.querySelector(`[data-read="${key}"]`)!.textContent
const log = () => [...root.querySelectorAll("[data-log] li")].map((li) => li.textContent)
const svg = () => root.querySelector<SVGSVGElement>("[data-trajectory]")!
const radios = () => [...root.querySelectorAll<HTMLElement>("ui-radio")]
const thumb = () => root.querySelector<HTMLInputElement>("ui-slider-thumb input")!

test("names: each control has the name that the page shows, and the trajectory is drawn at mount", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Mission name", "Launch vehicle", "Target orbit", "Payload mass"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(status()).toBe("Perigee-6 on Corvid 9 to LEO, 3,000 kg payload, 13,000 kg margin.")
  expect(read("changes")).toBe("Agent 0, person 0")
  expect(svg().querySelector("[data-path]")!.getAttribute("d")).toMatch(/^M36 226 C/)
  expect(svg().getAttribute("aria-hidden")).toBe("true")
})

test("keyboard: the form has 4 tab stops, and the orbit group is 1 of them", async () => {
  const stops = tabbable(root)
  expect(stops).toHaveLength(4)
  expect(stops.filter((el) => el.closest("ui-radio"))).toHaveLength(1)
  expect(stops[0]).toBe(root.querySelector("ui-input input"))
  expect(stops.at(-1)).toBe(thumb())
})

test("keyboard: the arrow keys check the next and the previous orbit, and the person's change is logged", async () => {
  radios()[0].focus()
  await keys("ArrowDown")
  expect(radios()[1].getAttribute("aria-checked")).toBe("true")
  expect(document.activeElement).toBe(radios()[1])
  expect(svg().dataset.orbit).toBe("sso")
  expect(log()[0]).toBe("Person set Target orbit to SSO")
  await keys("ArrowUp")
  expect(radios()[0].getAttribute("aria-checked")).toBe("true")
  expect(svg().dataset.orbit).toBe("leo")
  expect(read("changes")).toBe("Agent 0, person 2")
})

test("keyboard: ArrowRight adds 500 kg to the payload, and End goes to 20,000 kg, which is over capacity", async () => {
  thumb().focus()
  await keys("ArrowRight")
  expect(root.querySelector("[data-mass]")!.textContent).toBe("3,500 kg")
  expect(status()).toBe("Perigee-6 on Corvid 9 to LEO, 3,500 kg payload, 12,500 kg margin.")
  await keys("End")
  expect(status()).toBe("Perigee-6 on Corvid 9 to LEO, 20,000 kg payload, 4,000 kg over capacity.")
  expect(read("margin")).toBe("4,000 kg short")
  await keys("Home")
  expect(svg().dataset.mass).toBe("500")
})

test("agent: 1 act call makes 4 changes, and each one reaches the status, the log and the trajectory", async () => {
  const before = { ...svg().dataset }
  const result = await agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(result.steps).toHaveLength(4)
  expect(root.querySelector<HTMLInputElement>("ui-input input")!.value).toBe("Perigee-7")
  expect(status()).toBe("Perigee-7 on Corvid Heavy to GTO, 6,500 kg payload, 14,500 kg margin.")
  expect(log()).toEqual([
    "Agent set Payload mass to 6,500 kg",
    "Agent set Target orbit to GTO",
    "Agent set Launch vehicle to Corvid Heavy",
    "Agent set Mission name to Perigee-7",
  ])
  expect(read("orbit")).toBe("GTO, 35,786 km apogee")
  expect(read("capacity")).toBe("21,000 kg")
  expect(svg().dataset).toMatchObject({ orbit: "gto", vehicle: "corvid-heavy", mass: "6500" })
  expect(before.orbit).not.toBe("gto")
  expect(read("changes")).toMatch(/^Agent 4, person \d+$/)
})

test("agent: a payload mass outside 500 to 20,000 kg changes nothing", async () => {
  const result = await agent.act({ steps: [{ ref: "Payload mass", action: "setValue", args: [90000] }] })
  expect(svg().dataset.mass === "90000", JSON.stringify(result)).toBe(false)
  expect(status()).not.toContain("90,000")
})

test("keyboard: with reduced motion the rocket waits at orbit insertion and the trajectory is drawn at once", async () => {
  const media = window.matchMedia
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query }) as MediaQueryList) as typeof window.matchMedia
  const calm = document.body.appendChild(document.createElement("section"))
  calm.setAttribute("data-agent-hidden", "")
  ui.mount(calm, { agent, ask: async () => false })
  await settle()
  const rocket = calm.querySelector("[data-rocket]")!.getAttribute("transform")!
  const dot = calm.querySelector("[data-insertion]")!
  expect(rocket.startsWith(`translate(${dot.getAttribute("cx")} ${dot.getAttribute("cy")})`)).toBe(true)
  calm.remove()
  window.matchMedia = media
})
