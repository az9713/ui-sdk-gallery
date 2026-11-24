import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A18-video-clip-timeline"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const items = () => [...root.querySelectorAll<HTMLElement>("ui-timeline-item")]
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!
const stops = () => items().filter((el) => el.tabIndex === 0)
const focused = () => items().indexOf(document.activeElement as HTMLElement)
const states = () => items().map((el) => el.getAttribute("status"))
const note = (index: number) => items()[index].querySelector("ui-timeline-description")!.textContent

test("names: the timeline and each control have the name that the page shows", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const labels = live().map((entry) => entry.label)
  for (const label of ["Teaser clips", "Previous clip", "Next clip", "Go to playhead"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  const timeline = root.querySelector("ui-timeline")!
  expect(timeline.getAttribute("aria-label")).toBe("Teaser clips")
  expect(timeline.getAttribute("role")).toBe("list")
  expect(items()).toHaveLength(5)
  for (const name of ["Previous clip", "Next clip", "Go to playhead"]) expect(button(name).getAttribute("aria-disabled")).toBeNull()
})

test("keyboard: the clips are 1 tab stop, and it is the clip at the playhead", async () => {
  await settle()
  expect(stops()).toHaveLength(1)
  expect(stops()[0].textContent).toContain("Product close-up")
  expect(stops()[0].getAttribute("aria-current")).toBe("step")
  expect(states()).toEqual(["complete", "complete", "current", "upcoming", "upcoming"])
  expect(tabbable(root).filter((el) => el.localName === "ui-timeline-item")).toEqual(stops())
  expect(tabbable(root)[0]).toBe(stops()[0])
  stops()[0].focus()
  await keys("Tab")
  expect(document.activeElement).toBe(button("Previous clip"))
})

test("keyboard: ArrowRight and ArrowLeft move between clips, and ArrowDown does nothing", async () => {
  stops()[0].focus()
  expect(focused()).toBe(2)
  await keys("ArrowRight")
  expect(focused()).toBe(3)
  await keys("ArrowLeft", "ArrowLeft")
  expect(focused()).toBe(1)
  await keys("ArrowDown", "ArrowUp")
  expect(focused()).toBe(1)
  expect(stops()).toEqual([items()[1]])
})

test("keyboard: Home and End jump to the first and last clip, and the ends do not wrap", async () => {
  await keys("End")
  expect(focused()).toBe(4)
  await keys("ArrowRight")
  expect(focused()).toBe(4)
  await keys("Home")
  expect(focused()).toBe(0)
  await keys("ArrowLeft")
  expect(focused()).toBe(0)
})

test("keyboard: Enter and Space on Next clip and Previous clip move the playhead, and each clip shows its state", async () => {
  button("Next clip").focus()
  await keys("Enter")
  expect(status()).toBe("Playhead at 00:12 on Interview b-roll.")
  expect(states()).toEqual(["complete", "complete", "complete", "current", "upcoming"])
  expect(items()[3].getAttribute("aria-current")).toBe("step")
  expect(items()[2].getAttribute("aria-current")).toBeNull()
  expect(note(3)).toBe("7 s, current")
  expect(note(0)).toBe("3 s, played")
  expect(note(4)).toBe("5 s, ahead")
  button("Previous clip").focus()
  await keys("Space", "Space")
  expect(status()).toBe("Playhead at 00:03 on Title card.")
  expect(states()).toEqual(["complete", "current", "upcoming", "upcoming", "upcoming"])
  expect(note(4)).toBe("5 s, ahead")
})

test("keyboard: the playhead stops at the first and the last clip", async () => {
  button("Previous clip").focus()
  await keys("Enter", "Enter", "Enter")
  expect(status()).toBe("Playhead at 00:00 on Cold open.")
  button("Next clip").focus()
  await keys("Enter", "Enter", "Enter", "Enter", "Enter", "Enter")
  expect(status()).toBe("Playhead at 00:19 on End card.")
  expect(states()).toEqual(["complete", "complete", "complete", "complete", "current"])
})

test("keyboard: Go to playhead returns focus to the clip at the playhead", async () => {
  items()[0].focus()
  button("Go to playhead").focus()
  await keys("Enter")
  expect(document.activeElement).toBe(items()[4])
  expect(items()[4].getAttribute("aria-current")).toBe("step")
})

test("direction: Left and Right swap in right-to-left text", async () => {
  const dir = document.documentElement.dir
  try {
    document.documentElement.dir = "ltr"
    items()[1].focus()
    await keys("ArrowRight")
    const ltr = focused()
    document.documentElement.dir = "rtl"
    items()[1].focus()
    await keys("ArrowRight")
    expect(ltr).toBe(2)
    expect(focused()).toBe(0)
  } finally {
    document.documentElement.dir = dir
  }
})

test("agent: an agent moves the playhead and returns focus to its clip", async () => {
  const back = await agent.act({ steps: [{ ref: "Previous clip", action: "press" }] })
  expect(back.ok, back.error?.message).toBe(true)
  expect(status()).toBe("Playhead at 00:12 on Interview b-roll.")
  const result = await agent.act({
    steps: [
      { ref: "Next clip", action: "press" },
      { ref: "Go to playhead", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Playhead at 00:19 on End card.")
  expect(states()).toEqual(["complete", "complete", "complete", "complete", "current"])
  expect(document.activeElement).toBe(items()[4])
  expect(ui.task!.done(root)).toBe(true)
})
