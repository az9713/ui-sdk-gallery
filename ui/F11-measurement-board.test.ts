import { expect, test } from "vitest"
import { keys, mountUI, RESULTS, settle, tabbable } from "../src/testing"
import ui from "./F11-measurement-board"

const { root, agent, live } = mountUI(ui)
type Api = HTMLElement & { value: string }
const select = () => root.querySelector("ui-select") as Api
const status = () => root.querySelector("[data-status]")!.textContent
const lit = (at: ParentNode = root) => [...at.querySelectorAll("[data-dots] circle:not([data-off])")].map((c) => c.getAttribute("data-id"))
const highlighted = () => [...root.querySelectorAll<HTMLElement>(".f11-set[data-on]")].map((s) => s.dataset.set)
const choose = (set: string) => agent.act({ steps: [{ ref: "Highlight set", action: "setValue", args: [set] }] })

const ALL = "All sets: 3 UIs with a snapshot. Median snapshot 588 bytes, median tree 2,104 bytes. The snapshot is smaller in 1 of 3. No snapshot: X01 (no UI SDK)."
const SET_A = "Set A: 1 UI with a snapshot. Median snapshot 588 bytes, median tree 343 bytes. The snapshot is smaller in 0 of 1."
const SET_B = "Set B: 1 UI with a snapshot. Median snapshot 171 bytes, median tree 2,104 bytes. The snapshot is smaller in 1 of 1."
const SET_F = "Set F: 1 UI with a snapshot. Median snapshot 10,843 bytes, median tree 7,240 bytes. The snapshot is smaller in 0 of 1."
const SET_X = "Set X: 1 UI with no snapshot (no UI SDK). Median tree 438 bytes."

test("names: Highlight set is the 1 control, and the board draws each measured UI of the fixture", async () => {
  await settle()
  expect(live().map((e) => [e.component, e.label])).toEqual([["select", "Highlight set"]])
  expect(status()).toBe(ALL)
  expect(lit()).toEqual(["A01", "B01", "F03"])
  expect([...root.querySelectorAll<HTMLElement>(".f11-set")].map((s) => s.dataset.set)).toEqual(["A", "B", "F", "X"])
  expect(root.querySelector(".f11-point")!.textContent).toBe("F03")
  expect(root.querySelector("[data-note]")!.textContent).toBe(
    "The largest snapshot is F03, Page with 150 controls: 10,843 bytes, 18.4 times the median of 588. The log scales keep the other points apart.",
  )
  expect(root.innerHTML).not.toMatch(/NaN|undefined|Infinity/)
  expect(root.querySelector(".f11-head")!.textContent).toContain("My measurement")
  expect(ui.task!.done(root)).toBe(false)
})

test("data: snapshot is across and tree is up on the scatter, and each bar has the value of its set and kind", () => {
  const [, , w, h] = root.querySelector(".f11-plot svg")!.getAttribute("viewBox")!.split(" ").map(Number) as [number, number, number, number]
  const lo = 171 * 0.8
  const hi = 10843 * 1.25
  const at = (v: number) => Math.log(v / lo) / Math.log(hi / lo)
  for (const [id, snapshot, tree] of [["A01", 588, 343], ["B01", 171, 2104], ["F03", 10843, 7240]] as const) {
    const dot = root.querySelector(`circle[data-id="${id}"]`)!
    expect(Number(dot.getAttribute("cx")), `${id} cx`).toBeCloseTo(w * at(snapshot), 0)
    expect(Number(dot.getAttribute("cy")), `${id} cy`).toBeCloseTo(h * (1 - at(tree)), 0)
  }
  const bars: Record<string, { values: (string | null)[]; widths: Record<string, number> }> = Object.fromEntries(
    [...root.querySelectorAll<HTMLElement>(".f11-set")].map((s) => [
      s.dataset.set,
      {
        values: [...s.querySelectorAll(".f11-value")].map((v) => v.textContent),
        widths: Object.fromEntries([...s.querySelectorAll("rect")].map((r) => [r.getAttribute("data-kind"), Number(r.getAttribute("width"))])),
      },
    ]),
  )
  expect(Object.fromEntries(Object.entries(bars).map(([set, b]) => [set, b.values]))).toEqual({
    A: ["588", "343"],
    B: ["171", "2,104"],
    F: ["10,843", "7,240"],
    X: ["none", "438"],
  })
  const unit = bars.F!.widths.snapshot! / 10843
  for (const [set, snapshot, tree] of [["A", 588, 343], ["B", 171, 2104], ["F", 10843, 7240]] as const) {
    expect(bars[set]!.widths.snapshot, `set ${set} snapshot bar`).toBeCloseTo(unit * snapshot, 0)
    expect(bars[set]!.widths.tree, `set ${set} tree bar`).toBeCloseTo(unit * tree, 0)
  }
  expect(bars.X!.widths).toEqual({ tree: expect.closeTo(unit * 438, 0) })
  expect(bars.F!.widths.snapshot).toBeLessThanOrEqual(240)
})

test("keyboard: the select trigger is the 1 tab stop, and Enter, ArrowDown, Enter highlight set A", async () => {
  const stops = tabbable(root)
  expect(stops).toHaveLength(1)
  expect(stops[0]!.closest("ui-select-trigger")).not.toBeNull()
  stops[0]!.focus()
  await keys("Enter", "ArrowDown", "Enter")
  expect(select().value).toBe("A")
  expect(status()).toBe(SET_A)
  expect(lit()).toEqual(["A01"])
  expect(highlighted()).toEqual(["A"])
  expect(root.querySelectorAll("[data-dots] circle")).toHaveLength(3)
})

test("keyboard: Escape closes the list and keeps the set that was chosen", async () => {
  root.querySelector<HTMLElement>("ui-select-trigger button")!.focus()
  await keys("Enter")
  expect(root.querySelector("ui-select-content")!.hasAttribute("hidden")).toBe(false)
  await keys("ArrowDown", "Escape")
  expect(root.querySelector("ui-select-content")!.hasAttribute("hidden")).toBe(true)
  expect(select().value).toBe("A")
  expect(status()).toBe(SET_A)
})

test("agent: an agent highlights set B, F and X, and the status reports the numbers of each set", async () => {
  for (const [set, text, dots] of [
    ["B", SET_B, ["B01"]],
    ["F", SET_F, ["F03"]],
    ["X", SET_X, []],
  ] as const) {
    const result = await choose(set)
    expect(result.ok, result.error?.message).toBe(true)
    expect(status()).toBe(text)
    expect(lit()).toEqual(dots)
    expect(highlighted()).toEqual([set])
  }
  const empty = await choose("C")
  expect(empty.ok, empty.error?.message).toBe(true)
  expect(status()).toBe("Set C: no result is recorded.")
  expect(highlighted()).toEqual([])
  expect((await choose("all")).ok).toBe(true)
  expect(status()).toBe(ALL)
})

test("agent: the scripted task highlights set B, and task.done reads it", async () => {
  const result = await agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe(SET_B)
  expect(ui.task!.done(root)).toBe(true)
})

test("data: the own row F11 is not drawn, and a board with no results says so", async () => {
  const ask = async () => true
  const other = document.body.appendChild(document.createElement("section"))
  ui.mount(other, { agent, ask, results: { ...RESULTS, F11: { snapshotBytes: 99999, treeBytes: 99999 } } })
  expect(lit(other)).toEqual(["A01", "B01", "F03"])
  expect(other.querySelector("[data-status]")!.textContent).toBe(ALL)
  other.remove()
  const blank = document.body.appendChild(document.createElement("section"))
  ui.mount(blank, { agent, ask })
  expect(blank.querySelector("[data-status]")!.textContent).toBe("No result is recorded.")
  expect(blank.querySelectorAll("circle")).toHaveLength(0)
  expect(blank.innerHTML).not.toMatch(/NaN|undefined|Infinity/)
  blank.remove()
})
