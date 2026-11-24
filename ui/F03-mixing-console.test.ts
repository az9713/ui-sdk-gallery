import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./F03-mixing-console"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const slider = (name: string) => root.querySelector<HTMLElement & { value: number }>(`ui-slider[data-name="${name}"]`)!
const toggle = (name: string) => root.querySelector<HTMLElement>(`ui-toggle[data-name="${name}"]`)!
const pressedOf = (name: string) => toggle(name).querySelector("button")!.getAttribute("aria-pressed")
const BRIDGE = "Snapshot lists 100 controls, then the more entry: 50 more, found with query."

test("names: each of the 150 controls has a name, and the console reads the more entry", async () => {
  await settle()
  await new Promise((r) => setTimeout(r, 10))
  expect(root.querySelectorAll("ui-slider")).toHaveLength(80)
  expect(root.querySelectorAll("ui-toggle")).toHaveLength(70)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const input of root.querySelectorAll("ui-slider input"))
    expect(input.getAttribute("aria-label") ?? input.getAttribute("aria-labelledby"), "a fader input has no name").toBeTruthy()
  expect(root.querySelector("[data-bridge]")!.textContent).toBe(BRIDGE)
  expect(tabbable(root)).toHaveLength(150)
})

test("keyboard: ArrowUp raises a fader, Home and End reach its bounds, and the meter follows", async () => {
  const fader = slider("Kick fader")
  const start = fader.value
  const input = fader.querySelector("input")!
  input.focus()
  await keys("ArrowUp")
  expect(fader.value).toBe(start + 1)
  expect(status()).toBe(`Kick fader: ${start + 1}. ${BRIDGE}`)
  await keys("End")
  expect(fader.value).toBe(100)
  expect(fader.parentElement!.querySelectorAll("i[data-lit]")).toHaveLength(12)
  await keys("Home")
  expect(fader.value).toBe(0)
  expect(fader.parentElement!.querySelectorAll("i[data-lit]")).toHaveLength(0)
})

test("keyboard: ArrowRight and ArrowLeft move a pan control by 1 step", async () => {
  const pan = slider("Snare pan")
  const start = pan.value
  pan.querySelector("input")!.focus()
  await keys("ArrowRight")
  expect(pan.value).toBe(start + 1)
  await keys("ArrowLeft", "ArrowLeft")
  expect(pan.value).toBe(start - 1)
  expect(status()).toBe(`Snare pan: ${start - 1}. ${BRIDGE}`)
})

test("keyboard: Space and Enter press a mute button, and the status line follows", async () => {
  const button = toggle("Hats mute").querySelector("button")!
  expect(pressedOf("Hats mute")).toBe("false")
  button.focus()
  await keys("Space")
  expect(pressedOf("Hats mute")).toBe("true")
  expect(toggle("Hats mute").querySelector("[data-pressed]")).not.toBeNull()
  expect(status()).toBe(`Hats mute: on. ${BRIDGE}`)
  await keys("Enter")
  expect(pressedOf("Hats mute")).toBe("false")
  expect(status()).toBe(`Hats mute: off. ${BRIDGE}`)
})

test("keyboard: Tab goes from 1 control to the next in strip order", async () => {
  const stops = tabbable(root)
  stops[0].focus()
  await keys("Tab")
  expect(document.activeElement).toBe(stops[1])
  expect(stops[1].closest("ui-slider")!.getAttribute("data-name")).toBe("Kick high")
  stops[14].focus()
  expect(stops[14].closest("ui-slider")!.getAttribute("data-name")).toBe("Kick fader")
  await keys("Tab")
  expect(stops[15].closest("ui-slider")!.getAttribute("data-name")).toBe("Snare gain")
  expect(document.activeElement).toBe(stops[15])
})

test("agent: the snapshot lists 100 controls and ends with the more entry for the other 50", () => {
  const snapshot = agent.snapshot()
  expect(snapshot).toHaveLength(101)
  expect(snapshot.at(-1)).toMatchObject({ ref: "more", component: "more", more: 50, use: "query", actions: [] })
  const labels = snapshot.map((e) => e.label)
  expect(labels).toContain("Kick gain")
  expect(labels).toContain("Guitar Comp")
  expect(labels).not.toContain("Guitar Gate")
  expect(labels).not.toContain("Brass fader")
  expect(labels).not.toContain("Brass Mute")
})

test("agent: query finds a control after the first 100, and act changes it", async () => {
  const found = await agent.query({ text: "Brass fader" })
  if ("error" in found) throw new Error(found.error)
  expect(found.map((e) => e.label)).toEqual(["Brass fader"])
  const result = await agent.act({
    steps: [
      { ref: found[0].ref, action: "setValue", args: [85] },
      { ref: "Brass mute", action: "setPressed", args: [true] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(slider("Brass fader").value).toBe(85)
  expect(pressedOf("Brass mute")).toBe("true")
  expect(status()).toBe(`Brass mute: on. ${BRIDGE}`)
})

test("agent: the scripted task ends with the status that task.done reads", async () => {
  await agent.act({ steps: [{ ref: "Brass mute", action: "setPressed", args: [false] }] })
  expect(ui.task!.done(root)).toBe(false)
  const result = await agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(ui.task!.done(root)).toBe(true)
})

test("agent: a label that names 2 strips is refused with each match", async () => {
  const result = await agent.act({ steps: [{ ref: "fader", action: "setValue", args: [10] }] })
  expect(result.ok).toBe(false)
  expect(result.error?.message).toContain("Kick fader")
  expect(result.error?.message).toContain("Brass fader")
})
