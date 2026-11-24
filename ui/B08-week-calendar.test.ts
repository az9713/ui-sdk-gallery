import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { week } from "./B08-week-calendar"

// Monday: A 9:00 to 10:00 and B 9:30 to 11:00 overlap, D 13:00 to 14:00. Tuesday: C 10:00 to 11:00.
const events = [
  { id: "a", track: "Mon", title: "A", start: 540, end: 600 },
  { id: "b", track: "Mon", title: "B", start: 570, end: 660 },
  { id: "d", track: "Mon", title: "D", start: 780, end: 840 },
  { id: "c", track: "Tue", title: "C", start: 600, end: 660 },
]
const item = (id: string) => `<event value="${id}">${id.toUpperCase()}<span data-span-edge="end"></span></event>`
const markup = `<root aria-label="Week calendar"><day value="Mon" aria-label="Monday">${["a", "b", "d"].map(item).join("")}</day><day value="Tue" aria-label="Tuesday">${item("c")}</day></root>`
const options = { defaultValue: events }
type View = ReturnType<typeof mount<typeof week>>
const el = (view: View, id: string) => view.part("event", id) as HTMLElement
const focused = () => document.activeElement?.textContent
const where = (view: View, id: string) => {
  const event = view.state.value.find((item) => item.id === id)!
  return `${event.track} ${event.start}-${event.end}`
}

test("keyboard: the arrow keys go from event to event, in a day and across days, and Home, End go to the day's ends", async () => {
  const view = mount(week, options, markup)
  try {
    await view.keys("Tab")
    expect(focused()).toBe("A")
    await view.keys("ArrowDown", "ArrowDown")
    expect(focused()).toBe("D")
    await view.keys("ArrowDown")
    expect(focused()).toBe("D")
    await view.keys("Home")
    expect(focused()).toBe("A")
    await view.keys("End")
    expect(focused()).toBe("D")
    await view.keys("ArrowUp")
    expect(focused()).toBe("B")
    await view.keys("ArrowRight")
    expect(focused()).toBe("C")
    await view.keys("ArrowRight")
    expect(focused()).toBe("C")
    // C starts at 10:00: B (9:30) is nearer than A (9:00) or D (13:00).
    await view.keys("ArrowLeft")
    expect(focused()).toBe("B")
  } finally {
    view.unmount()
  }
})

test("keyboard: the week is 1 tab stop, and the arrow keys move focus without moving an event", async () => {
  const view = mount(week, options, markup)
  try {
    await view.keys("Tab", "ArrowDown", "ArrowRight")
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(el(view, "c").getAttribute("tabindex")).toBe("0")
    expect(view.changes.length).toBe(0)
    expect(el(view, "c").getAttribute("aria-selected")).toBe("false")
    expect(el(view, "c").getAttribute("aria-roledescription")).toBe("event")
    expect(el(view, "c").hasAttribute("data-grabbed")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: Space picks an event up, Up and Down move it by 30 minutes, and Space puts it down", async () => {
  const view = mount(week, options, markup)
  try {
    await view.keys("Tab", "ArrowDown", "ArrowDown", "Space")
    expect(el(view, "d").getAttribute("aria-selected")).toBe("true")
    expect(el(view, "d").hasAttribute("data-grabbed")).toBe(true)
    await view.keys("ArrowDown", "ArrowDown", "ArrowUp")
    expect(where(view, "d")).toBe("Mon 810-870")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "move-key", source: "keyboard" })
    expect(view.announced.at(-1)).toBe("D, Monday 13:30 to 14:30.")
    await view.keys("Space")
    expect(el(view, "d").getAttribute("aria-selected")).toBe("false")
    await view.keys("ArrowUp")
    expect(focused()).toBe("B")
    expect(where(view, "d")).toBe("Mon 810-870")
    await view.keys("Enter", "ArrowUp", "Enter")
    expect(where(view, "b")).toBe("Mon 540-630")
  } finally {
    view.unmount()
  }
})

test("keyboard: Shift with Down changes the end, and Right moves the event to the next day", async () => {
  const view = mount(week, options, markup)
  try {
    await view.keys("Tab", "Space", "Shift+ArrowDown", "Shift+ArrowDown")
    expect(where(view, "a")).toBe("Mon 540-660")
    await view.keys("ArrowRight")
    expect(where(view, "a")).toBe("Tue 540-660")
    expect(view.announced.at(-1)).toBe("A, Tuesday 9:00 to 11:00.")
  } finally {
    view.unmount()
  }
})

test("keyboard: Escape puts a picked-up event back where it was", async () => {
  const view = mount(week, options, markup)
  try {
    await view.keys("Tab", "ArrowDown", "Space", "ArrowDown", "ArrowRight", "Escape")
    expect(where(view, "b")).toBe("Mon 570-660")
    expect(el(view, "b").getAttribute("aria-selected")).toBe("false")
    await view.keys("ArrowDown")
    expect(where(view, "b")).toBe("Mon 570-660")
    expect(focused()).toBe("D")
  } finally {
    view.unmount()
  }
})

test("lanes: events that overlap share the day's width side by side, and an event alone takes all of it", async () => {
  const view = mount(week, options, markup)
  try {
    expect(el(view, "a").getAttribute("style")).toContain("inset-inline-start: 0%; width: 50%")
    expect(el(view, "b").getAttribute("style")).toContain("inset-inline-start: 50%; width: 50%")
    expect(el(view, "d").getAttribute("style")).toContain("inset-inline-start: 0%; width: 100%")
    expect(el(view, "a").hasAttribute("data-overlap")).toBe(true)
    expect(el(view, "d").hasAttribute("data-overlap")).toBe(false)
    expect(el(view, "b").getAttribute("style")).toContain("top: 6.25%; height: 18.75%")
    await view.keys("Tab", "ArrowDown", "Space", "ArrowDown", "ArrowDown", "ArrowDown")
    expect(where(view, "b")).toBe("Mon 660-750")
    expect(el(view, "a").getAttribute("style")).toContain("width: 100%")
    expect(el(view, "a").hasAttribute("data-overlap")).toBe(false)
  } finally {
    view.unmount()
  }
})

// jsdom has no layout. Each element gets its own getBoundingClientRect, as mount() gives it one.
function box(target: Element, left: number, top: number, width: number, height: number) {
  Object.defineProperty(target, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) }),
  })
}

test("pointer: a drag moves an event, and a drag of its lower edge changes its length", async () => {
  const view = mount(week, options, markup)
  try {
    // 9:00 to 17:00 is 480 minutes on 480 pixels.
    box(view.part("day", "Mon")!, 0, 0, 100, 480)
    box(view.part("day", "Tue")!, 100, 0, 100, 480)
    box(el(view, "d"), 0, 240, 100, 60)
    await view.drag(el(view, "d"), { by: { x: 0, y: 60 } })
    expect(where(view, "d")).toBe("Mon 840-900")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag", source: "mouse" })
    // The lower edge of D, now 14:00 to 15:00, is at 300 to 360 pixels.
    const edge = el(view, "d").querySelector("[data-span-edge]")!
    box(edge, 0, 352, 100, 8)
    await view.drag(edge, { by: { x: 0, y: 30 } })
    expect(where(view, "d")).toBe("Mon 840-930")
  } finally {
    view.unmount()
  }
})

test("server: the week renders with no DOM", () => {
  checkServer(week, options, markup)
})

test("direction: in right to left, Left goes to the next day and Right to the day before, for focus and for a picked-up event", async () => {
  const run = async (dir: "ltr" | "rtl") => {
    document.documentElement.dir = dir
    const view = mount(week, options, markup)
    try {
      const next = dir === "rtl" ? "ArrowLeft" : "ArrowRight"
      const back = dir === "rtl" ? "ArrowRight" : "ArrowLeft"
      await view.keys("Tab", "ArrowDown", next)
      const across = focused()
      await view.keys(back, "Space", next)
      return [across, focused(), where(view, "b")]
    } finally {
      view.unmount()
      document.documentElement.dir = "ltr"
    }
  }
  expect(await run("ltr")).toEqual(["C", "B", "Tue 570-660"])
  expect(await run("rtl")).toEqual(["C", "B", "Tue 570-660"])
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const event = (id: string) => page.root.querySelector<HTMLElement>(`b08-event[value="${id}"]`)!

test("names: the page names the week, each day and each event", async () => {
  page = mountUI(ui)
  await settle()
  const week = page.root.querySelector("b08-week")!
  expect(week.getAttribute("aria-label")).toBe("Week calendar")
  expect(week.getAttribute("role")).toBe("group")
  expect([...page.root.querySelectorAll("b08-day")].map((day) => `${day.getAttribute("role")} ${day.getAttribute("aria-label")}`)).toEqual([
    "listbox Monday",
    "listbox Tuesday",
    "listbox Wednesday",
    "listbox Thursday",
    "listbox Friday",
  ])
  expect(page.root.querySelectorAll("b08-event[role=option]").length).toBe(9)
  expect(event("design-review").textContent).toBe("Design review 14:00 to 15:30")
  expect(page.root.querySelectorAll("b08-event[data-overlap]").length).toBe(4)
  expect(page.root.querySelectorAll("b08-event[aria-disabled]").length).toBe(0)
  expect(status()).toBe("No event has moved.")
})

test("keyboard: on the page, a picked-up event moves to another day, focus stays on it, and the status line reports it", async () => {
  event("budget").focus()
  await keys("Space", "ArrowLeft")
  expect(event("budget").parentElement!.getAttribute("value")).toBe("Tue")
  expect(document.activeElement).toBe(event("budget"))
  expect(status()).toBe("Budget: Tuesday 10:00 to 11:30, side by side with 1:1 with Ana.")
  await keys("ArrowDown")
  expect(event("budget").querySelector("[data-time]")!.textContent).toBe("10:30 to 12:00")
  expect([...event("budget").parentElement!.children].map((child) => child.getAttribute("value"))).toEqual(["one-on-one", "budget", "design-review"])
  await keys("Escape")
  expect(event("budget").parentElement!.getAttribute("value")).toBe("Wed")
  expect(document.activeElement).toBe(event("budget"))
  expect(status()).toBe("Budget: Wednesday 10:00 to 11:30.")
})

test("agent: an agent finds the week and its events, moves an event beside another and changes a length, and gets errors it can act on", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const entry = page.live().find((item) => item.label === "Week calendar")!
  expect(entry.actions).toEqual(["moveEvent", "resizeEvent"])
  const found = await page.agent.query({ within: "Week calendar", text: "Design" })
  expect(Array.isArray(found) && found[0].items).toEqual([{ value: "design-review", label: "Design review" }])

  const moved = await page.agent.act({ steps: [{ ref: "Week calendar", action: "moveEvent", args: ["Design review", "Wednesday", "10:30"] }] })
  expect(moved.ok, moved.error?.message).toBe(true)
  expect(status()).toBe("Design review: Wednesday 10:30 to 12:00, side by side with Budget.")
  expect(event("design-review").parentElement!.getAttribute("value")).toBe("Wed")
  expect(event("design-review").getAttribute("style")).toContain("width: 50%")

  const longer = await page.agent.act({ steps: [{ ref: "Week calendar", action: "resizeEvent", args: ["Retro", 90] }] })
  expect(longer.ok, longer.error?.message).toBe(true)
  expect(status()).toBe("Retro: Friday 15:00 to 16:30.")

  const day = await page.agent.act({ steps: [{ ref: "Week calendar", action: "moveEvent", args: ["Retro", "Saturday", "10:00"] }] })
  expect(day.ok).toBe(false)
  expect(day.error?.message).toContain('No day "Saturday". Days: Monday, Tuesday, Wednesday, Thursday, Friday.')
  const late = await page.agent.act({ steps: [{ ref: "Week calendar", action: "moveEvent", args: ["Retro", "Friday", "16:00"] }] })
  expect(late.ok).toBe(false)
  expect(late.error?.message).toContain("Retro must start at 9:00 or later and end by 17:00.")
  const none = await page.agent.act({ steps: [{ ref: "Week calendar", action: "resizeEvent", args: ["Party", 60] }] })
  expect(none.ok).toBe(false)
  expect(none.error?.message).toContain('No event "Party".')
  expect(status()).toBe("Retro: Friday 15:00 to 16:30.")
})
