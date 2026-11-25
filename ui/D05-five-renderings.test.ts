import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import { TEAM, TEXT } from "./D01-teammate-picker-react"
import ui, { CHOICES, RENDERINGS } from "./D05-five-renderings"

// Each rendering is tested alone in its own row (B20, D01 to D04). This file tests the 5 of them on 1 page with 1 bridge.
let page: ReturnType<typeof mountUI>
const LABELS = RENDERINGS.map((r) => TEXT.label(r.name))
const cols = () => [...page.root.querySelectorAll<HTMLElement>(".d05-col")]
const col = (i: number) => cols()[i]
const field = (i: number) => col(i).querySelector("input")!
const statuses = () => cols().map((c) => c.querySelector("[data-status]")!.textContent)
// React, Vue and Solid leave an absent name out of the DOM. The web adapter keeps it with `hidden`.
const shown = (i: number) =>
  [...col(i).querySelectorAll<HTMLElement>("[role=option]")].filter((el) => !el.hidden).map((el) => el.textContent)
const highlighted = (i: number) => [...col(i).querySelectorAll("[role=option][data-highlighted]")].map((el) => el.textContent)

// The native setter goes past React's value tracker. Vue, Svelte, Solid and the web part read the value in their input handler.
const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
const type = async (text: string, input: HTMLInputElement) => {
  valueSetter.call(input, text)
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
}

test("names: the page has 5 pickers with 5 distinct labels, and no id occurs 2 times", async () => {
  page = mountUI(ui)
  await settle()
  expect(cols().map((c) => c.querySelector("h3")!.textContent)).toEqual(["Web components", "React", "Vue", "Svelte", "Solid"])
  const roots = cols().map((c) => c.querySelector("[aria-label^='Teammate picker in']")!)
  expect(roots.map((r) => r.getAttribute("aria-label"))).toEqual(LABELS)
  expect(new Set(LABELS).size).toBe(5)
  const ids = [...page.root.querySelectorAll("[id]")].map((el) => el.id)
  expect(ids.length).toBeGreaterThan(5)
  expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  // Each search box points at the list of its own column.
  cols().forEach((c, i) => {
    const list = c.querySelector("[role=listbox]")!
    expect(field(i).getAttribute("aria-controls")).toBe(list.id)
    expect(shown(i)).toEqual(TEAM)
  })
  expect(statuses()).toEqual(Array(5).fill(TEXT.none))
})

test("keyboard: each picker is 1 tab stop, so the page has 5", async () => {
  expect(tabbable(page.root)).toEqual(cols().map((_, i) => field(i)))
  field(0).focus()
  for (let i = 1; i < 5; i++) {
    await keys("Tab")
    expect(document.activeElement).toBe(field(i))
  }
})

test("keyboard: ArrowDown and Enter choose a name in 1 picker, and the 4 others do not change", async () => {
  for (let i = 0; i < 5; i++) {
    field(i).focus()
    await keys("ArrowDown")
    expect(highlighted(i)).toEqual(["Ada Okafor"])
    const active = field(i).getAttribute("aria-activedescendant")!
    expect(document.getElementById(active)?.closest(".d05-col")).toBe(col(i))
    await keys("Enter")
    expect(document.activeElement).toBe(field(i))
    expect(statuses()).toEqual(Array.from({ length: 5 }, (_, j) => (j <= i ? TEXT.chosen("Ada Okafor") : TEXT.none)))
  }
})

test("keyboard: typing narrows only its own list, and Escape clears it", async () => {
  for (let i = 0; i < 5; i++) {
    field(i).focus()
    await type("an", field(i))
    expect(shown(i)).toEqual(["Bao Tran", "Hana Sato"])
    for (let j = 0; j < 5; j++) if (j !== i) expect(shown(j)).toEqual(TEAM)
    await keys("Escape")
    expect(field(i).value).toBe("")
    expect(shown(i)).toEqual(TEAM)
  }
})

test("agent: 1 snapshot lists the 5 pickers, and 1 act chooses a different name in each", async () => {
  const pickers = page.live().filter((entry) => entry.component === "teammate-picker")
  expect(pickers.map((p) => p.label).sort()).toEqual([...LABELS].sort())
  for (const p of pickers) expect([...p.actions].sort()).toEqual(["choose", "clear", "search"])

  const refused = await page.agent.act({ steps: [{ ref: LABELS[2], action: "choose", args: ["Nobody Here"] }] })
  expect(refused.steps[0].result).toBe(false)
  await settle()
  expect(statuses()[2]).toBe(TEXT.chosen("Ada Okafor"))

  expect(ui.task!.done(page.root)).toBe(false)
  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  await settle()
  expect(statuses()).toEqual(CHOICES.map((name) => TEXT.chosen(name)))
  expect(ui.task!.done(page.root)).toBe(true)
})

test("agent: a search through the bridge narrows only the picker that it names", async () => {
  const result = await page.agent.act({ steps: [{ ref: LABELS[3], action: "search", args: ["an"] }] })
  expect(result.ok, result.error?.message).toBe(true)
  await settle()
  expect(field(3).value).toBe("an")
  expect(shown(3)).toEqual(["Bao Tran", "Hana Sato"])
  for (const j of [0, 1, 2, 4]) expect(shown(j)).toEqual(TEAM)
  await page.agent.act({ steps: [{ ref: LABELS[3], action: "clear" }] })
  await settle()
  expect(shown(3)).toEqual(TEAM)
})
