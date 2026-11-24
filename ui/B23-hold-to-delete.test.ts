import { checkServer, mount } from "@ui-sdk/core/testing"
import { afterAll, expect, test } from "vitest"
import { mountUI, settle } from "../src/testing"
import ui, { holdButton } from "./B23-hold-to-delete"

// jsdom has no Element.animate. This stub records what the helix asks of each animation.
type Fake = { el: Element; log: string[]; currentTime: number | null; playbackRate: number }
const made: Fake[] = []
Element.prototype.animate = function (this: Element) {
  const fake = {
    el: this,
    log: [] as string[],
    currentTime: 0 as number | null,
    playbackRate: 1,
    pause() {
      fake.log.push("pause")
    },
    play() {
      fake.log.push(`play ${fake.playbackRate}`)
    },
    finish() {
      fake.log.push("finish")
    },
    updatePlaybackRate(rate: number) {
      fake.playbackRate = rate
      fake.log.push(`rate ${rate}`)
    },
  }
  made.push(fake)
  return fake as unknown as Animation
}

const DELAY = 150
const options = { delay: DELAY }
const markup = `<root aria-label="Delete sample"><trigger>Hold to delete</trigger></root>`
type View = ReturnType<typeof mount<typeof holdButton>>
const open = () => mount(holdButton, options, markup)
const button = (view: View) => view.root.querySelector("button")!
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const key = (el: Element, type: "keydown" | "keyup", name: string) =>
  el.dispatchEvent(new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true }))
const pointer = (el: Element, type: string, init: PointerEventInit = {}) =>
  el.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: "mouse", button: 0, isPrimary: true, bubbles: true, cancelable: true, ...init }))
const phases = (view: View) => view.changes.map((change) => change.value)

test("keyboard: holding Space for the whole delay confirms, and Enter does the same", async () => {
  for (const name of [" ", "Enter"]) {
    const view = open()
    try {
      const el = button(view)
      el.focus()
      key(el, "keydown", name)
      await sleep(40)
      expect(view.state.phase).toBe("holding")
      expect(el.hasAttribute("data-holding")).toBe(true)
      await sleep(DELAY + 60)
      expect(view.state.phase).toBe("confirmed")
      expect(el.hasAttribute("data-held")).toBe(true)
      expect(view.changes.at(-1)).toMatchObject({ key: "phase", value: "confirmed", reason: "hold" })
      key(el, "keyup", name)
      await settle()
      expect(view.state.phase).toBe("confirmed")
      expect(phases(view)).toEqual(["holding", "confirmed"])
    } finally {
      view.unmount()
    }
  }
})

test("keyboard: letting go before the delay deletes nothing", async () => {
  const view = open()
  try {
    const el = button(view)
    el.focus()
    key(el, "keydown", " ")
    await sleep(40)
    key(el, "keyup", " ")
    await sleep(DELAY + 80)
    expect(view.state.phase).toBe("released")
    expect(phases(view)).toEqual(["holding", "released"])
    expect(view.changes.at(-1)).toMatchObject({ reason: "release" })
    expect(el.hasAttribute("data-holding")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: Escape during a hold cancels it, and the sample stays", async () => {
  const view = open()
  try {
    const el = button(view)
    el.focus()
    key(el, "keydown", " ")
    await sleep(40)
    key(el, "keydown", "Escape")
    await sleep(DELAY + 80)
    expect(view.state.phase).toBe("released")
    expect(phases(view)).not.toContain("confirmed")
  } finally {
    view.unmount()
  }
})

test("keyboard: the button is 1 tab stop and takes focus on Tab", async () => {
  const view = open()
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(button(view))
    expect(view.root.querySelectorAll("button").length).toBe(1)
    expect(view.root.querySelectorAll('[tabindex="0"], button:not([tabindex="-1"])').length).toBe(1)
    expect(button(view).hasAttribute("aria-disabled")).toBe(false)
    expect(button(view).textContent).toBe("Hold to delete")
  } finally {
    view.unmount()
  }
})

test("keyboard: after the deletion the button is aria-disabled and a new hold changes nothing", async () => {
  const view = open()
  try {
    const el = button(view)
    el.focus()
    key(el, "keydown", " ")
    await sleep(DELAY + 80)
    key(el, "keyup", " ")
    await settle()
    expect(view.state.phase).toBe("confirmed")
    expect(el.getAttribute("aria-disabled")).toBe("true")
    expect(el.hasAttribute("data-confirmed")).toBe(true)
    const count = view.changes.length
    key(el, "keydown", " ")
    await sleep(DELAY + 80)
    key(el, "keyup", " ")
    el.click()
    await settle()
    expect(view.changes.length).toBe(count)
    expect(view.state.phase).toBe("confirmed")
  } finally {
    view.unmount()
  }
})

test("keyboard: a click with no hold reports an early release", async () => {
  const view = open()
  try {
    button(view).click()
    await settle()
    expect(view.state.phase).toBe("released")
    expect(view.changes.at(-1)).toMatchObject({ key: "phase", value: "released", reason: "release" })
  } finally {
    view.unmount()
  }
})

test("pointer: a mouse press confirms after the delay, and moving away cancels it", async () => {
  const view = open()
  try {
    const el = button(view)
    pointer(el, "pointerdown", { clientX: 5, clientY: 5 })
    await sleep(40)
    expect(view.state.phase).toBe("holding")
    await sleep(DELAY + 60)
    expect(view.state.phase).toBe("confirmed")
    expect(view.changes.at(-1)).toMatchObject({ reason: "hold" })
    pointer(el, "pointerup", { clientX: 5, clientY: 5 })
    await settle()
  } finally {
    view.unmount()
  }
  const moved = open()
  try {
    const el = button(moved)
    pointer(el, "pointerdown", { clientX: 5, clientY: 5 })
    await sleep(40)
    pointer(el, "pointermove", { clientX: 60, clientY: 5 })
    await sleep(DELAY + 80)
    expect(moved.state.phase).toBe("released")
    expect(phases(moved)).not.toContain("confirmed")
  } finally {
    moved.unmount()
  }
})

test("server: the hold button renders with no DOM", () => {
  checkServer(holdButton, options, markup)
})

test("direction: a hold works the same in left to right and right to left", async () => {
  const results: string[] = []
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = open()
    try {
      const el = button(view)
      el.focus()
      key(el, "keydown", "ArrowRight")
      key(el, "keydown", "ArrowLeft")
      expect(view.state.phase).toBe("idle")
      key(el, "keydown", " ")
      await sleep(DELAY + 80)
      key(el, "keyup", " ")
      await settle()
      results.push(`${dir}: ${phases(view).join(", ")}`)
    } finally {
      view.unmount()
      document.documentElement.dir = "ltr"
    }
  }
  expect(results).toEqual(["ltr: holding, confirmed", "rtl: holding, confirmed"])
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const control = () => page.root.querySelector<HTMLElement & { api: { hold: () => boolean; reset: () => boolean } }>("b23-hold-button")!
const pageButton = () => page.root.querySelector("button")!
const visible = () => [...page.root.querySelectorAll<HTMLElement>("[data-sample-id]")].filter((item) => !item.hidden).map((item) => item.dataset.sampleId)

// A hold on the page lasts 1500 ms of real time.
async function holdPage(ms: number, name = " ") {
  const el = pageButton()
  el.focus()
  key(el, "keydown", name)
  await sleep(ms)
  key(el, "keyup", name)
  await settle()
}
const reset = async () => {
  control().api.reset()
  await settle()
}

test("names: the page names the group, the button and the 5 samples of the freezer list", async () => {
  page = mountUI(ui)
  await settle()
  expect(control().getAttribute("aria-label")).toBe("Delete sample SMP-2417")
  expect(control().getAttribute("role")).toBe("group")
  expect(control().getAttribute("aria-describedby")).toBe("b23-help")
  expect(page.root.querySelector("#b23-help")!.textContent).toContain("Hold the button for 1.5 seconds")
  expect(pageButton().textContent).toBe("Hold to delete")
  expect(pageButton().hasAttribute("aria-disabled")).toBe(false)
  expect(page.root.querySelector("[data-freezer]")!.getAttribute("aria-labelledby")).toBe("b23-freezer")
  expect(visible()).toEqual(["SMP-2415", "SMP-2416", "SMP-2417", "SMP-2418", "SMP-2419"])
  expect(status()).toBe("SMP-2417 is in the freezer list. 5 samples listed.")
  expect(page.root.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true")
  expect(page.root.querySelectorAll("[data-rung]").length).toBe(32)
})

test("keyboard: on the page, a short hold keeps the sample and a full hold deletes it", async () => {
  await holdPage(600)
  expect(status()).toBe("Released early. SMP-2417 is still in the freezer list.")
  expect(visible().length).toBe(5)
  expect(pageButton().hasAttribute("data-holding")).toBe(false)
  await holdPage(1500)
  expect(status()).toBe("Deleted SMP-2417 from the freezer list. 4 samples remain.")
  expect(visible()).toEqual(["SMP-2415", "SMP-2416", "SMP-2418", "SMP-2419"])
  expect(pageButton().getAttribute("aria-disabled")).toBe("true")
  await reset()
  expect(status()).toBe("SMP-2417 is in the freezer list. 5 samples listed.")
  expect(visible().length).toBe(5)
}, 15000)

test("helix: the 32 strand halves play on a hold, run back on an early release and finish on a delete", async () => {
  const slides = made.filter((fake) => fake.el.hasAttribute("data-strand"))
  expect(slides.length).toBe(32)
  slides.forEach((fake) => (fake.log.length = 0))
  await holdPage(500)
  expect(slides.every((fake) => fake.log.includes("play 1"))).toBe(true)
  expect(slides.every((fake) => fake.log.includes("rate -3"))).toBe(true)
  expect(slides.some((fake) => fake.log.includes("finish"))).toBe(false)
  slides.forEach((fake) => (fake.log.length = 0))
  await holdPage(1500)
  expect(slides.every((fake) => fake.log.at(-1) === "finish")).toBe(true)
  await reset()
}, 15000)

test("agent: an agent holds the button after the person allows it, and the sample leaves the list", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const entry = page.live().find((item) => item.label === "Delete sample SMP-2417")!
  expect(entry.actions).toEqual(["hold", "reset"])
  expect(entry.confirm).toBe("Deletes sample SMP-2417 from the freezer list")
  expect(entry.phase).toBe("idle")

  page.person.approves = false
  const denied = await page.agent.act({ steps: [{ ref: "Delete sample", action: "hold" }] })
  expect(denied.ok).toBe(false)
  expect(page.person.asked).toEqual(["Deletes sample SMP-2417 from the freezer list"])
  expect(visible().length).toBe(5)

  page.person.approves = true
  const result = await page.agent.act({ steps: [{ ref: "Delete sample", action: "hold" }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Deleted SMP-2417 from the freezer list. 4 samples remain.")
  expect(visible()).not.toContain("SMP-2417")
  expect(page.live().find((item) => item.label === "Delete sample SMP-2417")!.phase).toBe("confirmed")
})

const original = window.matchMedia
afterAll(() => {
  window.matchMedia = original
})

test("helix: with reduced motion the strands do not play, and a delete shows the opened helix", async () => {
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query })) as typeof window.matchMedia
  const section = document.body.appendChild(document.createElement("section"))
  ui.mount(section, { agent: page.agent, ask: async () => true })
  const slides = made.filter((fake) => section.contains(fake.el) && fake.el.hasAttribute("data-strand"))
  expect(slides.length).toBe(32)
  slides.forEach((fake) => (fake.log.length = 0))
  const el = section.querySelector("button")!
  key(el, "keydown", " ")
  await sleep(40)
  key(el, "keyup", " ")
  await settle()
  expect(slides.some((fake) => fake.log.some((line) => line.startsWith("play") || line.startsWith("rate")))).toBe(false)
  section.querySelector<HTMLElement & { api: { hold: () => boolean } }>("b23-hold-button")!.api.hold()
  await settle()
  expect(slides.every((fake) => fake.log.at(-1) === "finish")).toBe(true)
  section.remove()
}, 15000)
