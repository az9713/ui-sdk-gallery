import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { tripDraft } from "./B30-trip-draft"

const FIELDS = ["name", "distance", "climb", "start"]
const markup = `<root aria-label="Trip draft">${FIELDS.map((key) => `<field value="${key}" aria-label="${key}" />`).join("")}</root>`
const start = { name: "Eagle Ridge loop", distance: "14", climb: "850", start: "420" }
type View = ReturnType<typeof mount<typeof tripDraft>>
type Commit = { value: Record<string, string>; reason: string; source: string }

function open(defaultValue: Record<string, string> = start) {
  const commits: Commit[] = []
  const view = mount(
    tripDraft,
    { defaultValue, onValueCommit: (value: Record<string, string>, details: { reason: string; source: string }) => commits.push({ value, reason: details.reason, source: details.source }) },
    markup,
  )
  return { view, commits }
}
const field = (view: View, key: string) => view.part("field", key) as HTMLInputElement
// A person types: the input holds the new text and fires input.
const type = (view: View, key: string, text: string) => {
  const input = field(view, key)
  input.value = text
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }))
}

test("keyboard: Tab visits the 4 fields in order, and the root is not a tab stop", async () => {
  const { view } = open()
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(field(view, "name"))
    await view.keys("Tab", "Tab", "Tab")
    expect(document.activeElement).toBe(field(view, "start"))
    expect(view.root.getAttribute("role")).toBe("group")
    expect(view.root.hasAttribute("tabindex")).toBe(false)
    expect(field(view, "name").type).toBe("text")
    expect(field(view, "distance").type).toBe("number")
    expect(field(view, "distance").min).toBe("1")
    expect(field(view, "distance").max).toBe("60")
    expect(field(view, "climb").step).toBe("50")
    expect(FIELDS.map((key) => field(view, key).value)).toEqual(["Eagle Ridge loop", "14", "850", "420"])
  } finally {
    view.unmount()
  }
})

test("keyboard: typing changes the draft and commits nothing until Enter or a change event ends the step", async () => {
  const { view, commits } = open()
  try {
    await view.keys("Tab", "Tab")
    type(view, "distance", "18")
    await settle()
    expect(view.state.value.distance).toBe("18")
    expect(view.state.saved.distance).toBe("14")
    expect(commits).toEqual([])
    expect(field(view, "distance").hasAttribute("data-dirty")).toBe(true)
    expect(view.root.hasAttribute("data-dirty")).toBe(true)
    await view.keys("Enter")
    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({ reason: "enter-key", source: "keyboard", value: { distance: "18" } })
    expect(view.state.saved.distance).toBe("18")
    expect(field(view, "distance").hasAttribute("data-dirty")).toBe(false)
    expect(view.root.hasAttribute("data-dirty")).toBe(false)
    // Enter again has nothing new to commit.
    await view.keys("Enter")
    expect(commits).toHaveLength(1)
    // A change event is the browser's report that the person left the field.
    type(view, "climb", "900")
    await settle()
    field(view, "climb").dispatchEvent(new Event("change", { bubbles: true }))
    await settle()
    expect(commits).toHaveLength(2)
    expect(commits[1]).toMatchObject({ reason: "blur", value: { climb: "900" } })
  } finally {
    view.unmount()
  }
})

test("keyboard: ArrowUp and ArrowDown step a number and commit each step, and PageUp steps by 5", async () => {
  const { view, commits } = open()
  try {
    await view.keys("Tab", "Tab")
    expect(document.activeElement).toBe(field(view, "distance"))
    await view.keys("ArrowUp", "ArrowUp")
    expect(view.state.value.distance).toBe("16")
    expect(commits.map((c) => c.value.distance)).toEqual(["15", "16"])
    expect(commits[1]).toMatchObject({ reason: "step-key", source: "keyboard" })
    await view.keys("ArrowDown", "PageUp")
    expect(view.state.value.distance).toBe("20")
    await view.keys("PageDown", "PageDown", "PageDown", "PageDown", "PageDown")
    expect(view.state.value.distance).toBe("1")
    expect(field(view, "distance").value).toBe("1")
    await view.keys("Tab")
    await view.keys("ArrowUp")
    expect(view.state.value.climb).toBe("900")
    // The name field is text: the arrow keys leave it alone.
    await view.keys("Shift+Tab", "Shift+Tab")
    const before = commits.length
    await view.keys("ArrowUp", "ArrowDown")
    expect(view.state.value.name).toBe("Eagle Ridge loop")
    expect(commits).toHaveLength(before)
  } finally {
    view.unmount()
  }
})

test("keyboard: a number is rounded and kept in its range, and an empty entry returns to the saved value", async () => {
  const { view, commits } = open()
  try {
    await view.keys("Tab", "Tab")
    type(view, "distance", "99")
    await view.keys("Enter")
    expect(view.state.value.distance).toBe("60")
    expect(field(view, "distance").value).toBe("60")
    type(view, "distance", "")
    await view.keys("Enter")
    expect(view.state.value.distance).toBe("60")
    expect(field(view, "distance").value).toBe("60")
    type(view, "distance", "12.6")
    await view.keys("Enter")
    expect(view.state.value.distance).toBe("13")
    await view.keys("ArrowUp")
    expect(view.state.value.distance).toBe("14")
    await view.keys("PageUp", "PageUp", "PageUp", "PageUp", "PageUp", "PageUp", "PageUp", "PageUp", "PageUp", "PageUp", "PageUp", "PageUp")
    expect(view.state.value.distance).toBe("60")
    await view.keys("Shift+Tab")
    type(view, "name", "   ")
    await view.keys("Enter")
    expect(view.state.value.name).toBe("Eagle Ridge loop")
    type(view, "name", "  Cairn walk ")
    await view.keys("Enter")
    expect(view.state.value.name).toBe("Cairn walk")
    expect(commits.at(-1)).toMatchObject({ value: { name: "Cairn walk" } })
  } finally {
    view.unmount()
  }
})

test("server: the trip draft renders with no DOM", () => {
  checkServer(tripDraft, { defaultValue: start }, markup)
})

test("direction: the arrow keys give the same result in left to right and right to left", async () => {
  const results: string[] = []
  for (const dir of ["ltr", "rtl"]) {
    document.documentElement.dir = dir
    const { view } = open()
    try {
      await view.keys("Tab", "Tab", "ArrowUp", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight")
      expect(document.activeElement).toBe(field(view, "distance"))
      results.push(view.state.value.distance)
    } finally {
      view.unmount()
    }
  }
  document.documentElement.dir = "ltr"
  expect(results).toEqual(["15", "15"])
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const input = (name: string) => page.root.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!
const stored = () => JSON.parse(sessionStorage.getItem("b30-trip-draft") ?? "null")
const area = () => page.root.querySelector("[data-area]")!.getAttribute("d")
const typeOnPage = (name: string, text: string) => {
  input(name).value = text
  input(name).dispatchEvent(new InputEvent("input", { bubbles: true, data: text }))
}

test("names: the page names the draft, each field and the 2 buttons", async () => {
  sessionStorage.clear()
  page = mountUI(ui)
  await settle()
  expect(page.root.querySelector("b30-trip")!.getAttribute("aria-label")).toBe("Trip draft")
  expect(page.root.querySelector("b30-trip")!.getAttribute("role")).toBe("group")
  expect([...page.root.querySelectorAll("input")].map((el) => el.getAttribute("aria-label"))).toEqual([
    "Trail name",
    "Distance (km)",
    "Climb (m)",
    "Trailhead (m)",
  ])
  expect([...page.root.querySelectorAll("button")].map((el) => el.textContent)).toEqual(["Plan trip", "Discard draft"])
  expect(input("Trail name").value).toBe("Eagle Ridge loop")
  expect(status()).toBe("No draft is saved.")
  expect(page.root.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true")
  expect(page.root.querySelectorAll("[data-contours] path").length).toBeGreaterThan(5)
  expect(page.root.querySelector("[data-summary]")!.textContent).toBe("14 km, trailhead 420 m, high point 1,270 m.")
  expect(page.root.querySelector("[data-title]")!.textContent).toBe("Eagle Ridge loop")
  expect(area()).toMatch(/^M/)
})

test("keyboard: a committed step is written to session storage, and a typed value is not", async () => {
  expect(sessionStorage.getItem("b30-trip-draft")).toBeNull()
  input("Distance (km)").focus()
  typeOnPage("Distance (km)", "17")
  await settle()
  expect(status()).toBe("Editing: the draft is saved when you leave the field or press Enter.")
  expect(sessionStorage.getItem("b30-trip-draft")).toBeNull()
  await keys("Enter")
  expect(status()).toBe("Draft saved: Eagle Ridge loop, 17 km, 850 m climb.")
  expect(stored()).toEqual({ name: "Eagle Ridge loop", distance: "17", climb: "850", start: "420" })
  await keys("ArrowUp")
  expect(status()).toBe("Draft saved: Eagle Ridge loop, 18 km, 850 m climb.")
  expect(stored().distance).toBe("18")
})

test("keyboard: after a reload the page shows the saved draft, and Plan trip clears it", async () => {
  // A reload mounts the page again, in a new root, with the same session storage.
  page.root.remove()
  const root = document.body.appendChild(document.createElement("section"))
  ui.mount(root, { agent: page.agent, ask: async () => true })
  page.root = root
  await settle()
  expect(input("Distance (km)").value).toBe("18")
  expect(input("Trail name").value).toBe("Eagle Ridge loop")
  expect(status()).toBe("Draft restored: Eagle Ridge loop, 18 km, 850 m climb.")
  expect(page.root.querySelector("[data-summary]")!.textContent).toBe("18 km, trailhead 420 m, high point 1,270 m.")
  input("Climb (m)").focus()
  await keys("PageUp", "Tab", "Tab")
  expect(document.activeElement!.textContent).toBe("Plan trip")
  await keys("Enter")
  expect(status()).toBe("Planned: Eagle Ridge loop, 18 km, 1100 m climb.")
  expect(sessionStorage.getItem("b30-trip-draft")).toBeNull()
})

test("keyboard: a saved draft that is damaged is read field by field", async () => {
  sessionStorage.setItem("b30-trip-draft", JSON.stringify({ name: "Hollow Tor", distance: "500", climb: 12, start: "" }))
  page.root.remove()
  const root = document.body.appendChild(document.createElement("section"))
  ui.mount(root, { agent: page.agent, ask: async () => true })
  page.root = root
  await settle()
  expect(input("Trail name").value).toBe("Hollow Tor")
  expect(input("Distance (km)").value).toBe("60")
  expect(input("Climb (m)").value).toBe("850")
  expect(input("Trailhead (m)").value).toBe("420")
  sessionStorage.setItem("b30-trip-draft", "not json")
  page.root.remove()
  const again = document.body.appendChild(document.createElement("section"))
  ui.mount(again, { agent: page.agent, ask: async () => true })
  page.root = again
  await settle()
  expect(input("Trail name").value).toBe("Eagle Ridge loop")
  expect(status()).toBe("No draft is saved.")
})

test("agent: an agent finds the draft, sets fields that are committed, and plans the trip", async () => {
  sessionStorage.clear()
  page.root.remove()
  const root = document.body.appendChild(document.createElement("section"))
  ui.mount(root, { agent: page.agent, ask: async () => true })
  page.root = root
  await settle()
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const draft = page.live().find((entry) => entry.label === "Trip draft")!
  expect(draft.actions).toEqual(["setField", "reset"])
  expect(draft.value).toMatchObject({ distance: "14", climb: "850" })

  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Planned: Ridge traverse, 22 km, 1400 m climb.")
  expect(ui.task!.done(page.root)).toBe(true)
  expect(input("Trail name").value).toBe("Ridge traverse")
  expect(input("Distance (km)").value).toBe("22")
  expect(sessionStorage.getItem("b30-trip-draft")).toBeNull()
})

test("agent: setField commits through the api, refuses an unknown field and text that is not a number", async () => {
  const bad = await page.agent.act({ steps: [{ ref: "Trip draft", action: "setField", args: ["height", "5"] }] })
  expect(bad.ok).toBe(false)
  expect(bad.error?.message).toContain('No field "height". Fields: name, distance, climb, start.')
  const text = await page.agent.act({ steps: [{ ref: "Trip draft", action: "setField", args: ["distance", "far"] }] })
  expect(text.ok).toBe(false)
  expect(text.error?.message).toContain('Distance (km) takes a number, not "far".')
  expect(input("Distance (km)").value).toBe("22")

  const over = await page.agent.act({ steps: [{ ref: "Trip draft", action: "setField", args: ["climb", 9000] }] })
  expect(over.ok, over.error?.message).toBe(true)
  expect(over.steps[0].result).toBe("3000")
  expect(input("Climb (m)").value).toBe("3000")
  expect(stored().climb).toBe("3000")
  expect(status()).toBe("Draft saved: Ridge traverse, 22 km, 3000 m climb.")
})

test("agent: the elevation profile is redrawn from the values that an agent sets", async () => {
  const before = area()
  const summary = () => page.root.querySelector("[data-summary]")!.textContent
  expect(summary()).toBe("22 km, trailhead 420 m, high point 3,420 m.")
  const result = await page.agent.act({
    steps: [
      { ref: "Trip draft", action: "setField", args: ["climb", 300] },
      { ref: "Trip draft", action: "setField", args: ["start", 1200] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(area()).not.toBe(before)
  expect(summary()).toBe("22 km, trailhead 1,200 m, high point 1,500 m.")
  const labels = [...page.root.querySelectorAll("[data-ylabel]")].map((el) => el.textContent)
  expect(labels.at(-1)).toBe("1,500 m")
  expect([...page.root.querySelectorAll("[data-xlabel]")].map((el) => el.textContent)).toEqual(["0 km", "10 km", "20 km", "30 km"])
  // Typing redraws the profile before the step is committed.
  const typed = area()
  typeOnPage("Distance (km)", "40")
  await settle()
  expect(area()).not.toBe(typed)
  expect(summary()).toContain("40 km")
})

test("agent: Discard draft returns each field to the start and empties session storage", async () => {
  await page.agent.act({ steps: [{ ref: "Trip draft", action: "setField", args: ["name", "Scratch"] }] })
  expect(stored().name).toBe("Scratch")
  const result = await page.agent.act({ steps: [{ ref: "Discard draft", action: "press" }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Draft discarded.")
  expect(sessionStorage.getItem("b30-trip-draft")).toBeNull()
  expect(input("Trail name").value).toBe("Eagle Ridge loop")
  expect(input("Distance (km)").value).toBe("14")
  expect(page.root.querySelector("b30-trip")!.hasAttribute("data-dirty")).toBe(false)
})
