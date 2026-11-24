import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./A25-display-preferences"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const prefs = () => root.querySelector("ui-preferences")!
const item = (text: string) => [...root.querySelectorAll<HTMLElement>("ui-segmented-control-item")].find((i) => i.textContent === text)!

test("keyboard: the arrow keys move a choice in the file view control, and it has 1 tab stop", async () => {
  await settle()
  const list = item("List")
  const grid = item("Grid")
  list.focus()
  await keys("ArrowRight")
  expect(grid.getAttribute("aria-checked")).toBe("true")
  expect(prefs().getAttribute("data-view")).toBe("grid")
  expect(status()).toBe("Saved the grid view.")
  await keys("ArrowLeft")
  expect(list.getAttribute("aria-checked")).toBe("true")
  expect(prefs().getAttribute("data-view")).toBe("list")
  const stops = [...root.querySelectorAll<HTMLElement>("[data-pref=view] ui-segmented-control-item")].filter((i) => i.tabIndex === 0)
  expect(stops).toHaveLength(1)
})

test("keyboard: ArrowRight on the density control sets the compact density attribute and saves it", async () => {
  item("Comfortable").focus()
  await keys("ArrowRight")
  expect(item("Compact").getAttribute("aria-checked")).toBe("true")
  expect(prefs().getAttribute("data-density")).toBe("compact")
  expect(status()).toBe("Saved the compact density.")
  expect(JSON.stringify(localStorage.getItem("a25-density"))).toContain("compact")
})

test("agent: an agent sets each preference and the page keeps them", async () => {
  await settle()
  expect(live().map((entry) => entry.label)).toEqual(expect.arrayContaining(["File view", "Row density"]))
  const result = await agent.act({
    steps: [
      { ref: "Row density", action: "setValue", args: ["Comfortable"] },
      { ref: "File view", action: "setValue", args: ["Grid"] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(prefs().getAttribute("data-view")).toBe("grid")
  expect(prefs().getAttribute("data-density")).toBe("comfortable")
  expect(status()).toBe("Saved the grid view.")
})
