import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { plan } from "./B07-project-plan"

// 3 tracks of 20 days. One and Two share track A. Locked is locked.
const options = {
  tracks: ["A", "B", "C"],
  locked: ["locked"],
  defaultValue: [
    { id: "one", title: "One", track: "A", start: 2, end: 5 },
    { id: "two", title: "Two", track: "A", start: 7, end: 9 },
    { id: "three", title: "Three", track: "B", start: 0, end: 3 },
    { id: "locked", title: "Locked", track: "C", start: 10, end: 14 },
  ],
}
const task = (id: string, title: string) => `<task value="${id}"><span data-span-edge="start"></span>${title}<span data-span-edge="end"></span></task>`
const markup = `<root aria-label="Project plan"><lane value="A"></lane><lane value="B"></lane><lane value="C"></lane>${task("one", "One")}${task("two", "Two")}${task("three", "Three")}${task("locked", "Locked")}</root>`

type View = ReturnType<typeof mount<typeof plan>>
const at = (view: View, id: string) => view.state.value.find((t) => t.id === id)!
const range = (view: View, id: string) => {
  const t = at(view, id)
  return [t.track, t.start, t.end]
}
const focusTask = (view: View, id: string) => view.part("task", id)!.focus()

test("keyboard: Left and Right move a task 1 day, and the start of the plan stops it", async () => {
  const view = mount(plan, options, markup)
  try {
    focusTask(view, "three")
    await view.keys("ArrowLeft")
    expect(range(view, "three")).toEqual(["B", 0, 3])
    await view.keys("ArrowRight", "ArrowRight")
    expect(range(view, "three")).toEqual(["B", 2, 5])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "move-key", source: "keyboard" })
    await view.keys("ArrowLeft")
    expect(range(view, "three")).toEqual(["B", 1, 4])
    expect(view.announced.at(-1)).toContain("Three, B, day 2 to day 4")
  } finally {
    view.unmount()
  }
})

test("keyboard: Shift with Left or Right changes the last day, and a task stays at least 1 day long", async () => {
  const view = mount(plan, options, markup)
  try {
    focusTask(view, "three")
    await view.keys("Shift+ArrowLeft", "Shift+ArrowLeft", "Shift+ArrowLeft", "Shift+ArrowLeft")
    expect(range(view, "three")).toEqual(["B", 0, 1])
    await view.keys("Shift+ArrowRight", "Shift+ArrowRight")
    expect(range(view, "three")).toEqual(["B", 0, 3])
  } finally {
    view.unmount()
  }
})

test("keyboard: Up and Down move a task to the track above or below, and stop at the first and last track", async () => {
  const view = mount(plan, options, markup)
  try {
    focusTask(view, "two")
    await view.keys("ArrowUp")
    expect(range(view, "two")).toEqual(["A", 7, 9])
    await view.keys("ArrowDown")
    expect(range(view, "two")).toEqual(["B", 7, 9])
    await view.keys("ArrowDown", "ArrowDown")
    expect(range(view, "two")).toEqual(["C", 7, 9])
    await view.keys("ArrowUp")
    expect(range(view, "two")).toEqual(["B", 7, 9])
    expect(view.part("task", "two")!.getAttribute("style")).toContain("--row: 1;")
  } finally {
    view.unmount()
  }
})

test("keyboard: a task stops at the task next to it on its track", async () => {
  const view = mount(plan, options, markup)
  try {
    focusTask(view, "three")
    await view.keys("ArrowUp")
    expect(range(view, "three")).toEqual(["B", 0, 3])
    focusTask(view, "one")
    await view.keys("ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight")
    expect(range(view, "one")).toEqual(["A", 4, 7])
    await view.keys("Shift+ArrowRight")
    expect(range(view, "one")).toEqual(["A", 4, 7])
  } finally {
    view.unmount()
  }
})

test("keyboard: a locked task does not move or change its days", async () => {
  const view = mount(plan, options, markup)
  try {
    focusTask(view, "locked")
    await view.keys("ArrowRight", "Shift+ArrowLeft", "ArrowUp")
    expect(range(view, "locked")).toEqual(["C", 10, 14])
    expect(view.changes).toEqual([])
    expect(view.part("task", "locked")!.getAttribute("aria-disabled")).toBe("true")
    expect(view.part("task", "locked")!.hasAttribute("data-locked")).toBe(true)
    expect(view.part("task", "one")!.hasAttribute("aria-disabled")).toBe(false)
    expect(view.part("task", "one")!.hasAttribute("data-locked")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: Delete and Backspace do not remove a task", async () => {
  const view = mount(plan, options, markup)
  try {
    focusTask(view, "one")
    await view.keys("Delete", "Backspace")
    expect(view.state.value.map((t) => t.id)).toEqual(["one", "two", "three", "locked"])
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: each task is 1 tab stop, named with its track and days", async () => {
  const view = mount(plan, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(view.part("task", "one"))
    await view.keys("Tab")
    expect(document.activeElement).toBe(view.part("task", "two"))
    const one = view.part("task", "one")!
    expect(one.getAttribute("tabindex")).toBe("0")
    expect(one.getAttribute("role")).toBe("group")
    expect(one.getAttribute("aria-roledescription")).toBe("task")
    expect(one.getAttribute("aria-label")).toBe("One, A, day 3 to day 5")
    expect(view.root.getAttribute("role")).toBe("group")
    expect(view.part("lane", "A")!.hasAttribute("tabindex")).toBe(false)
    expect(one.hasAttribute("data-dragging")).toBe(false)
  } finally {
    view.unmount()
  }
})

// jsdom has no layout. Each lane is 400 px wide, so 1 day is 20 px, and the lanes are 48 px tall.
function layOut(view: View) {
  const box = (el: Element, left: number, top: number, width: number, height: number) =>
    Object.defineProperty(el, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) }),
    })
  options.tracks.forEach((track, row) => box(view.part("lane", track)!, 0, row * 48, 400, 48))
  for (const t of view.state.value) {
    const el = view.part("task", t.id)!
    const row = options.tracks.indexOf(t.track)
    box(el, t.start * 20, row * 48 + 8, (t.end - t.start) * 20, 32)
    for (const edge of el.querySelectorAll("[data-span-edge]"))
      box(edge, edge.getAttribute("data-span-edge") === "start" ? t.start * 20 : t.end * 20 - 8, row * 48 + 8, 8, 32)
  }
}

async function drag(target: Element, from: [number, number], to: [number, number], during?: () => void) {
  const point = (x: number, y: number, buttons = 1) =>
    ({ clientX: x, clientY: y, button: 0, buttons, pointerId: 3, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true }) as PointerEventInit
  target.dispatchEvent(new PointerEvent("pointerdown", point(...from)))
  for (let i = 1; i <= 6; i++)
    target.dispatchEvent(new PointerEvent("pointermove", point(from[0] + ((to[0] - from[0]) * i) / 6, from[1] + ((to[1] - from[1]) * i) / 6)))
  await settle()
  during?.()
  target.dispatchEvent(new PointerEvent("pointerup", point(...to, 0)))
  await settle()
}

test("pointer: a drag on a task moves it by whole days, and a drag on its edge changes its days", async () => {
  const view = mount(plan, options, markup)
  try {
    layOut(view)
    const three = view.part("task", "three")!
    let dragging = false
    await drag(three, [30, 72], [72, 72], () => (dragging = three.hasAttribute("data-dragging")))
    expect(dragging).toBe(true)
    expect(range(view, "three")).toEqual(["B", 2, 5])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag" })
    expect(three.hasAttribute("data-dragging")).toBe(false)

    layOut(view)
    await drag(three.querySelector('[data-span-edge="end"]')!, [96, 72], [136, 72])
    expect(range(view, "three")).toEqual(["B", 2, 7])
  } finally {
    view.unmount()
  }
})

test("server: the plan renders with no DOM", () => {
  checkServer(plan, options, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(plan, options, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const pageTask = (id: string) => page.root.querySelector<HTMLElement>(`b07-plan-task[value="${id}"]`)!

test("names: the page names the plan and each task, and marks the locked task", async () => {
  page = mountUI(ui)
  await settle()
  const root = page.root.querySelector("b07-plan")!
  expect(root.getAttribute("aria-label")).toBe("Project plan")
  expect(root.getAttribute("role")).toBe("group")
  expect(page.root.querySelectorAll("b07-plan-task").length).toBe(7)
  expect(page.root.querySelectorAll("b07-plan-lane").length).toBe(4)
  expect(pageTask("wireframes").getAttribute("aria-label")).toBe("Wireframes, Design, day 1 to day 4")
  expect(pageTask("review").getAttribute("aria-label")).toBe("Launch review, QA, day 17 to day 20")
  expect(pageTask("review").getAttribute("aria-disabled")).toBe("true")
  expect(page.root.querySelectorAll("b07-plan-task[aria-disabled]").length).toBe(1)
  expect(status()).toBe("No task has moved.")
})

test("keyboard: on the page, the arrow keys move a task and change its days, and the status line reports it", async () => {
  pageTask("wireframes").focus()
  await keys("Shift+ArrowLeft")
  expect(status()).toBe("Resized Wireframes: Design, day 1 to day 3.")
  await keys("ArrowRight")
  expect(status()).toBe("Moved Wireframes: Design, day 2 to day 4.")
  pageTask("tests").focus()
  await keys("ArrowUp")
  expect(status()).toBe("Moved Test plan: Frontend, day 6 to day 9.")
  expect(pageTask("tests").getAttribute("style")).toContain("--row: 2;")
  expect(document.activeElement).toBe(pageTask("tests"))
  await keys("ArrowDown")
  expect(status()).toBe("Moved Test plan: QA, day 6 to day 9.")
  expect(pageTask("tests").getAttribute("style")).toContain("--row: 3;")
})

test("agent: an agent finds the plan, moves a task to another day and changes the length of another", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const entry = page.live().find((e) => e.label === "Project plan")!
  expect(entry.actions).toEqual(["moveTask", "resizeTask"])
  const found = await page.agent.query({ within: "Project plan" })
  expect(JSON.stringify(found)).toContain('"value":"screens","label":"Screens"')

  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(ui.task!.done(page.root)).toBe(true)
  expect(pageTask("screens").getAttribute("aria-label")).toBe("Screens, Frontend, day 10 to day 17")
})

test("agent: moveTask and resizeTask check the task, the track and the days, and refuse a locked task or an overlap", async () => {
  const fails = async (action: string, args: unknown[], message: string) => {
    const result = await page.agent.act({ steps: [{ ref: "Project plan", action, args }] })
    expect(result.ok, `${action} ${JSON.stringify(args)}`).toBe(false)
    expect(result.error?.message).toContain(message)
  }
  await fails("moveTask", ["Launch review", "QA", 2], "Launch review is locked")
  await fails("resizeTask", ["Launch review", 2], "Launch review is locked")
  await fails("moveTask", ["API", "Backend", 1], "API does not fit there")
  await fails("moveTask", ["Nothing", "QA", 1], 'No task "Nothing"')
  await fails("moveTask", ["API", "Ops", 1], 'No track "Ops"')
  await fails("resizeTask", ["API", 0], "whole number")
  expect(pageTask("review").getAttribute("aria-label")).toBe("Launch review, QA, day 17 to day 20")
  expect(pageTask("api").getAttribute("aria-label")).toBe("API, Backend, day 5 to day 11")
})
