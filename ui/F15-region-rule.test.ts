import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./F15-region-rule"

const { root, agent, person, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const read = (key: string) => root.querySelector(`[data-read="${key}"]`)!.textContent
const box = (name: string) => [...root.querySelectorAll<HTMLElement>("ui-checkbox")].find((el) => el.closest("label")!.textContent === name)!
const tile = (value: string) => root.querySelector(`[data-tile="${value}"]`)!
const code = (value: string) => root.querySelector(`[data-code="${value}"]`)!
const group = () => root.querySelector<HTMLElement & { value: string[] }>("ui-checkbox-group")!
const save = () => root.querySelector<HTMLElement>("[data-save] button")!
const stored = () => [...root.querySelectorAll("[data-tile][data-stored]")].map((el) => el.getAttribute("data-tile"))

test("names: the page names the policy, the region list, its 10 regions and the save button, and hides the map", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  expect(live().map((entry) => entry.label)).toEqual([
    "Residency policy", "Storage regions",
    "US West", "US East", "Canada", "Brazil", "Ireland", "Germany", "Sweden", "India", "Japan", "Australia",
    "Save residency",
  ])
  expect(live().find((entry) => entry.label === "Save residency")!.confirm).toBe("Moves stored customer data to the checked regions")
  const map = root.querySelector("[data-map]")!
  expect(map.getAttribute("aria-hidden")).toBe("true")
  expect(map.querySelector("svg text")).toBeNull()
  expect(map.querySelectorAll("polygon[data-tile]").length).toBe(10)
  expect(map.querySelectorAll("polygon[data-land]").length).toBe(25)
  expect([...map.querySelectorAll("[data-code]")].map((el) => el.textContent)).toEqual(["PDX", "IAD", "YUL", "GRU", "DUB", "FRA", "ARN", "BOM", "NRT", "SYD"])
  expect(group().value).toEqual(["eu-west", "eu-central"])
  expect(stored()).toEqual(["eu-west", "eu-central"])
  expect(tile("eu-west").hasAttribute("data-eu")).toBe(true)
  expect(tile("ap-northeast").hasAttribute("data-eu")).toBe(false)
  expect(status()).toBe("Storing in 2 regions: Ireland, Germany. Policy: EU only.")
  expect(read("policy")).toBe("EU only")
  expect(read("stored")).toBe("2 regions of 10")
  expect(read("outside")).toBe("None")
  expect(read("canceled")).toBe("0 agent changes")
  expect([...root.querySelectorAll("[data-allow] li")].map((el) => el.textContent)).toEqual(["setValue on Storage regions", "press on Save residency"])
  expect(ui.css).toContain("@media (prefers-reduced-motion: reduce)")
})

test("agent: the scripted task is canceled when it adds Japan, then sets 3 EU regions and saves after the person allows it", async () => {
  expect(ui.task!.done(root)).toBe(false)
  const first = await agent.act({ steps: [ui.task!.steps[0]] })
  expect(first.ok, first.error?.message).toBe(true)
  expect(first.steps[0].result).toBe(false)
  expect(group().value).toEqual(["eu-west", "eu-central"])
  expect(status()).toBe("Canceled an agent change: Japan is outside the EU.")
  expect(tile("ap-northeast").hasAttribute("data-denied")).toBe(true)
  expect(tile("ap-northeast").hasAttribute("data-stored")).toBe(false)
  expect(read("canceled")).toBe("1 agent change")

  const second = await agent.act({ steps: [ui.task!.steps[1]] })
  expect(second.ok, second.error?.message).toBe(true)
  expect(group().value).toEqual(["eu-west", "eu-central", "eu-north"])
  expect(stored()).toEqual(["eu-west", "eu-central", "eu-north"])
  expect(tile("ap-northeast").hasAttribute("data-denied")).toBe(false)
  expect(code("eu-north").hasAttribute("data-stored")).toBe(true)
  expect(box("Sweden").getAttribute("aria-checked")).toBe("true")
  expect(status()).toBe("Storing in 3 regions: Ireland, Germany, Sweden.")
  expect(root.querySelector("[data-log] li")!.textContent).toBe("Agent set regions: Ireland, Germany, Sweden")

  const refused = await agent.act({ steps: [ui.task!.steps[2]] })
  expect(refused.ok).toBe(false)
  expect(refused.error?.message).toContain("The person said no")
  expect(person.asked).toEqual(["Moves stored customer data to the checked regions"])
  expect(status()).toBe("Storing in 3 regions: Ireland, Germany, Sweden.")

  person.approves = true
  const saved = await agent.act({ steps: [ui.task!.steps[2]] })
  expect(saved.ok, saved.error?.message).toBe(true)
  expect(status()).toBe("Saved 3 regions: Ireland, Germany, Sweden. 1 agent change canceled.")
  expect(ui.task!.done(root)).toBe(true)
  person.approves = false
})

test("agent: the allow list refuses a single region, the policy and setAll, and asks the person nothing", async () => {
  const asked = person.asked.length
  for (const step of [
    { ref: "Japan", action: "setChecked", args: [true] },
    { ref: "Residency policy", action: "setValue", args: ["Any region"] },
    { ref: "Storage regions", action: "setAll", args: [true] },
  ]) {
    const result = await agent.act({ steps: [step] })
    expect(result.ok).toBe(false)
    expect(result.error?.message).toMatch(new RegExp(`^The app refused ${step.action} on c\\d+\\.$`))
  }
  expect(person.asked.length).toBe(asked)
  expect(group().value).toEqual(["eu-west", "eu-central", "eu-north"])
  expect(read("policy")).toBe("EU only")
  expect(box("Japan").getAttribute("aria-checked")).toBe("false")
})

test("agent: a step that names regions by label is canceled, since the group takes values", async () => {
  const result = await agent.act({ steps: [{ ref: "Storage regions", action: "setValue", args: [["eu-west", "Japan"]] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(result.steps[0].result).toBe(false)
  expect(status()).toBe("Canceled an agent change: Japan is not a storage region.")
  expect(group().value).toEqual(["eu-west", "eu-central", "eu-north"])
})

test("keyboard: each region is a tab stop, and Space lets the person add Japan outside the EU", async () => {
  const stops = tabbable(root)
  expect(stops.filter((el) => el.matches("ui-checkbox, ui-checkbox *")).length).toBe(10)
  box("Germany").focus()
  await keys("Tab")
  expect(document.activeElement).toBe(box("Sweden"))
  await keys("Tab", "Tab")
  expect(document.activeElement).toBe(box("Japan"))
  await keys("Space")
  expect(box("Japan").getAttribute("aria-checked")).toBe("true")
  expect(group().value).toEqual(["eu-west", "eu-central", "eu-north", "ap-northeast"])
  expect(status()).toBe("Storing in 4 regions: Ireland, Germany, Sweden, Japan.")
  expect(tile("ap-northeast").hasAttribute("data-stored")).toBe(true)
  expect(read("outside")).toBe("Japan")
  expect(root.querySelector("[data-log] li")!.textContent).toBe("Person set regions: Ireland, Germany, Sweden, Japan")
  await keys("Space")
  expect(group().value).toEqual(["eu-west", "eu-central", "eu-north"])
  expect(read("outside")).toBe("None")
  save().focus()
  await keys("Enter")
  expect(status()).toBe("Saved 3 regions: Ireland, Germany, Sweden. 2 agent changes canceled.")
})

test("keyboard: the person sets the policy to Any region, and then the agent may add Japan", async () => {
  const trigger = root.querySelector<HTMLElement>("ui-select-trigger button")!
  trigger.focus()
  await keys("ArrowDown")
  await settle()
  await keys("ArrowDown", "Enter")
  expect(read("policy")).toBe("Any region")
  expect(status()).toBe("Policy: Any region. Agent changes may add any region.")
  const result = await agent.act({ steps: [{ ref: "Storage regions", action: "setValue", args: [["eu-west", "ap-northeast"]] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(group().value).toEqual(["eu-west", "ap-northeast"])
  expect(status()).toBe("Storing in 2 regions: Ireland, Japan.")
  expect(read("outside")).toBe("Japan")
  expect(read("canceled")).toBe("2 agent changes")
})
