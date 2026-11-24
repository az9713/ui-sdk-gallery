import { checkServer, mount } from "@ui-sdk/core/testing"
import { afterEach, expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui, { deck } from "./B32-plant-flick-deck"

// 4 cards, a on top. "start" is Study again, "end" is Known.
const ids = ["a", "b", "c", "d"]
const markup = `<root aria-label="Plant cards">${ids.map((id) => `<card value="${id}">${id}</card>`).join("")}<flick value="start">Study again</flick><flick value="end">I know it</flick></root>`
const options = { plants: { a: "Alder", b: "Box", c: "Cedar", d: "Dogwood" } }
type View = ReturnType<typeof mount<typeof deck>>
const cardOf = (view: View, key: string) => view.part("card", key)!
const flickOf = (view: View, key: string) => view.part("flick", key)!

// Pointer events at set times: jsdom stamps each event with the clock, and the velocity comes from these times.
function pointer(el: Element, type: string, x: number, time: number) {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 200, pointerId: 1, pointerType: "mouse", button: 0, isPrimary: true })
  Object.defineProperty(event, "timeStamp", { value: time })
  el.dispatchEvent(event)
}
// Down at x 100, then moves to 100 + each offset, 1 every `gap` ms, then up `hold` ms after the last move.
async function swipe(el: Element, offsets: number[], gap: number, hold = 0) {
  let time = 1000
  pointer(el, "pointerdown", 100, time)
  for (const dx of offsets) pointer(el, "pointermove", 100 + dx, (time += gap))
  pointer(el, "pointerup", 100 + offsets.at(-1)!, time + hold)
  await settle()
}
const steps = (to: number, n: number) => Array.from({ length: n }, (_, i) => Math.round((to * (i + 1)) / n))

afterEach(() => document.documentElement.removeAttribute("dir"))

test("keyboard: Tab reaches the 2 flick buttons, and Space and Enter sort the top card", async () => {
  const view = mount(deck, options, markup)
  try {
    expect(cardOf(view, "a").getAttribute("data-depth")).toBe("0")
    expect(cardOf(view, "a").hasAttribute("aria-hidden")).toBe(false)
    expect(cardOf(view, "b").getAttribute("aria-hidden")).toBe("true")
    expect(view.root.getAttribute("role")).toBe("group")
    await view.keys("Tab")
    expect(document.activeElement).toBe(flickOf(view, "start"))
    await view.keys("Space")
    expect(view.state.again).toEqual(["a"])
    expect(view.changes.at(-1)).toMatchObject({ key: "again", reason: "item-press", source: "keyboard" })
    expect(cardOf(view, "a").hasAttribute("hidden")).toBe(true)
    expect(cardOf(view, "a").getAttribute("data-sorted")).toBe("again")
    expect(cardOf(view, "b").getAttribute("data-depth")).toBe("0")
    expect(cardOf(view, "b").hasAttribute("aria-hidden")).toBe(false)
    expect(cardOf(view, "c").getAttribute("aria-hidden")).toBe("true")
    expect(document.activeElement).toBe(flickOf(view, "start"))
    await view.keys("Tab")
    expect(document.activeElement).toBe(flickOf(view, "end"))
    await view.keys("Enter")
    expect(view.state.known).toEqual(["b"])
    expect(cardOf(view, "b").getAttribute("data-sorted")).toBe("known")
    expect(cardOf(view, "c").getAttribute("data-depth")).toBe("0")
    expect(cardOf(view, "d").getAttribute("data-depth")).toBe("1")
  } finally {
    view.unmount()
  }
})

test("keyboard: on an empty deck the buttons are disabled and keep focus, and reset brings the cards back", async () => {
  const view = mount(deck, options, markup)
  try {
    expect(flickOf(view, "end").hasAttribute("aria-disabled")).toBe(false)
    await view.keys("Tab", "Tab", "Enter", "Enter", "Enter", "Enter")
    expect(view.state.known).toEqual(["a", "b", "c", "d"])
    expect(flickOf(view, "end").getAttribute("aria-disabled")).toBe("true")
    expect(flickOf(view, "start").getAttribute("aria-disabled")).toBe("true")
    expect(document.activeElement).toBe(flickOf(view, "end"))
    const before = view.changes.length
    await view.keys("Enter")
    expect(view.changes.length).toBe(before)
    expect(view.api.reset()).toBe(true)
    await view.settle()
    expect(view.state.known).toEqual([])
    expect(cardOf(view, "a").getAttribute("data-depth")).toBe("0")
    expect(flickOf(view, "end").hasAttribute("aria-disabled")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("pointer: at the same distance, a quick flick throws the card, and a slow drag or a stop before release springs back", async () => {
  const view = mount(deck, options, markup)
  try {
    // 60 px in 600 ms: 0.1 px/ms coasts about 17 px more, short of the 150 px a throw needs.
    await swipe(cardOf(view, "a"), steps(60, 12), 50)
    expect(view.api.lastRelease()).toMatchObject({ key: "a", side: null, x: 60 })
    expect(view.api.lastRelease()!.speed).toBeCloseTo(0.1, 2)
    expect(view.state.known).toEqual([])
    expect(view.state.drag).toBeNull()
    expect(cardOf(view, "a").hasAttribute("data-dragging")).toBe(false)

    // The same 60 px with a stop of 100 ms before release: a stopped pointer reads 0.
    await swipe(cardOf(view, "a"), steps(60, 4), 8, 100)
    expect(view.api.lastRelease()).toMatchObject({ side: null, speed: 0 })
    expect(view.state.known).toEqual([])

    // The same 60 px in 32 ms: about 1.9 px/ms coasts far past 150 px, so the card goes.
    await swipe(cardOf(view, "a"), steps(60, 4), 8)
    expect(view.api.lastRelease()!.speed).toBeGreaterThan(1.5)
    expect(view.state.known).toEqual(["a"])
    expect(view.changes.at(-1)).toMatchObject({ key: "known", reason: "flick" })
    expect(cardOf(view, "a").hasAttribute("hidden")).toBe(true)

    // A quick flick to the left sends the next card to Study again.
    await swipe(cardOf(view, "b"), steps(-60, 4), 8)
    expect(view.state.again).toEqual(["b"])
  } finally {
    view.unmount()
  }
})

test("pointer: a drag moves the top card and leans it past 60 px, and a card under the top does not move", async () => {
  const view = mount(deck, options, markup)
  try {
    pointer(cardOf(view, "b"), "pointerdown", 100, 1000)
    pointer(cardOf(view, "b"), "pointermove", 200, 1100)
    await settle()
    expect(view.state.drag).toBeNull()
    pointer(cardOf(view, "b"), "pointerup", 200, 1110)

    pointer(cardOf(view, "a"), "pointerdown", 100, 2000)
    pointer(cardOf(view, "a"), "pointermove", 130, 2100)
    await settle()
    expect(cardOf(view, "a").hasAttribute("data-dragging")).toBe(true)
    expect(cardOf(view, "a").getAttribute("style")).toContain("--drag-x: 30px")
    expect(cardOf(view, "a").hasAttribute("data-lean")).toBe(false)
    pointer(cardOf(view, "a"), "pointermove", 180, 2200)
    await settle()
    expect(cardOf(view, "a").getAttribute("data-lean")).toBe("end")
    pointer(cardOf(view, "a"), "pointermove", 30, 2300)
    await settle()
    expect(cardOf(view, "a").getAttribute("data-lean")).toBe("start")
    pointer(cardOf(view, "a"), "pointercancel", 30, 2310)
    await settle()
    expect(view.state.drag).toBeNull()
    expect(cardOf(view, "a").getAttribute("style") ?? "").not.toContain("--drag-x")
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("server: the deck renders with no DOM", () => {
  checkServer(deck, options, markup)
})

test("direction: in right to left, a flick to the right sends the card to Study again", async () => {
  // A flick has no arrow keys for checkDirection, so the same flick runs in both directions.
  for (const [dir, pile] of [["ltr", "known"], ["rtl", "again"]] as const) {
    document.documentElement.dir = dir
    const view = mount(deck, options, markup)
    try {
      await swipe(cardOf(view, "a"), steps(60, 4), 8)
      expect(view.state[pile], dir).toEqual(["a"])
      pointer(cardOf(view, "b"), "pointerdown", 100, 5000)
      pointer(cardOf(view, "b"), "pointermove", 180, 5100)
      await settle()
      expect(cardOf(view, "b").getAttribute("data-lean"), dir).toBe(dir === "ltr" ? "end" : "start")
      pointer(cardOf(view, "b"), "pointercancel", 180, 5110)
    } finally {
      view.unmount()
    }
  }
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const box = () => page.root.querySelector("b32-deck")!
const top = () => page.root.querySelector<HTMLElement>('b32-card[data-depth="0"]')!
const pileText = (side: string) => [...page.root.querySelectorAll(`[data-pile="${side}"] li`)].map((li) => li.textContent)
const button = (side: string) => page.root.querySelector<HTMLElement>(`b32-flick[value="${side}"] button`)!

test("names: the page names the deck, shows 1 card on top with its leaf, and has 3 tab stops", async () => {
  page = mountUI(ui)
  await settle()
  expect(box().getAttribute("role")).toBe("group")
  expect(box().getAttribute("aria-label")).toBe("Plant cards")
  expect(page.root.querySelector(`#${box().getAttribute("aria-describedby")}`)!.textContent).toContain("slow drag")
  expect(page.root.querySelectorAll("b32-card").length).toBe(6)
  expect(top().getAttribute("value")).toBe("oak")
  expect(top().querySelector("h3")!.textContent).toBe("English oak")
  expect(top().querySelector("svg[data-leaf]")!.getAttribute("aria-hidden")).toBe("true")
  expect(top().querySelector("[data-blade]")!.getAttribute("d")).toMatch(/^M[\d. LZM]+Z$/)
  expect(page.root.querySelectorAll('b32-card[aria-hidden="true"]').length).toBe(5)
  expect(tabbable(page.root).map((el) => el.textContent)).toEqual(["Study again", "I know it", "Start over"])
  expect(status()).toBe("Top card: English oak. 6 cards in the deck.")
})

test("keyboard: on the page, the buttons sort the top card, the piles list it, and the status line reports it", async () => {
  button("end").focus()
  await keys("Enter")
  expect(status()).toBe("I know it: English oak. Next card: Field maple.")
  expect(pileText("end")).toEqual(["English oak"])
  expect(page.root.querySelector('[data-pile="end"] [data-count]')!.textContent).toBe("1 card")
  await keys("Shift+Tab", "Space")
  expect(status()).toBe("Study again: Field maple. Next card: Silver birch.")
  expect(pileText("start")).toEqual(["Field maple"])
  expect(top().getAttribute("value")).toBe("birch")
})

test("pointer: on the page, a quick flick reports its speed, and a slow drag reports that the card stays", async () => {
  await swipe(top(), steps(60, 12), 50)
  expect(status()).toBe("Too slow to throw (0.1 px/ms): Silver birch stays on top.")
  await swipe(top(), steps(60, 4), 8)
  expect(status()).toMatch(/^I know it: Silver birch, thrown at \d\.\d px\/ms\. Next card: Ash\.$/)
  expect(pileText("end")).toEqual(["English oak", "Silver birch"])
})

test("keyboard: on the page, Start over brings every card back", async () => {
  page.root.querySelector<HTMLElement>("[data-reset] button")!.focus()
  await keys("Enter")
  expect(status()).toBe("All 6 cards are back in the deck. Top card: English oak.")
  expect(pileText("end")).toEqual([])
  expect(pileText("start")).toEqual([])
  expect(top().getAttribute("value")).toBe("oak")
  await keys("Enter")
  expect(status()).toBe("All 6 cards are in the deck already.")
})

test("agent: an agent finds the deck and its cards, sorts the top 2, and a card that is not on top is refused", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const entry = page.live().find((e) => e.label === "Plant cards")!
  expect(entry.actions).toEqual(["markKnown", "studyAgain", "reset"])
  const found = JSON.stringify(await page.agent.query({ within: "Plant cards" }))
  expect(found).toContain("Ginkgo")
  expect(found).toContain("English oak")

  const wrong = await page.agent.act({ steps: [{ ref: "Plant cards", action: "markKnown", args: ["Ginkgo"] }] })
  expect(wrong.ok).toBe(false)
  expect(wrong.error?.message).toContain('"Ginkgo" is not the top card. The top card is English oak.')
  expect(pileText("end")).toEqual([])

  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(ui.task!.done(page.root)).toBe(true)
  expect(page.live().find((e) => e.label === "Plant cards")).toMatchObject({ known: ["oak"], again: ["maple"] })
})
