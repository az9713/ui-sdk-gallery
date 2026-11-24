import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui, { inbox } from "./B11-inbox-swipe-actions"

// 3 messages. Each row has a mouse button, 1 action on the start side and 2 on the end side.
const ids = ["a", "b", "c"]
const part = (tag: string, row: string, act: string) => `<${tag} value="${row}:${act}" row="${row}" act="${act}">${act}</${tag}>`
const row = (r: string) =>
  `<row value="${r}"><content value="${r}">${r}${part("tool", r, "read")}${part("tool", r, "archive")}</content>` +
  `<actions value="${r}:start" row="${r}" side="start">${part("action", r, "read")}</actions>` +
  `<actions value="${r}:end" row="${r}" side="end">${part("action", r, "flag")}${part("action", r, "archive")}</actions></row>`
const markup = `<root aria-label="Inbox">${ids.map(row).join("")}</root>`
const options = { messages: { a: "Alpha", b: "Beta", c: "Gamma" }, defaultUnread: ["a", "b"] }
type View = ReturnType<typeof mount<typeof inbox>>
const rowOf = (view: View, key: string) => view.part("row", key)!
const sideOf = (view: View, key: string, side: string) => view.part("actions", `${key}:${side}`)!
const actionOf = (view: View, key: string, act: string) => view.part("action", `${key}:${act}`)!

// jsdom has no layout, and a swipe measures the actions with getBoundingClientRect: at 0 px, Left and Right show nothing.
const place = (el: Element, x: number, width: number, y: number) =>
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ x, y, left: x, top: y, right: x + width, bottom: y + 60, width, height: 60, toJSON: () => ({}) }),
  })

// Each row is 400 px wide and 60 px high, its start actions 100 px wide and its end actions 200 px.
function layOut(view: View) {
  ids.forEach((key, i) => {
    place(rowOf(view, key), 0, 400, i * 60)
    place(view.part("content", key)!, 0, 400, i * 60)
    place(sideOf(view, key, "start"), 0, 100, i * 60)
    place(sideOf(view, key, "end"), 200, 200, i * 60)
  })
}

test("keyboard: the inbox is 1 tab stop, and Up and Down move between messages without a change", async () => {
  const view = mount(inbox, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(rowOf(view, "a"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(rowOf(view, "b").getAttribute("tabindex")).toBe("-1")
    expect(view.part("tool", "a:read")!.getAttribute("tabindex")).toBe("-1")
    await view.keys("ArrowDown", "ArrowDown", "ArrowDown")
    expect(document.activeElement).toBe(rowOf(view, "c"))
    await view.keys("ArrowUp")
    expect(document.activeElement).toBe(rowOf(view, "b"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(view.state.open).toBeNull()
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: Left shows the end actions and focuses the first, Right goes to the next, and Left back to the message hides them", async () => {
  const view = mount(inbox, options, markup)
  try {
    await view.keys("Tab", "ArrowDown")
    expect(sideOf(view, "b", "end").hasAttribute("inert")).toBe(true)
    expect(sideOf(view, "b", "start").hasAttribute("inert")).toBe(true)
    await view.keys("ArrowLeft")
    expect(view.state.open).toEqual({ key: "b", side: "end" })
    expect(document.activeElement).toBe(actionOf(view, "b", "flag"))
    expect(sideOf(view, "b", "end").hasAttribute("inert")).toBe(false)
    expect(sideOf(view, "b", "start").hasAttribute("inert")).toBe(true)
    expect(view.part("content", "b")!.getAttribute("data-swipe")).toBe("end")
    await view.keys("ArrowRight")
    expect(document.activeElement).toBe(actionOf(view, "b", "archive"))
    await view.keys("ArrowLeft")
    expect(document.activeElement).toBe(actionOf(view, "b", "flag"))
    await view.keys("ArrowLeft")
    expect(document.activeElement).toBe(rowOf(view, "b"))
    expect(view.state.open).toBeNull()
    expect(sideOf(view, "b", "end").hasAttribute("inert")).toBe(true)
    expect(view.part("content", "b")!.hasAttribute("data-swipe")).toBe(false)
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: Right shows the start action, and Escape hides it and gives focus back to the message", async () => {
  const view = mount(inbox, options, markup)
  try {
    await view.keys("Tab", "ArrowRight")
    expect(view.state.open).toEqual({ key: "a", side: "start" })
    expect(document.activeElement).toBe(actionOf(view, "a", "read"))
    expect(sideOf(view, "a", "start").hasAttribute("inert")).toBe(false)
    await view.keys("Escape")
    expect(view.state.open).toBeNull()
    expect(document.activeElement).toBe(rowOf(view, "a"))
    expect(sideOf(view, "a", "start").hasAttribute("inert")).toBe(true)
  } finally {
    view.unmount()
  }
})

test("keyboard: Space and Enter on an action run it, hide the actions and give focus back to the message", async () => {
  const view = mount(inbox, options, markup)
  try {
    expect(rowOf(view, "a").hasAttribute("data-unread")).toBe(true)
    expect(rowOf(view, "a").hasAttribute("data-flagged")).toBe(false)
    expect(actionOf(view, "a", "flag").hasAttribute("data-on")).toBe(false)
    await view.keys("Tab", "ArrowLeft", "Space")
    expect(view.state.flagged).toEqual(["a"])
    expect(view.changes.at(-1)).toMatchObject({ key: "flagged", reason: "item-press", source: "keyboard" })
    expect(rowOf(view, "a").hasAttribute("data-flagged")).toBe(true)
    expect(actionOf(view, "a", "flag").hasAttribute("data-on")).toBe(true)
    expect(view.state.open).toBeNull()
    expect(document.activeElement).toBe(rowOf(view, "a"))
    await view.keys("ArrowRight", "Enter")
    expect(view.state.unread).toEqual(["b"])
    expect(rowOf(view, "a").hasAttribute("data-unread")).toBe(false)
    expect(actionOf(view, "a", "read").hasAttribute("data-on")).toBe(true)
    expect(document.activeElement).toBe(rowOf(view, "a"))
    await view.keys("ArrowRight", "Enter")
    expect(view.state.unread).toEqual(["b", "a"])
  } finally {
    view.unmount()
  }
})

test("keyboard: Archive hides the message, focus goes to the next one, and Up and Down skip it", async () => {
  const view = mount(inbox, options, markup)
  try {
    await view.keys("Tab", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter")
    expect(view.state.value).toEqual(["a", "c"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
    expect(rowOf(view, "b").hasAttribute("hidden")).toBe(true)
    expect(view.state.open).toBeNull()
    expect(document.activeElement).toBe(rowOf(view, "c"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await view.keys("ArrowUp")
    expect(document.activeElement).toBe(rowOf(view, "a"))
    await view.keys("ArrowDown")
    expect(document.activeElement).toBe(rowOf(view, "c"))
    // The last message goes to the one before it.
    await view.keys("ArrowLeft", "ArrowRight", "Enter")
    expect(view.state.value).toEqual(["a"])
    expect(document.activeElement).toBe(rowOf(view, "a"))
  } finally {
    view.unmount()
  }
})

test("pointer: a swipe past half the actions opens them, a short swipe springs back, and a press on another message closes them", async () => {
  const view = mount(inbox, options, markup)
  layOut(view)
  try {
    await view.drag(rowOf(view, "a"), { by: { x: -30, y: 0 } })
    await view.settle()
    expect(view.state.open).toBeNull()
    await view.drag(rowOf(view, "a"), { by: { x: -120, y: 0 } })
    await view.settle()
    expect(view.state.open).toEqual({ key: "a", side: "end" })
    expect(view.state.swiping).toBeNull()
    expect(sideOf(view, "a", "end").hasAttribute("inert")).toBe(false)
    expect(view.part("content", "a")!.getAttribute("style")).toContain("--swipe-x: -200px")
    await view.click(rowOf(view, "b"))
    expect(view.state.open).toBeNull()
    await view.drag(rowOf(view, "b"), { by: { x: 60, y: 0 } })
    await view.settle()
    expect(view.state.open).toEqual({ key: "b", side: "start" })
    // A swipe opens the actions and runs nothing.
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("pointer: a long swipe right marks the message read, and a long swipe left archives it", async () => {
  const view = mount(inbox, options, markup)
  layOut(view)
  try {
    await view.drag(rowOf(view, "b"), { by: { x: 300, y: 0 } })
    await view.settle()
    expect(view.state.unread).toEqual(["a"])
    expect(view.changes.at(-1)).toMatchObject({ key: "unread", reason: "full-swipe" })
    expect(view.state.open).toBeNull()
    await view.drag(rowOf(view, "c"), { by: { x: -300, y: 0 } })
    await view.settle()
    expect(view.state.value).toEqual(["a", "b"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "full-swipe" })
    expect(rowOf(view, "c").hasAttribute("hidden")).toBe(true)
  } finally {
    view.unmount()
  }
})

test("pointer: a click on a mouse button runs its action and leaves the row closed", async () => {
  const view = mount(inbox, options, markup)
  try {
    await view.click(view.part("tool", "c:read")!)
    expect(view.state.unread).toEqual(["a", "b", "c"])
    expect(view.changes.at(-1)).toMatchObject({ key: "unread", reason: "item-press", source: "mouse" })
    await view.click(view.part("tool", "a:archive")!)
    expect(view.state.value).toEqual(["b", "c"])
    expect(view.state.open).toBeNull()
  } finally {
    view.unmount()
  }
})

test("server: the inbox renders with no DOM", () => {
  checkServer(inbox, options, markup)
})

test("direction: Left and Right show the side that the text direction puts them on", async () => {
  await checkDirection(inbox, options, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
let touch = false
const listeners = new Set<(event: { matches: boolean }) => void>()
const status = () => page.root.querySelector("[data-status]")!.textContent
const rows = () => [...page.root.querySelectorAll<HTMLElement>("b11-row")]
const box = () => page.root.querySelector("b11-inbox")!
// The text a person sees: the stylesheet shows 1 of the 2 spans of a toggle button, from its data-on.
const shown = (button: Element) =>
  button.querySelector("[data-if]") ? button.querySelector(button.hasAttribute("data-on") ? '[data-if="on"]' : '[data-if="off"]')!.textContent : button.textContent
const texts = (el: Element) => [...el.querySelectorAll("button")].map(shown)

// jsdom has no matchMedia. This one answers like a mouse until touch is true.
function stubMatchMedia() {
  const matches = (query: string) =>
    /hover:\s*hover/.test(query) ? !touch : /hover:\s*none/.test(query) ? touch : /pointer:\s*coarse/.test(query) ? touch : /pointer:\s*fine/.test(query) ? !touch : false
  window.matchMedia = (query: string) =>
    ({
      media: query,
      get matches() {
        return matches(query)
      },
      onchange: null,
      addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
      addListener: (listener: (event: { matches: boolean }) => void) => listeners.add(listener),
      removeListener: (listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList
}

test("names: the page names the list, each message and each button, and only the list is a tab stop", async () => {
  stubMatchMedia()
  page = mountUI(ui)
  await settle()
  expect(box().getAttribute("role")).toBe("list")
  expect(box().getAttribute("aria-label")).toBe("Inbox")
  expect(page.root.querySelector(`#${box().getAttribute("aria-describedby")}`)!.textContent).toContain("Left and Right")
  expect(rows().length).toBe(5)
  for (const el of rows()) expect(el.getAttribute("role")).toBe("listitem")
  expect(tabbable(page.root).length).toBe(1)
  const invoice = page.root.querySelector('b11-row[value="invoice"]')!
  expect(texts(invoice.querySelector("[data-tools]")!)).toEqual(["Mark read", "Flag", "Archive"])
  expect(texts(invoice.querySelector('b11-row-actions[side="start"]')!)).toEqual(["Mark read"])
  expect(texts(invoice.querySelector('b11-row-actions[side="end"]')!)).toEqual(["Flag", "Archive"])
  expect(texts(page.root.querySelector('b11-row[value="lease"] [data-tools]')!)).toEqual(["Mark unread", "Unflag", "Archive"])
  for (const group of page.root.querySelectorAll("b11-row-actions")) expect(group.hasAttribute("inert")).toBe(true)
  expect(page.root.querySelectorAll("[aria-disabled]").length).toBe(0)
})

test("pointer kind: the mouse buttons show with a pointer that hovers and hide on a touch screen", async () => {
  expect(box().getAttribute("data-hover")).toBe("hover")
  expect(box().getAttribute("data-pointer")).toBe("fine")
  touch = true
  for (const listener of [...listeners]) listener({ matches: true })
  await settle()
  expect(box().getAttribute("data-hover")).toBe("none")
  expect(box().getAttribute("data-pointer")).toBe("coarse")
  touch = false
  for (const listener of [...listeners]) listener({ matches: false })
  await settle()
  expect(box().getAttribute("data-hover")).toBe("hover")
})

test("keyboard: on the page, the actions behind a message run, the status line reports them, and focus follows an archived message", async () => {
  rows().forEach((el, i) => place(el, 0, 640, i * 60))
  for (const group of page.root.querySelectorAll("b11-row-actions")) place(group, 0, group.getAttribute("side") === "start" ? 104 : 208, 0)
  rows()[0].focus()
  await keys("ArrowRight", "Enter")
  expect(status()).toBe('Marked "Invoice 4471 is ready" as read.')
  expect(document.activeElement).toBe(rows()[0])
  await keys("ArrowDown", "ArrowLeft")
  expect(shown(document.activeElement!)).toBe("Flag")
  await keys("Space")
  expect(status()).toBe('Flagged "Standup moves to 10:30".')
  expect(document.activeElement).toBe(rows()[1])
  await keys("ArrowLeft", "ArrowRight", "Enter")
  expect(status()).toBe('Archived "Standup moves to 10:30".')
  expect(rows()[1].hidden).toBe(true)
  expect(document.activeElement).toBe(rows()[2])
  expect(tabbable(page.root)).toEqual([rows()[2]])
})

test("pointer: on the page, a mouse button runs its action and the status line reports it", async () => {
  page.root.querySelector<HTMLButtonElement>('b11-row-tool[value="lease:flag"] button')!.click()
  await settle()
  expect(status()).toBe('Unflagged "Lease renewal".')
  page.root.querySelector<HTMLButtonElement>('b11-row-tool[value="trip:read"] button')!.click()
  await settle()
  expect(status()).toBe('Marked "Photos from the trip" as unread.')
})

test("agent: an agent finds the inbox and its messages, marks 1 read, flags 1 and archives 1, and an unknown message is refused", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const list = page.live().find((entry) => entry.label === "Inbox")!
  expect(list.actions).toEqual(["markRead", "flag", "archive"])
  const found = JSON.stringify(await page.agent.query({ within: "Inbox" }))
  expect(found).toContain("New sign-in on Windows")
  expect(found).not.toContain("Standup moves to 10:30")

  const wrong = await page.agent.act({ steps: [{ ref: "Inbox", action: "archive", args: ["Lunch on Friday"] }] })
  expect(wrong.ok).toBe(false)
  expect(wrong.error?.message).toContain('No message "Lunch on Friday" in the inbox.')

  const result = await page.agent.act({
    steps: [
      { ref: "Inbox", action: "markRead", args: ["signin"] },
      { ref: "Inbox", action: "flag", args: ["Photos from the trip"] },
      { ref: "Inbox", action: "archive", args: ["lease"] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe('Archived "Lease renewal".')
  expect(page.root.querySelector('b11-row[value="signin"]')!.hasAttribute("data-unread")).toBe(false)
  expect(page.root.querySelector('b11-row[value="trip"]')!.hasAttribute("data-flagged")).toBe(true)
  expect(page.root.querySelector<HTMLElement>('b11-row[value="lease"]')!.hasAttribute("hidden")).toBe(true)
})
