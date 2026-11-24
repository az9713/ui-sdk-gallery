import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A28-language-picker-rtl"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const radios = () => [...root.querySelectorAll<HTMLElement>("ui-radio")]
const checked = () => radios().findIndex((r) => r.getAttribute("aria-checked") === "true")
const save = () => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Save language")!

test("names: the group and each radio have the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  expect(labels).toContain("Interface language")
  expect(labels).toContain("Save language")
  expect(root.getAttribute("dir")).toBe("rtl")
  expect(document.documentElement.dir).not.toBe("rtl")
})

test("keyboard: the group is 1 tab stop and each arrow key moves the choice", async () => {
  const stops = tabbable(root).filter((el) => el.closest("ui-radio-group"))
  expect(stops).toHaveLength(1)
  radios()[0].focus()
  await keys("ArrowDown")
  expect(checked()).toBe(1)
  await keys("ArrowUp")
  expect(checked()).toBe(0)
})

test("keyboard: in a right-to-left stage, Left moves to the next radio and Right to the previous", async () => {
  radios()[0].focus()
  await keys("ArrowLeft")
  expect(checked()).toBe(1)
  await keys("ArrowRight")
  expect(checked()).toBe(0)
})

test("direction: the same key goes the other way when the stage is left to right", async () => {
  try {
    root.setAttribute("dir", "ltr")
    radios()[0].focus()
    await keys("ArrowRight")
    const ltr = checked()
    root.setAttribute("dir", "rtl")
    radios()[0].focus()
    await keys("ArrowLeft")
    expect(ltr).toBe(1)
    expect(checked()).toBe(1)
  } finally {
    root.setAttribute("dir", "rtl")
  }
})

test("keyboard: Enter on Save language reports the chosen language", async () => {
  radios()[2].focus()
  await keys("Space")
  save().focus()
  await keys("Enter")
  expect(status()).toBe("Saved: Persian")
})

test("agent: an agent picks Hebrew by the group's name and saves it", async () => {
  const result = await agent.act({
    steps: [
      { ref: "Interface language", action: "setValue", args: ["he"] },
      { ref: "Save language", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(checked()).toBe(1)
  expect(status()).toBe("Saved: Hebrew")
})
