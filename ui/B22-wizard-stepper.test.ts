import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { wizardStepper } from "./B22-wizard-stepper"

const options = { steps: ["Starter", "Dough", "Proof", "Bake"], defaultValue: "Starter" }
const markup = `<root aria-label="Bake schedule progress"><step value="Starter">Starter</step><step value="Dough">Dough</step><step value="Proof">Proof</step><step value="Bake">Bake</step><panel value="Starter">A</panel><panel value="Dough">B</panel><panel value="Proof">C</panel><panel value="Bake">D</panel></root>`
type View = ReturnType<typeof mount<typeof wizardStepper>>
const step = (view: View, name: string) =>
  [...view.root.querySelectorAll<HTMLElement>("[data-slot=wizard-stepper-step]")].find((el) => el.textContent === name)!

test("keyboard: arrow keys, Home and End move focus between steps", async () => {
  const view = mount(wizardStepper, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(step(view, "Starter"))
    await view.keys("ArrowRight")
    expect(document.activeElement).toBe(step(view, "Dough"))
    await view.keys("End")
    expect(document.activeElement).toBe(step(view, "Bake"))
    await view.keys("ArrowLeft")
    expect(document.activeElement).toBe(step(view, "Proof"))
    await view.keys("Home")
    expect(document.activeElement).toBe(step(view, "Starter"))
    expect(view.state.value).toBe("Starter")
  } finally {
    view.unmount()
  }
})

test("keyboard: the steps are 1 tab stop, and a step ahead keeps aria-disabled", async () => {
  const view = mount(wizardStepper, options, markup)
  try {
    expect(view.root.querySelectorAll('[data-slot=wizard-stepper-step][tabindex="0"]').length).toBe(1)
    expect(step(view, "Starter").getAttribute("tabindex")).toBe("0")
    expect(step(view, "Starter").hasAttribute("aria-disabled")).toBe(false)
    expect(step(view, "Dough").getAttribute("aria-disabled")).toBe("true")
    expect(step(view, "Bake").getAttribute("aria-disabled")).toBe("true")
    expect(step(view, "Dough").hasAttribute("disabled")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: only the current step has aria-current=step", async () => {
  const view = mount(wizardStepper, options, markup)
  try {
    expect(step(view, "Starter").getAttribute("aria-current")).toBe("step")
    expect(step(view, "Dough").hasAttribute("aria-current")).toBe(false)
    expect(view.root.querySelectorAll("[aria-current]").length).toBe(1)
    view.api.next()
    await view.settle()
    expect(step(view, "Starter").hasAttribute("aria-current")).toBe(false)
    expect(step(view, "Dough").getAttribute("aria-current")).toBe("step")
    expect(step(view, "Starter").hasAttribute("data-done")).toBe(true)
    expect(step(view, "Dough").hasAttribute("data-done")).toBe(false)
    expect(step(view, "Dough").hasAttribute("aria-disabled")).toBe(false)
    expect(step(view, "Proof").getAttribute("aria-disabled")).toBe("true")
  } finally {
    view.unmount()
  }
})

test("keyboard: a step that is not reached yet does not open", async () => {
  const view = mount(wizardStepper, options, markup)
  try {
    await view.click(step(view, "Bake"))
    expect(view.state.value).toBe("Starter")
    expect(view.api.goTo("Dough")).toBe(false)
    expect(view.state.value).toBe("Starter")
    expect(view.api.goTo("Nowhere")).toBe(false)
    view.api.next()
    await view.settle()
    expect(view.state.value).toBe("Dough")
    await view.click(step(view, "Starter"))
    expect(view.state.value).toBe("Starter")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press" })
    await view.click(step(view, "Dough"))
    expect(view.state.value).toBe("Dough")
  } finally {
    view.unmount()
  }
})

test("keyboard: Enter opens a step that is reached", async () => {
  const view = mount(wizardStepper, { ...options, defaultValue: "Dough" }, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(step(view, "Dough"))
    await view.keys("ArrowLeft", "Enter")
    expect(view.state.value).toBe("Starter")
    await view.keys("ArrowRight", "Space")
    expect(view.state.value).toBe("Dough")
    await view.keys("ArrowRight", "Enter")
    expect(view.state.value).toBe("Dough")
  } finally {
    view.unmount()
  }
})

test("keyboard: next and back stop at the first and the last step, and only the current panel shows", async () => {
  const view = mount(wizardStepper, options, markup)
  try {
    expect(view.api.back()).toBe(false)
    expect(view.api.next()).toBe(true)
    expect(view.api.next()).toBe(true)
    expect(view.api.next()).toBe(true)
    expect(view.api.next()).toBe(false)
    expect(view.state.value).toBe("Bake")
    expect(view.state.reached).toBe(3)
    expect(view.api.back()).toBe(true)
    expect(view.state.value).toBe("Proof")
    expect(view.state.reached).toBe(3)
    const panels = [...view.root.querySelectorAll<HTMLElement>("[data-slot=wizard-stepper-panel]")]
    expect(panels.filter((el) => el.isConnected && !el.hidden).map((el) => el.textContent)).toEqual(["C"])
  } finally {
    view.unmount()
  }
})

test("server: the stepper renders with no DOM", () => {
  checkServer(wizardStepper, options, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(wizardStepper, { ...options, defaultValue: "Dough" }, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const button = (name: string) => [...page.root.querySelectorAll<HTMLElement>("ui-button button")].find((b) => b.textContent === name)!
const stepButton = (name: string) => [...page.root.querySelectorAll<HTMLElement>("b22-step button")].find((b) => b.textContent === name)!
const input = (label: string) => page.root.querySelector<HTMLInputElement>(`b22-panel[value="${label}"] input`)!
const heading = () => document.activeElement as HTMLElement
const chart = () => page.root.querySelector("[data-chart]")!
// The 3rd path of the chart is the solid line. The x of its last point grows with each step.
const solidEnd = () => {
  const numbers = chart().querySelectorAll("path")[2].getAttribute("d")!.match(/-?\d+(\.\d+)?/g)!
  return Number(numbers[numbers.length - 2])
}

test("names: the page names the steps, the fields and the buttons", async () => {
  page = mountUI(ui)
  await settle()
  const labels = page.live().map((entry) => entry.label)
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Bake schedule progress", "Feed time", "Back", "Continue", "Save schedule"]) expect(labels, `${label} is missing`).toContain(label)
  expect(page.root.querySelector("b22-stepper")!.getAttribute("role")).toBe("group")
  expect(page.root.querySelectorAll("b22-step button").length).toBe(4)
  expect(stepButton("Starter").getAttribute("aria-current")).toBe("step")
  expect(page.root.querySelector("[data-back]")!.hasAttribute("hidden")).toBe(true)
  expect(page.root.querySelector("[data-place]")!.hasAttribute("hidden")).toBe(true)
  expect(status()).toBe("Step 1 of 4: Starter.")
})

test("keyboard: the rise chart is drawn in its first state and has a text name", () => {
  expect(chart().getAttribute("role")).toBe("img")
  expect(chart().getAttribute("aria-label")).toMatch(/^Dough rise chart: \d+ percent of the starting volume at hour 4\.$/)
  expect(chart().querySelectorAll("path").length).toBe(3)
  expect(chart().querySelectorAll("path")[2].getAttribute("d")).toMatch(/^M/)
  expect(chart().querySelectorAll("circle").length).toBe(1)
})

test("keyboard: Continue with an empty field stays on the step and says why", async () => {
  button("Continue").focus()
  await keys("Enter")
  expect(status()).toBe("Enter the time you feed the starter.")
  expect(stepButton("Starter").getAttribute("aria-current")).toBe("step")
  expect(document.activeElement).toBe(input("Starter"))
  expect(stepButton("Dough").getAttribute("aria-disabled")).toBe("true")
  expect(chart().getAttribute("aria-label")).toContain("at hour 4.")
})

test("keyboard: Tab returns to the current step, not to the step that had focus last", async () => {
  stepButton("Starter").focus()
  await keys("ArrowRight")
  expect(document.activeElement).toBe(stepButton("Dough"))
  expect(stepButton("Dough").getAttribute("tabindex")).toBe("-1")
  input("Starter").focus()
  await settle()
  await keys("Shift+Tab")
  expect(document.activeElement).toBe(stepButton("Starter"))
  expect(page.root.querySelectorAll('b22-step button[tabindex="0"]').length).toBe(1)
})

test("keyboard: Continue and Back move focus to the heading of the new step", async () => {
  input("Starter").value = "6:30"
  const before = solidEnd()
  button("Continue").focus()
  await keys("Enter")
  await settle()
  expect(status()).toBe("Step 2 of 4: Dough.")
  expect(heading().textContent).toBe("Mix the dough")
  expect(heading().closest("b22-panel")!.hasAttribute("hidden")).toBe(false)
  expect(stepButton("Dough").getAttribute("aria-current")).toBe("step")
  expect(stepButton("Starter").hasAttribute("aria-current")).toBe(false)
  expect(page.root.querySelector("[data-back]")!.hasAttribute("hidden")).toBe(false)
  expect(solidEnd()).toBeGreaterThan(before)
  expect(chart().getAttribute("aria-label")).toContain("at hour 8.")

  button("Back").focus()
  await keys("Enter")
  await settle()
  expect(status()).toBe("Step 1 of 4: Starter.")
  expect(heading().textContent).toBe("Feed the starter")
  expect(stepButton("Dough").getAttribute("aria-disabled")).toBeNull()
  expect(solidEnd()).toBe(before)
})

test("keyboard: a reached step opens from the stepper, and the summary shows what was typed", async () => {
  stepButton("Dough").focus()
  await keys("Enter")
  await settle()
  expect(status()).toBe("Step 2 of 4: Dough.")
  input("Dough").value = "10:30"
  button("Continue").focus()
  await keys("Enter")
  await settle()
  expect(status()).toBe("Step 3 of 4: Proof.")
  input("Proof").value = "14:30"
  button("Continue").focus()
  await keys("Enter")
  await settle()
  expect(status()).toBe("Step 4 of 4: Bake.")
  expect(chart().getAttribute("aria-label")).toContain("at hour 14.")
  expect(page.root.querySelector("[data-feed]")!.textContent).toBe("6:30")
  expect(page.root.querySelector("[data-mix]")!.textContent).toBe("10:30")
  expect(page.root.querySelector("[data-shape]")!.textContent).toBe("14:30")
  expect(page.root.querySelector("[data-next]")!.hasAttribute("hidden")).toBe(true)
  expect(page.root.querySelector("[data-place]")!.hasAttribute("hidden")).toBe(false)
  expect(stepButton("Bake").getAttribute("aria-current")).toBe("step")
  expect(page.root.querySelectorAll("b22-step button[data-done]").length).toBe(3)
  button("Save schedule").focus()
  await keys("Enter")
  expect(status()).toBe("Schedule saved: feed 6:30, mix 10:30, shape 14:30.")
})

test("agent: an agent opens only the steps that are reached, and fills the wizard through Continue", async () => {
  // The keyboard tests used the first copy of the page: start again with a new copy and the same bridge.
  page.root.remove()
  const root = document.body.appendChild(document.createElement("section"))
  ui.mount(root, { agent: page.agent, ask: async () => false })
  await settle()
  const fresh = page
  const stepper = fresh.live().find((entry) => entry.label === "Bake schedule progress")!
  expect(stepper.actions).toEqual(["goTo"])
  const items = await fresh.agent.query({ within: "Bake schedule progress" })
  expect(JSON.stringify(items)).toContain("Bake")

  const early = await fresh.agent.act({ steps: [{ ref: "Bake schedule progress", action: "goTo", args: ["Bake"] }] })
  expect(JSON.stringify(early)).not.toContain('"result":true')
  expect(root.querySelector("b22-step button[aria-current]")!.textContent).toBe("Starter")

  const empty = await fresh.agent.act({ steps: [{ ref: "Continue", action: "press" }] })
  expect(empty.ok, empty.error?.message).toBe(true)
  expect(root.querySelector("[data-status]")!.textContent).toBe("Enter the time you feed the starter.")

  const result = await fresh.agent.act({
    steps: [
      { ref: "Feed time", action: "setValue", args: ["6:30"] },
      { ref: "Continue", action: "press" },
      { ref: "Mix time", action: "setValue", args: ["10:30"] },
      { ref: "Continue", action: "press" },
      { ref: "Shape time", action: "setValue", args: ["14:30"] },
      { ref: "Continue", action: "press" },
      { ref: "Bake schedule progress", action: "goTo", args: ["Starter"] },
      { ref: "Bake schedule progress", action: "goTo", args: ["Bake"] },
      { ref: "Save schedule", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(root.querySelector("[data-status]")!.textContent).toBe("Schedule saved: feed 6:30, mix 10:30, shape 14:30.")
  expect(root.querySelector("b22-step button[aria-current]")!.textContent).toBe("Bake")
  expect(root.querySelector("[data-chart]")!.getAttribute("aria-label")).toContain("at hour 14.")
})
