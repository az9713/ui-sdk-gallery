import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { uploadQueue } from "./B21-upload-queue"

// 3 files. b.txt fails at 50% on its first try.
const names = ["a.txt", "b.txt", "c.txt"]
const markup = `<root aria-label="Upload queue">${names.map((n) => `<file value="${n}">${n} <small data-note>Waiting</small></file>`).join("")}</root>`
const options = { broken: ["b.txt"] }
type View = ReturnType<typeof mount<typeof uploadQueue>>
const file = (view: View, id: string) => view.part("file", id)!
const noteOf = (view: View, id: string) => file(view, id).querySelector("[data-note]")!.textContent
const status = (view: View, id: string) => view.state.value[id]?.status ?? "queued"
test("keyboard: the queue is 1 tab stop, and the arrow keys move focus", async () => {
  const view = mount(uploadQueue, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(file(view, "a.txt"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(file(view, "b.txt").getAttribute("tabindex")).toBe("-1")
    await view.keys("ArrowDown", "ArrowDown")
    expect(document.activeElement).toBe(file(view, "c.txt"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    await view.keys("ArrowUp")
    expect(document.activeElement).toBe(file(view, "b.txt"))
    await view.keys("End")
    expect(document.activeElement).toBe(file(view, "c.txt"))
    await view.keys("Home")
    expect(document.activeElement).toBe(file(view, "a.txt"))
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: a file is announced at 50% and when it is done, and not at 25% or 75%", async () => {
  const view = mount(uploadQueue, options, markup)
  try {
    view.api.advance()
    await view.settle()
    expect(file(view, "a.txt").getAttribute("data-percent")).toBe("25")
    expect(file(view, "a.txt").getAttribute("data-state")).toBe("uploading")
    expect(noteOf(view, "a.txt")).toBe("Uploading 25%")
    expect(view.announced).toEqual([])
    view.api.advance()
    await view.settle()
    expect(noteOf(view, "a.txt")).toBe("Uploading 50%")
    expect(view.announced).toEqual(["a.txt is 50% uploaded."])
    view.api.advance()
    await view.settle()
    expect(file(view, "a.txt").getAttribute("data-percent")).toBe("75")
    expect(view.announced.length).toBe(1)
    view.api.advance()
    await view.settle()
    expect(file(view, "a.txt").getAttribute("data-state")).toBe("done")
    expect(noteOf(view, "a.txt")).toBe("Uploaded")
    expect(view.announced.at(-1)).toBe("a.txt uploaded. 1 of 3 done.")
    expect(file(view, "b.txt").getAttribute("data-state")).toBe("queued")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "progress" })
  } finally {
    view.unmount()
  }
})

test("keyboard: a failed file is announced at once and the upload goes on with the next file", async () => {
  const view = mount(uploadQueue, options, markup)
  try {
    view.api.advance(4)
    expect(view.announced).toEqual(["a.txt uploaded. 1 of 3 done."])
    view.api.advance(2)
    expect(status(view, "b.txt")).toBe("failed")
    expect(file(view, "b.txt").getAttribute("data-percent")).toBe("50")
    expect(noteOf(view, "b.txt")).toBe("Failed at 50%")
    expect(view.announced.at(-1)).toBe("b.txt failed at 50%. Press R on it to retry.")
    view.api.advance(4)
    expect(status(view, "b.txt")).toBe("failed")
    expect(status(view, "c.txt")).toBe("done")
    expect(view.announced.at(-1)).toBe("c.txt uploaded. 2 of 3 done. 1 failed.")
    expect(view.api.advance()).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: R retries the focused file only when it failed", async () => {
  const view = mount(uploadQueue, options, markup)
  try {
    view.api.advance(6)
    await view.settle()
    await view.keys("Tab")
    const early = new KeyboardEvent("keydown", { key: "r", bubbles: true, cancelable: true })
    file(view, "a.txt").dispatchEvent(early)
    expect(early.defaultPrevented).toBe(false)
    expect(status(view, "a.txt")).toBe("done")
    await view.keys("ArrowDown")
    expect(status(view, "b.txt")).toBe("failed")
    await view.keys("r")
    expect(status(view, "b.txt")).toBe("uploading")
    expect(view.state.value["b.txt"]).toMatchObject({ percent: 50, retried: true })
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "retry", source: "keyboard" })
    expect(view.announced.at(-1)).toBe("Retrying b.txt from 50%.")
    expect(noteOf(view, "b.txt")).toBe("Uploading 50%")
    view.api.advance(2)
    expect(status(view, "b.txt")).toBe("done")
    const count = view.changes.length
    await view.keys("R")
    expect(view.changes.length).toBe(count)
  } finally {
    view.unmount()
  }
})

test("keyboard: Delete and Backspace cancel a file that is not done", async () => {
  const view = mount(uploadQueue, options, markup)
  try {
    view.api.advance(4)
    await view.keys("Tab", "Delete")
    expect(status(view, "a.txt")).toBe("done")
    await view.keys("ArrowDown", "Delete")
    expect(status(view, "b.txt")).toBe("canceled")
    expect(file(view, "b.txt").getAttribute("data-state")).toBe("canceled")
    expect(noteOf(view, "b.txt")).toBe("Canceled")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "cancel", source: "keyboard" })
    expect(view.announced.at(-1)).toBe("Canceled b.txt.")
    await view.keys("ArrowDown", "Backspace")
    expect(status(view, "c.txt")).toBe("canceled")
    expect(view.announced.at(-1)).toBe("Canceled c.txt. Queue finished.")
    const again = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })
    file(view, "c.txt").dispatchEvent(again)
    expect(again.defaultPrevented).toBe(false)
    expect(view.api.advance()).toBe(false)
  } finally {
    view.unmount()
  }
})

test("server: the upload queue renders with no DOM", () => {
  checkServer(uploadQueue, options, markup)
})

// The arrows are vertical. checkDirection needs Left and Right to move focus, so this test checks that both directions give the same result.
test("direction: a right to left page moves focus and cancels with the same keys", async () => {
  const results: string[][] = []
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const view = mount(uploadQueue, options, markup)
    try {
      await view.keys("Tab", "ArrowRight", "ArrowLeft")
      expect(document.activeElement, dir).toBe(file(view, "a.txt"))
      await view.keys("ArrowDown", "Delete")
      expect(document.activeElement, dir).toBe(file(view, "b.txt"))
      results.push(names.map((id) => status(view, id)))
    } finally {
      view.unmount()
      document.documentElement.removeAttribute("dir")
    }
  }
  expect(results[0]).toEqual(["queued", "canceled", "queued"])
  expect(results[1]).toEqual(results[0])
})


// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
// The page uses the real live regions. announce writes the text 100 ms after the call, so these tests watch the regions.
const heard: { text: string; priority: string }[] = []
let watcher: MutationObserver | undefined
const listen = () => {
  heard.length = 0
  watcher?.disconnect()
  watcher = new MutationObserver((records) => {
    for (const record of records) {
      const region = (record.target as Element).closest?.("[data-ui-sdk-announcer]")
      if (!region) continue
      for (const added of record.addedNodes) if (added.textContent) heard.push({ text: added.textContent, priority: region.getAttribute("aria-live")! })
    }
  })
  watcher.observe(document.body, { childList: true, subtree: true })
}
const pause = () => new Promise((done) => setTimeout(done, 130))

const A = "m31-ha-0001.fits"
const B = "m31-ha-0002.fits"
const C = "ngc7000-oiii-0003.fits"
const D = "m42-lum-0004.fits"
let page: ReturnType<typeof mountUI>
const text = () => page.root.querySelector("[data-status]")!.textContent
const queueFile = (id: string) => page.root.querySelector<HTMLElement>(`b21-file[value="${id}"]`)!
const press = async (label: string) => {
  page.root.querySelector<HTMLElement>(`ui-button[data-${label}] button`)!.focus()
  await keys("Enter")
  await pause()
}
const remount = async () => {
  page?.root.remove()
  page = mountUI(ui)
  await settle()
  listen()
}

test("names: the page names the queue, each file and the buttons, and draws a ring for each file", async () => {
  await remount()
  const queue = page.root.querySelector("b21-upload-queue")!
  expect(queue.getAttribute("aria-label")).toBe("Upload queue")
  expect(page.root.querySelector(`#${queue.getAttribute("aria-describedby")}`)!.textContent).toContain("R retries a failed file")
  expect([...page.root.querySelectorAll("b21-file")].map((el) => el.getAttribute("value"))).toEqual([A, B, C, D])
  expect([...page.root.querySelectorAll("button")].map((el) => el.textContent)).toEqual(["Upload next part", "Retry failed"])
  expect(page.root.querySelectorAll('b21-file[tabindex="0"]').length).toBe(1)
  // The status line must not read aloud: the live regions of announce do that.
  expect(page.root.querySelector("[data-status]")!.getAttribute("aria-live")).toBe("off")
  // The night starts partly sent: frame 1 is done and frame 2 is at 50%.
  expect(text()).toBe("1 of 4 uploaded.")
  expect(queueFile(A).getAttribute("data-state")).toBe("done")
  expect(queueFile(B).getAttribute("data-percent")).toBe("50")
  expect(queueFile(C).getAttribute("data-state")).toBe("queued")
  // Each ring is a decorative SVG that the status text already describes.
  for (const id of [A, B, C, D]) {
    const ring = queueFile(id).querySelector("svg")!
    expect(ring.getAttribute("aria-hidden")).toBe("true")
    expect(ring.querySelector("[data-arc]")).not.toBeNull()
  }
  const offset = (id: string) => Number(queueFile(id).querySelector("[data-arc]")!.getAttribute("stroke-dashoffset"))
  expect(offset(A)).toBeCloseTo(0, 1)
  expect(offset(B)).toBeCloseTo(offset(C) / 2, 1)
  expect(offset(C)).toBeGreaterThan(100)
})

// mount() installs its own announcer, and prepareAnnouncements does nothing then, so this test uses the page.
test("keyboard: the queue prepares both live regions when it mounts", async () => {
  for (const region of document.querySelectorAll("[data-ui-sdk-announcer]")) region.remove()
  expect(document.querySelectorAll("[data-ui-sdk-announcer]").length).toBe(0)
  await remount()
  expect(document.querySelectorAll('[aria-live="polite"]').length).toBe(1)
  expect(document.querySelectorAll('[aria-live="assertive"]').length).toBe(1)
})

test("keyboard: on the page, the buttons upload a part and retry, and the status line reports it", async () => {
  await remount()
  await press("next")
  expect(queueFile(B).getAttribute("data-percent")).toBe("75")
  expect(text()).toBe("1 of 4 uploaded.")
  expect(heard).toEqual([])
  await press("next")
  expect(queueFile(B).getAttribute("data-state")).toBe("done")
  expect(text()).toBe("2 of 4 uploaded.")
  await press("next")
  await press("next")
  expect(text()).toBe("2 of 4 uploaded, 1 failed.")
  expect(queueFile(C).getAttribute("data-state")).toBe("failed")
  await press("retry")
  expect(text()).toBe("2 of 4 uploaded.")
  expect(queueFile(C).getAttribute("data-state")).toBe("uploading")
  expect(heard.at(-1)).toEqual({ text: `Retrying ${C} from 50%.`, priority: "polite" })
})

test("keyboard: on the page, a failure is announced assertively and a finished file politely", async () => {
  await remount()
  await press("next")
  await press("next")
  expect(heard).toEqual([{ text: `${B} uploaded. 2 of 4 done.`, priority: "polite" }])
  await press("next")
  expect(heard.length).toBe(1)
  await press("next")
  expect(heard.at(-1)).toEqual({ text: `${C} failed at 50%. Press R on it to retry.`, priority: "assertive" })
  expect(heard.length).toBe(2)
  for (let i = 0; i < 4; i++) await press("next")
  expect(heard.at(-1)).toEqual({ text: `${D} uploaded. 3 of 4 done. 1 failed.`, priority: "polite" })
  expect(heard.filter((one) => one.text.includes("50%")).map((one) => one.priority)).toEqual(["assertive", "polite"])
})

test("keyboard: on the page, Delete cancels the focused file and the status line reports it", async () => {
  await remount()
  queueFile(A).focus()
  await keys("Delete")
  expect(queueFile(A).getAttribute("data-state")).toBe("done")
  queueFile(C).focus()
  await keys("Delete")
  await pause()
  expect(queueFile(C).getAttribute("data-state")).toBe("canceled")
  expect(text()).toBe("1 of 4 uploaded, 1 canceled.")
  expect(heard.at(-1)).toEqual({ text: `Canceled ${C}.`, priority: "polite" })
  await keys("ArrowDown")
  expect(document.activeElement).toBe(queueFile(D))
})

test("agent: an agent uploads 2 files, retries the failed file and finishes the queue", async () => {
  await remount()
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const queue = page.live().find((entry) => entry.label === "Upload queue")!
  expect(queue.actions).toEqual(["advance", "retry", "cancel"])
  expect(JSON.stringify(await page.agent.query({ within: "Upload queue" }))).toContain("ngc7000-oiii-0003.fits")

  const first = await page.agent.act({ steps: ui.task!.steps.slice(0, 2) })
  expect(first.ok, first.error?.message).toBe(true)
  await pause()
  expect(text()).toBe("3 of 4 uploaded, 1 failed.")
  expect(heard.find((one) => one.priority === "assertive")).toEqual({ text: `${C} failed at 50%. Press R on it to retry.`, priority: "assertive" })

  const refused = await page.agent.act({ steps: [{ ref: "Upload queue", action: "cancel", args: ["missing.txt"] }] })
  expect(refused.steps[0].result).toBe(false)

  const result = await page.agent.act({ steps: ui.task!.steps.slice(2) })
  expect(result.ok, result.error?.message).toBe(true)
  await pause()
  expect(text()).toBe("4 of 4 uploaded.")
  expect(ui.task!.done(page.root)).toBe(true)
  expect(heard.at(-1)).toEqual({ text: `${C} uploaded. 4 of 4 done. Queue finished.`, priority: "polite" })
  watcher?.disconnect()
})
