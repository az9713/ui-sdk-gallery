import { checkServer, mount } from "@ui-sdk/core/testing"
import { beforeAll, expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui, { chatThread } from "./B12-chat-thread"

// jsdom has no Element.scrollTo, and its ResizeObserver never reports. This one reports when a test calls grow().
const observers = new Set<ResizeObserverCallback>()
const grow = () => observers.forEach((callback) => callback([], {} as ResizeObserver))
beforeAll(() => {
  Element.prototype.scrollTo = function (this: Element, options?: ScrollToOptions | number) {
    if (typeof options === "object" && options.top !== undefined) this.scrollTop = options.top
  } as Element["scrollTo"]
  globalThis.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() {
      observers.add(this.callback)
    }
    unobserve() {}
    disconnect() {
      observers.delete(this.callback)
    }
  }
})

const markup = `<root aria-label="Chat"><scroller aria-label="Messages"><log><p>Hi</p></log></scroller><jump>Jump to latest</jump><composer aria-label="Message"></composer><send>Send</send></root>`
const options = { defaultSent: ["First note", "Second note"] }
type View = ReturnType<typeof mount<typeof chatThread>>
const field = (view: View) => view.part("composer") as HTMLInputElement
const shown = (el: HTMLElement | null | undefined) => !!el && el.isConnected && !el.hidden
// A scroller of 200 px that shows the end of 1000 px of content, as a browser would lay it out.
const box = (el: HTMLElement, height = 1000) => {
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => height })
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => 200 })
}

test("keyboard: ArrowUp brings back earlier messages, newest first, and ArrowDown returns to the draft", async () => {
  const view = mount(chatThread, options, markup)
  try {
    field(view).focus()
    await view.type("Half a thought")
    await view.keys("ArrowUp")
    expect(field(view).value).toBe("Second note")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "history-key", source: "keyboard" })
    await view.keys("ArrowUp")
    expect(field(view).value).toBe("First note")
    await view.keys("ArrowUp")
    expect(field(view).value).toBe("First note")
    await view.keys("ArrowDown")
    expect(field(view).value).toBe("Second note")
    await view.keys("ArrowDown")
    expect(field(view).value).toBe("Half a thought")
    expect(view.state.value).toBe("Half a thought")
    expect(view.state.sent).toEqual(["First note", "Second note"])
  } finally {
    view.unmount()
  }
})

test("keyboard: Enter sends the draft, clears the field, and the sent message is the first that ArrowUp brings back", async () => {
  const view = mount(chatThread, options, markup)
  try {
    field(view).focus()
    await view.type("  Third note ")
    await view.keys("Enter")
    expect(view.state.sent).toEqual(["First note", "Second note", "Third note"])
    expect(view.changes.find((c) => c.key === "sent")).toMatchObject({ reason: "send", source: "keyboard" })
    expect(field(view).value).toBe("")
    expect(document.activeElement).toBe(field(view))
    await view.keys("ArrowUp")
    expect(field(view).value).toBe("Third note")
  } finally {
    view.unmount()
  }
})

test("keyboard: Enter on an empty or blank field sends nothing", async () => {
  const view = mount(chatThread, options, markup)
  try {
    field(view).focus()
    await view.keys("Enter")
    await view.type("   ")
    await view.keys("Enter")
    expect(view.state.sent).toEqual(["First note", "Second note"])
    expect(view.changes.some((c) => c.key === "sent")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: Shift+Enter and the modifier arrows leave the draft alone", async () => {
  const view = mount(chatThread, options, markup)
  try {
    field(view).focus()
    await view.type("Draft")
    await view.keys("Shift+Enter", "Shift+ArrowUp")
    expect(view.state.sent).toEqual(["First note", "Second note"])
    expect(field(view).value).toBe("Draft")
  } finally {
    view.unmount()
  }
})

test("keyboard: a click on Send sends the draft", async () => {
  const view = mount(chatThread, options, markup)
  try {
    field(view).focus()
    await view.type("By click")
    await view.click(view.part("send")!)
    expect(view.state.sent.at(-1)).toBe("By click")
    expect(view.state.value).toBe("")
  } finally {
    view.unmount()
  }
})

test("keyboard: the log follows new content while the reader is at the bottom", async () => {
  const view = mount(chatThread, options, markup)
  try {
    const scroller = view.part("scroller")!
    expect(scroller.getAttribute("role")).toBe("region")
    expect(scroller.getAttribute("tabindex")).toBe("0")
    expect(view.part("log")!.getAttribute("role")).toBe("log")
    box(scroller, 1000)
    grow()
    await view.settle()
    expect(scroller.scrollTop).toBe(800)
    box(scroller, 1400)
    grow()
    await view.settle()
    expect(scroller.scrollTop).toBe(1200)
    expect(view.state.following).toBe(true)
  } finally {
    view.unmount()
  }
})

test("keyboard: the jump button shows only after the reader leaves the bottom, and it goes back to the end", async () => {
  const view = mount(chatThread, options, markup)
  try {
    const scroller = view.part("scroller")!
    box(scroller)
    grow()
    await view.settle()
    expect(shown(view.part("jump"))).toBe(false)
    scroller.scrollTop = 100
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true }))
    scroller.dispatchEvent(new Event("scroll"))
    await view.settle()
    expect(view.state.following).toBe(false)
    expect(shown(view.part("jump"))).toBe(true)
    box(scroller, 1400)
    grow()
    await view.settle()
    expect(scroller.scrollTop).toBe(100)
    await view.click(view.part("jump")!)
    await view.settle()
    expect(scroller.scrollTop).toBe(1200)
    expect(view.state.following).toBe(true)
    expect(shown(view.part("jump"))).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: sending while scrolled up goes back to the end", async () => {
  const view = mount(chatThread, options, markup)
  try {
    const scroller = view.part("scroller")!
    box(scroller)
    grow()
    scroller.scrollTop = 100
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true }))
    scroller.dispatchEvent(new Event("scroll"))
    await view.settle()
    expect(view.state.following).toBe(false)
    field(view).focus()
    await view.type("Back down")
    await view.keys("Enter")
    expect(view.state.following).toBe(true)
    expect(scroller.scrollTop).toBe(800)
  } finally {
    view.unmount()
  }
})

test("server: the chat thread renders with no DOM", () => {
  checkServer(chatThread, options, markup)
})

// The field is a text input, so Left and Right move its caret. ArrowUp and ArrowDown must not change with the direction.
test("direction: ArrowUp and ArrowDown bring back the same messages in ltr and rtl", async () => {
  const results: string[][] = []
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(chatThread, options, markup)
    try {
      field(view).focus()
      await view.keys("ArrowUp")
      const up = field(view).value
      await view.keys("ArrowUp", "ArrowDown")
      results.push([up, field(view).value])
    } finally {
      view.unmount()
    }
  }
  document.documentElement.dir = "ltr"
  expect(results).toEqual([
    ["Second note", "Second note"],
    ["Second note", "Second note"],
  ])
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const input = () => page.root.querySelector<HTMLInputElement>("b12-composer input")!
const bubbles = () => [...page.root.querySelectorAll("b12-log article")]

test("names: the page names the thread, the message list, the field and the buttons", async () => {
  page = mountUI(ui)
  await settle()
  const thread = page.root.querySelector("b12-thread")!
  expect(thread.getAttribute("role")).toBe("group")
  expect(thread.getAttribute("aria-label")).toBe("Chat with Mara")
  expect(page.root.querySelector("b12-scroller")!.getAttribute("aria-label")).toBe("Messages")
  expect(page.root.querySelector("b12-log")!.getAttribute("role")).toBe("log")
  expect(input().getAttribute("aria-label")).toBe("Message")
  expect(page.root.querySelector("b12-send button")!.textContent).toBe("Send")
  expect(page.root.querySelector("b12-jump button")!.textContent).toBe("Jump to latest")
  expect(page.root.querySelector<HTMLElement>("b12-jump button")!.hidden).toBe(true)
  expect(bubbles().length).toBe(10)
  expect(page.root.querySelector("h2")!.textContent).toBe("Chat with Mara Lund")
})

test("keyboard: on the page, Tab reaches the list, the field and Send, in that order", async () => {
  const stops = tabbable(page.root)
  expect(stops.map((el) => el.localName)).toEqual(["b12-scroller", "input", "button"])
  expect(stops[2]!.textContent).toBe("Send")
})

test("keyboard: on the page, ArrowUp brings back my last message, and Enter sends a new one into the list", async () => {
  input().focus()
  await keys("ArrowUp")
  expect(input().value).toBe("The screen is fine. Please confirm the hold for room B")
  await keys("ArrowUp")
  expect(input().value).toBe("Only for the afternoon session")
  await keys("ArrowDown", "ArrowDown")
  expect(input().value).toBe("")
  input().value = "<b>Running late</b>"
  input().dispatchEvent(new Event("input", { bubbles: true }))
  await keys("Enter")
  expect(status()).toBe("Sent: <b>Running late</b>")
  expect(bubbles().length).toBe(11)
  expect(bubbles().at(-1)!.getAttribute("data-from")).toBe("you")
  expect(bubbles().at(-1)!.querySelector("p:last-child")!.textContent).toBe("<b>Running late</b>")
  expect(bubbles().at(-1)!.querySelector("b")!.textContent).toBe("You")
  expect(input().value).toBe("")
  await keys("ArrowUp")
  expect(input().value).toBe("<b>Running late</b>")
  await keys("ArrowDown")
})

test("agent: an agent finds the thread, writes a draft and sends it, and an empty send is refused", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const thread = page.live().find((entry) => entry.label === "Chat with Mara")!
  expect([...thread.actions].sort()).toEqual(["send", "setValue"])
  expect(thread.value).toBe("")

  const result = await page.agent.act({
    steps: [
      { ref: "Chat with Mara", action: "setValue", args: ["Leaving now. See you at 10"] },
      { ref: "Chat with Mara", action: "send" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Sent: Leaving now. See you at 10")
  expect(bubbles().at(-1)!.textContent).toContain("Leaving now. See you at 10")
  expect(input().value).toBe("")

  const empty = await page.agent.act({ steps: [{ ref: "Chat with Mara", action: "send" }] })
  expect(empty.steps[0]?.result).toBe(false)
  expect(bubbles().length).toBe(12)

  const direct = await page.agent.act({ steps: [{ ref: "Chat with Mara", action: "send", args: ["Parking at the back"] }] })
  expect(direct.ok, direct.error?.message).toBe(true)
  expect(status()).toBe("Sent: Parking at the back")
  input().focus()
  await keys("ArrowUp")
  expect(input().value).toBe("Parking at the back")
})
