import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { tagList } from "./B25-tag-list"

// 4 tags, each with a cross button.
const ids = ["a", "b", "c", "d"]
const names = { a: "Alpha", b: "Beta", c: "Gamma", d: "Delta" }
const tag = (id: string) => `<tag value="${id}">${names[id as keyof typeof names]}<remove value="${id}"></remove></tag>`
const markup = `<root aria-label="Tags">${ids.map(tag).join("")}</root>`
const options = { tags: names }
type View = ReturnType<typeof mount<typeof tagList>>
const focused = () => document.activeElement?.textContent

test("keyboard: Left and Right move between tags, Home and End go to the ends, and the list is 1 tab stop", async () => {
  const view = mount(tagList, options, markup)
  try {
    await view.keys("Tab")
    expect(focused()).toBe("Alpha")
    await view.keys("ArrowRight", "ArrowRight")
    expect(focused()).toBe("Gamma")
    await view.keys("ArrowLeft")
    expect(focused()).toBe("Beta")
    await view.keys("End")
    expect(focused()).toBe("Delta")
    await view.keys("ArrowRight")
    expect(focused()).toBe("Delta")
    await view.keys("Home")
    expect(focused()).toBe("Alpha")
    expect(view.root.querySelectorAll('[role=listitem][tabindex="0"]').length).toBe(1)
    expect(view.part("tag", "b")!.getAttribute("tabindex")).toBe("-1")
    expect(view.changes).toEqual([])
  } finally {
    view.unmount()
  }
})

test("keyboard: Delete and Backspace remove the focused tag", async () => {
  const view = mount(tagList, options, markup)
  try {
    await view.keys("Tab", "ArrowRight", "Delete")
    expect(view.state.value).toEqual(["a", "c", "d"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "remove-key", source: "keyboard" })
    await view.keys("ArrowRight", "Backspace")
    expect(view.state.value).toEqual(["a", "d"])
    expect(view.changes.length).toBe(2)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "remove-key", source: "keyboard" })
  } finally {
    view.unmount()
  }
})

test("keyboard: the cross button removes its tag and is not a tab stop", async () => {
  const view = mount(tagList, options, markup)
  try {
    const cross = (id: string) => view.part("remove", id)!
    expect(cross("b").getAttribute("aria-label")).toBe("Remove Beta")
    expect(cross("b").getAttribute("tabindex")).toBe("-1")
    await view.click(cross("c"))
    expect(view.state.value).toEqual(["a", "b", "d"])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press" })
  } finally {
    view.unmount()
  }
})

test("server: the tag list renders with no DOM", () => {
  checkServer(tagList, options, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(tagList, options, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const tagOf = (name: string) => [...page.root.querySelectorAll<HTMLElement>("b25-tag")].find((el) => el.textContent === name)
const bars = () => [...page.root.querySelectorAll("[data-chart] [data-bar]")].map((el) => el.getAttribute("data-bar"))

test("names: the page names the list, each tag and each cross button, and draws one bar for each tag", async () => {
  page = mountUI(ui)
  await settle()
  const list = page.root.querySelector("b25-tag-list")!
  expect(list.getAttribute("aria-label")).toBe("Bird tags")
  expect(list.getAttribute("role")).toBe("list")
  expect(page.root.querySelectorAll("b25-tag").length).toBe(7)
  expect(page.root.querySelectorAll("b25-tag[role=listitem]").length).toBe(7)
  expect(tagOf("Robin")!.querySelector("button")!.getAttribute("aria-label")).toBe("Remove Robin")
  expect(page.root.querySelectorAll('b25-tag[tabindex="0"]').length).toBe(1)
  expect(bars().length).toBe(7)
  expect(page.root.querySelector("[data-chart]")!.getAttribute("role")).toBe("img")
  expect(page.root.querySelector("[data-chart]")!.getAttribute("aria-label")).toContain("Robin 11")
  expect(status()).toBe("7 species on the list, 63 sightings.")
})

test("agent: an agent finds the list, removes 2 tags by name, and cannot remove a tag that is gone", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const list = page.live().find((entry) => entry.label === "Bird tags")!
  expect(list.actions).toEqual(["remove"])
  const result = await page.agent.act({
    steps: [
      { ref: "Bird tags", action: "remove", args: ["Robin"] },
      { ref: "Bird tags", action: "remove", args: ["Pheasant"] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Removed Pheasant. 5 species left, 46 sightings.")
  expect(page.root.querySelectorAll("b25-tag").length).toBe(5)
  expect(bars()).toEqual(["mallard", "barn-owl", "red-kite", "mute-swan", "wood-pigeon"])
  const again = await page.agent.act({ steps: [{ ref: "Bird tags", action: "remove", args: ["Robin"] }] })
  expect(again.ok).toBe(false)
  expect(again.error?.message).toContain("No tag")
})

test("keyboard: removing the focused tag moves focus to the next tag", async () => {
  tagOf("Mute swan")!.focus()
  await keys("Delete")
  await settle()
  expect(tagOf("Mute swan")).toBeUndefined()
  expect(focused()).toBe("Wood pigeon")
  expect(status()).toBe("Removed Mute swan. 4 species left, 39 sightings.")
  expect(bars()).not.toContain("mute-swan")
  expect(page.root.querySelectorAll('b25-tag[tabindex="0"]').length).toBe(1)
  tagOf("Mallard")!.focus()
  await keys("Delete")
  await settle()
  expect(focused()).toBe("Barn owl")
  expect(status()).toBe("Removed Mallard. 3 species left, 25 sightings.")
})

test("keyboard: removing the last tag moves focus to the one before it", async () => {
  tagOf("Wood pigeon")!.focus()
  await keys("Backspace")
  await settle()
  expect(tagOf("Wood pigeon")).toBeUndefined()
  expect(focused()).toBe("Red kite")
  expect(status()).toBe("Removed Wood pigeon. 2 species left, 7 sightings.")
})

test("keyboard: the cross button of a tag removes it on the page and the chart follows", async () => {
  const cross = tagOf("Barn owl")!.querySelector<HTMLElement>("button")!
  expect(cross.getAttribute("tabindex")).toBe("-1")
  cross.click()
  await settle()
  expect(tagOf("Barn owl")).toBeUndefined()
  expect(bars()).toEqual(["red-kite"])
  expect(status()).toBe("Removed Barn owl. 1 species left, 5 sightings.")
})

test("keyboard: removing the only tag left leaves no tag to take focus", async () => {
  tagOf("Red kite")!.focus()
  await keys("Delete")
  await settle()
  expect(page.root.querySelectorAll("b25-tag").length).toBe(0)
  expect(page.root.contains(document.activeElement)).toBe(false)
  expect(status()).toBe("Removed Red kite. 0 species left, 0 sightings.")
  expect(page.root.querySelector("[data-chart]")!.getAttribute("aria-label")).toContain("none left")
})
