import { agentTools } from "@ui-sdk/web/agent"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./F05-rover-tool-console"

const { root, agent, person, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const consoleStatus = () => root.querySelector("[data-console-status]")!.textContent!
const output = () => root.querySelector("[data-output]")!.textContent!
const input = () => root.querySelector<HTMLTextAreaElement>("ui-textarea textarea")!
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!
const tab = (name: string) => root.querySelector<HTMLElement>(`ui-tabs-tab[value="${name}"] button`)!
const run = () => root.querySelector<HTMLElement>("[data-run] button")!

async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await settle()
  expect(check()).toBe(true)
}

async function type(text: string) {
  input().value = text
  run().focus()
  const before = consoleStatus()
  await keys("Enter")
  await until(() => consoleStatus() !== before && !consoleStatus().endsWith("running."))
}

test("names: the bridge sees the 4 rover controls and not the console", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  expect(live().map((entry) => entry.label).sort()).toEqual(["Distance", "Drill core sample", "Drive", "Heading"])
  expect(live().find((entry) => entry.label === "Drill core sample")!.confirm).toBe("Drills a core sample")
  expect(status()).toBe("Rover at C4, heading North. No core sample.")
  expect(ui.task!.done(root)).toBe(false)
})

test("schemas: the 3 tabs show the name, description and input schema of each agentTools entry", () => {
  expect(agentTools.map((t) => t.name)).toEqual(["snapshot", "act", "query"])
  expect([...root.querySelectorAll("ui-tabs-tab button")].map((b) => b.textContent)).toEqual(["snapshot()", "act(steps)", "query(text?, within?, kind?)"])
  for (const tool of agentTools) {
    const panel = root.querySelector(`ui-tabs-panel[value="${tool.name}"]`)!
    expect(panel.querySelector("[data-desc]")!.textContent).toBe(tool.description)
    expect(JSON.parse(panel.querySelector("[data-schema]")!.textContent!)).toEqual(tool.inputSchema)
  }
  expect(root.querySelector("ui-tabs-panel[value=act]")!.hasAttribute("hidden")).toBe(false)
})

test("visual: the terrain SVG is hidden from the bridge and draws the rover at the status cell", () => {
  const svg = root.querySelector<SVGSVGElement>("[data-terrain]")!
  expect(svg.getAttribute("aria-hidden")).toBe("true")
  expect(svg.querySelectorAll("rect[fill^='#']").length).toBeGreaterThanOrEqual(48)
  expect(svg.dataset.cell).toBe("C4")
  expect(svg.querySelector<SVGGElement>("[data-rover]")!.style.transform).toBe("translate(120px, 168px) rotate(0deg)")
})

test("agent: the task drives the rover, and the drill step waits for the person", async () => {
  const refused = await agent.act({ steps: ui.task!.steps })
  expect(refused.ok).toBe(false)
  expect(refused.error?.step).toBe(3)
  expect(person.asked).toEqual(["Drills a core sample"])
  expect(status()).toBe("Rover at F4, heading East. No core sample.")

  person.approves = true
  const drilled = await agent.act({ steps: ui.task!.steps.slice(3) })
  expect(drilled.ok, drilled.error?.message).toBe(true)
  expect(status()).toBe("Rover at F4, heading East. Core samples: F4.")
  expect(ui.task!.done(root)).toBe(true)
  expect(root.querySelector<SVGSVGElement>("[data-terrain]")!.querySelectorAll("[data-samples] path")).toHaveLength(1)
  person.approves = false
})

test("keyboard: a person types act steps, Enter on Run sends them to the bridge, and the rover drives", async () => {
  expect(input().value).toContain('"ref":"Heading"')
  await type(`{ "steps": [
    { "ref": "Heading", "action": "setValue", "args": ["South"] },
    { "ref": "Distance", "action": "setValue", "args": ["2"] },
    { "ref": "Drive", "action": "press" }
  ] }`)
  expect(consoleStatus()).toBe("act: ok, 3 steps ran.")
  expect(output()).toContain('"ok": true')
  expect(status()).toBe("Rover at F6, heading South. Core samples: F4.")
  expect(root.querySelector<SVGSVGElement>("[data-terrain]")!.dataset.cell).toBe("F6")
})

test("keyboard: input that is not JSON runs nothing and says why", async () => {
  const before = output()
  input().value = "{ steps: drive }"
  run().focus()
  await keys("Enter")
  expect(consoleStatus()).toMatch(/^Input is not JSON\. Nothing ran\./)
  expect(output()).toBe(before)
  expect(status()).toBe("Rover at F6, heading South. Core samples: F4.")
})

test("keyboard: a typed drill step asks the person, and a no is reported", async () => {
  await type(`{ "steps": [{ "ref": "Drill core sample", "action": "press" }] }`)
  expect(person.asked).toEqual(["Drills a core sample", "Drills a core sample", "Drills a core sample"])
  expect(consoleStatus()).toMatch(/^act: step 1 failed\. .*Drills a core sample/)
  expect(status()).toBe("Rover at F6, heading South. Core samples: F4.")
})

test("keyboard: Enter on Drive at the grid edge stops the rover, and Space on Drill drills with no prompt", async () => {
  button("Drive").focus()
  await keys("Enter")
  expect(status()).toBe("Rover at F6, heading South. Stopped at the grid edge. Core samples: F4.")
  button("Drill core sample").focus()
  await keys("Space")
  expect(status()).toBe("Rover at F6, heading South. Stopped at the grid edge. Core samples: F4, F6.")
  expect(person.asked).toHaveLength(3)
})

test("keyboard: arrow keys pick the tool, and Run calls query, then snapshot", async () => {
  tab("act").focus()
  await keys("ArrowRight")
  expect(tab("query").getAttribute("aria-selected")).toBe("true")
  expect(root.querySelector("[data-run-name]")!.textContent).toBe("query")
  expect(input().value).toBe('{"within":"Heading"}')
  await type(input().value)
  expect(consoleStatus()).toBe("query: 1 component.")
  expect(output()).toContain('"label": "Heading"')

  tab("query").focus()
  await keys("ArrowLeft", "ArrowLeft")
  expect(tab("snapshot").getAttribute("aria-selected")).toBe("true")
  expect(input().value).toBe("{}")
  await type("{}")
  expect(consoleStatus()).toBe(`snapshot: ${agent.snapshot().length} components.`)
  expect(output()).toContain('"label": "Drill core sample"')
  expect(output()).not.toContain("Tool input")
})
