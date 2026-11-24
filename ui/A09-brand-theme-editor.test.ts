import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./A09-brand-theme-editor"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const el = (selector: string) => root.querySelector<HTMLElement>(selector)!
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!
const items = () => [...root.querySelectorAll<HTMLElement>("ui-segmented-control-item")]

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Brand color", "Layout mode", "Save theme"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
})

test("keyboard: the layout switch is 1 tab stop, and the arrows check the next item", async () => {
  await settle()
  expect(items().filter((i) => i.tabIndex === 0)).toHaveLength(1)
  items()[0].focus()
  await keys("ArrowRight")
  expect(items()[1].getAttribute("aria-checked")).toBe("true")
  expect(el("[data-preview]").dataset.mode).toBe("compact")
  await keys("ArrowLeft")
  expect(items()[0].getAttribute("aria-checked")).toBe("true")
  expect(el("[data-preview]").dataset.mode).toBe("comfortable")
})

test("keyboard: Enter on the swatch opens the popover, Escape closes it, and focus returns to the swatch", async () => {
  const trigger = el("ui-popover-trigger button")
  trigger.focus()
  await keys("Enter")
  await settle()
  expect(el("ui-popover-content").hasAttribute("hidden")).toBe(false)
  await keys("Escape")
  await settle()
  expect(el("ui-popover-content").hasAttribute("hidden")).toBe(true)
  expect(document.activeElement).toBe(trigger)
})

test("keyboard: the arrows move the brightness slider and Save reports the color", async () => {
  el("ui-popover-trigger button").focus()
  await keys("Enter")
  await settle()
  const before = el("[data-hex]").textContent
  el("ui-color-picker-slider[data-channel=brightness] ui-color-picker-slider-thumb").focus()
  await keys("ArrowRight", "ArrowRight")
  expect(el("[data-hex]").textContent).not.toBe(before)
  await keys("Escape")
  await settle()
  button("Save theme").focus()
  await keys("Enter")
  expect(status()).toBe(`Saved: ${el("[data-hex]").textContent}, comfortable layout.`)
})

test("agent: an agent sets the color and the mode, then saves", async () => {
  const result = await agent.act({
    steps: [
      { ref: "Brand color", action: "setValue", args: ["#e11d48"] },
      { ref: "Layout mode", action: "setValue", args: ["compact"] },
      { ref: "Save theme", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Saved: #e11d48, compact layout.")
  expect(el("[data-preview]").dataset.mode).toBe("compact")
})

test("keyboard: the arrows change the hue slider and the color", async () => {
  el("ui-popover-trigger button").focus()
  await keys("Enter")
  await settle()
  const before = el("[data-hex]").textContent
  el("ui-color-picker-slider[data-channel=hue] ui-color-picker-slider-thumb").focus()
  await keys("ArrowRight", "ArrowRight")
  expect(el("[data-hex]").textContent).not.toBe(before)
  await keys("Escape")
  await settle()
})
