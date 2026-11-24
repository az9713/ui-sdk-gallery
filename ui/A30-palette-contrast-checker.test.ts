import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A30-palette-contrast-checker"

const { root, agent, person, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const inputs = () => [...root.querySelectorAll<HTMLInputElement>("ui-input input")]
const text = () => inputs()[0]!
const back = () => inputs()[1]!
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("ui-button button")].find((b) => b.textContent === name)!
const rows = (list: string) => [...root.querySelectorAll(`[data-${list}] li`)].map((li) => [...li.children].map((c) => c.textContent).join(" | "))
const sample = () => root.querySelector<HTMLElement>("[data-sample]")!
const trigger = () => root.querySelector<HTMLElement>("ui-select-trigger button")!
const type = (field: HTMLInputElement, value: string) => (field.value = value)

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Text color", "Background color", "Show colors as", "Check contrast", "Swap colors"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(root.querySelector("[data-sample]")!.getAttribute("aria-label")).toBe("Sample of the pair")
  expect(button("Check contrast").getAttribute("aria-disabled")).toBeNull()
})

test("keyboard: the page starts with a checked pair, and the form has 5 tab stops in reading order", async () => {
  expect(status()).toBe("Contrast 6.70:1. Normal text: AA pass, AAA fail. Large text: AA pass, AAA pass.")
  expect(sample().style.getPropertyValue("--sample-fg")).toBe("#1d4ed8")
  expect(sample().style.getPropertyValue("--sample-bg")).toBe("#ffffff")
  expect(tabbable(root)).toEqual([text(), back(), trigger(), button("Check contrast"), button("Swap colors")])
  text().focus()
  await keys("Tab")
  expect(document.activeElement).toBe(back())
  await keys("Tab", "Tab", "Tab")
  expect(document.activeElement).toBe(button("Swap colors"))
  await keys("Shift+Tab")
  expect(document.activeElement).toBe(button("Check contrast"))
})

test("keyboard: Enter and Space on Check contrast read both fields and report each AA and AAA level", async () => {
  type(text(), "#767676")
  button("Check contrast").focus()
  await keys("Enter")
  expect(status()).toBe("Contrast 4.54:1. Normal text: AA pass, AAA fail. Large text: AA pass, AAA pass.")
  type(text(), "#595959")
  await keys("Space")
  expect(status()).toBe("Contrast 7.00:1. Normal text: AA pass, AAA pass. Large text: AA pass, AAA pass.")
  type(text(), "#9ca3af")
  await keys("Enter")
  expect(status()).toBe("Contrast 2.53:1. Normal text: AA fail, AAA fail. Large text: AA fail, AAA fail.")
  expect(rows("levels")).toEqual([
    "Contrast ratio | 2.53:1",
    "Normal text, AA (4.5:1) | Fail",
    "Normal text, AAA (7:1) | Fail",
    "Large text, AA (3:1) | Fail",
    "Large text, AAA (4.5:1) | Fail",
  ])
  expect(root.querySelector("[data-levels] [data-pass='false']")!.textContent).toBe("Fail")
})

test("keyboard: the ratio is cut, not rounded up, and black on white is exactly 21", async () => {
  type(text(), "#000000")
  button("Check contrast").focus()
  await keys("Enter")
  expect(status()).toBe("Contrast 21.00:1. Normal text: AA pass, AAA pass. Large text: AA pass, AAA pass.")
  type(text(), "#9ca3af")
  await keys("Enter")
  expect(rows("levels")[0]).toBe("Contrast ratio | 2.53:1")
})

test("keyboard: Swap colors exchanges the 2 fields, the sample follows, and the ratio stays", async () => {
  type(text(), "#1d4ed8")
  type(back(), "#ffffff")
  button("Swap colors").focus()
  await keys("Enter")
  expect(text().value).toBe("#ffffff")
  expect(back().value).toBe("#1d4ed8")
  expect(sample().style.getPropertyValue("--sample-fg")).toBe("#ffffff")
  expect(sample().style.getPropertyValue("--sample-bg")).toBe("#1d4ed8")
  expect(status()).toBe("Contrast 6.70:1. Normal text: AA pass, AAA fail. Large text: AA pass, AAA pass.")
  await keys("Space")
  expect(text().value).toBe("#1d4ed8")
  expect(back().value).toBe("#ffffff")
})

test("keyboard: the arrow keys choose a color format and the readout is written in it", async () => {
  expect(rows("colors")).toEqual(["Text color | #1d4ed8", "Background color | #ffffff", "Lightness, text and background (OKLCH) | 0.49 and 1.00"])
  trigger().focus()
  await keys("Enter")
  await settle()
  expect(trigger().getAttribute("aria-expanded")).toBe("true")
  await keys("ArrowDown", "Enter")
  await settle()
  expect(trigger().textContent).toContain("RGB")
  expect(rows("colors")[0]).toBe("Text color | rgb(29 78 216)")
  expect(rows("colors")[1]).toBe("Background color | rgb(255 255 255)")
})

test("keyboard: text that is not a color is named in the status, and the old results are cleared", async () => {
  type(text(), "banana")
  button("Check contrast").focus()
  await keys("Enter")
  expect(status()).toBe('Cannot read "banana" as a text color.')
  expect(rows("colors")).toEqual([])
  expect(rows("levels")).toEqual([])
  type(text(), "#1d4ed8")
  type(back(), "  nope ")
  await keys("Enter")
  expect(status()).toBe('Cannot read "nope" as a background color.')
  type(back(), "rgb(255 255 255 / 50%)")
  await keys("Enter")
  expect(status()).toBe("The background color must be opaque. Remove its alpha.")
  type(back(), "white")
  await keys("Enter")
  expect(status()).toBe("Contrast 6.70:1. Normal text: AA pass, AAA fail. Large text: AA pass, AAA pass.")
})

test("keyboard: a translucent text color is blended over the background before the ratio is read", async () => {
  type(text(), "rgb(29 78 216 / 50%)")
  type(back(), "#ffffff")
  button("Check contrast").focus()
  await keys("Enter")
  expect(status()).toBe("Contrast 2.37:1. Normal text: AA fail, AAA fail. Large text: AA fail, AAA fail.")
  expect(rows("colors")[0]).toBe("Text color over the background | rgb(142 166.5 235.5)")
  expect(sample().style.getPropertyValue("--sample-fg")).toBe("#8ea7ec")
  type(text(), "oklch(0.5 0.2 260)")
  await keys("Enter")
  expect(status()).toBe("Contrast 6.23:1. Normal text: AA pass, AAA fail. Large text: AA pass, AAA pass.")
  expect(sample().style.getPropertyValue("--sample-fg")).toBe("#0559d2")
  type(text(), "#1d4ed8")
  await keys("Enter")
})

test("agent: an agent sets a light gray, asks for OKLCH, and checks the pair", async () => {
  const done = await agent.act({ steps: ui.task!.steps })
  expect(done.ok, done.error?.message).toBe(true)
  expect(text().value).toBe("#9ca3af")
  expect(status()).toBe("Contrast 2.53:1. Normal text: AA fail, AAA fail. Large text: AA fail, AAA fail.")
  expect(rows("colors")).toEqual(["Text color | oklch(0.7137 0.0192 261.32)", "Background color | oklch(1 0 0)", "Lightness, text and background (OKLCH) | 0.71 and 1.00"])
  expect(ui.task!.done(root)).toBe(true)
  expect(person.asked).toEqual([])
})

test("agent: an agent swaps the colors, picks Display P3, and types a color the page cannot read", async () => {
  const swapped = await agent.act({
    steps: [
      { ref: "Swap colors", action: "press" },
      { ref: "Show colors as", action: "setValue", args: ["Display P3"] },
    ],
  })
  expect(swapped.ok, swapped.error?.message).toBe(true)
  expect(text().value).toBe("#ffffff")
  expect(back().value).toBe("#9ca3af")
  expect(rows("colors")[1]).toBe("Background color | color(display-p3 0.6168 0.6383 0.6818)")
  const bad = await agent.act({
    steps: [
      { ref: "Background color", action: "setValue", args: ["not a color"] },
      { ref: "Check contrast", action: "press" },
    ],
  })
  expect(bad.ok, bad.error?.message).toBe(true)
  expect(status()).toBe('Cannot read "not a color" as a background color.')
  const fixed = await agent.act({
    steps: [
      { ref: "Background color", action: "setValue", args: ["#000000"] },
      { ref: "Check contrast", action: "press" },
    ],
  })
  expect(fixed.ok, fixed.error?.message).toBe(true)
  expect(status()).toBe("Contrast 21.00:1. Normal text: AA pass, AAA pass. Large text: AA pass, AAA pass.")
})

test("agent: an agent step to a format that the page does not offer is refused", async () => {
  const refused = await agent.act({ steps: [{ ref: "Show colors as", action: "setValue", args: ["CMYK"] }] })
  expect(refused.ok).toBe(false)
  expect(rows("colors")[0]).toContain("color(display-p3")
})
