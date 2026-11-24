import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { labStepper } from "./F08-titration-stepper"

// The bridge skips a component whose element fails checkVisibility. src/setup.ts makes it always true;
// the browser returns false inside a [hidden] panel, so this stub matches the browser.
Element.prototype.checkVisibility = function (this: Element) {
  return !this.closest("[hidden]")
}
// jsdom has no Element.animate. The stub records each call.
const animations: { el: Element; keyframes: Keyframe[] }[] = []
Object.defineProperty(Element.prototype, "animate", {
  configurable: true,
  value(this: Element, keyframes: Keyframe[]) {
    animations.push({ el: this, keyframes })
    return {}
  },
})

const STEPS = ["Weigh", "Dissolve", "Titrate", "Record"]
const options = { steps: STEPS, defaultValue: "Weigh" }
const markup = `<root aria-label="Titration procedure">${STEPS.map((s) => `<step value="${s}">${s}</step>`).join("")}${STEPS.map((s) => `<panel value="${s}">${s} panel</panel>`).join("")}</root>`
type View = ReturnType<typeof mount<typeof labStepper>>
const step = (view: View, name: string) =>
  [...view.root.querySelectorAll<HTMLElement>("[data-slot=lab-stepper-step]")].find((el) => el.textContent === name)!
const openPanels = (view: View) =>
  [...view.root.querySelectorAll<HTMLElement>("[data-slot=lab-stepper-panel]")].filter((el) => el.isConnected && !el.hidden).map((el) => el.textContent)

test("keyboard: arrow keys, Home and End move focus between steps", async () => {
  const view = mount(labStepper, options, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(step(view, "Weigh"))
    await view.keys("ArrowRight")
    expect(document.activeElement).toBe(step(view, "Dissolve"))
    await view.keys("End")
    expect(document.activeElement).toBe(step(view, "Record"))
    await view.keys("ArrowLeft")
    expect(document.activeElement).toBe(step(view, "Titrate"))
    await view.keys("Home")
    expect(document.activeElement).toBe(step(view, "Weigh"))
    expect(view.state.value).toBe("Weigh")
  } finally {
    view.unmount()
  }
})

test("keyboard: the steps are 1 tab stop, and Enter and Space open the focused step", async () => {
  const view = mount(labStepper, options, markup)
  try {
    expect(view.root.querySelectorAll('[data-slot=lab-stepper-step][tabindex="0"]').length).toBe(1)
    expect(step(view, "Weigh").getAttribute("tabindex")).toBe("0")
    expect(view.root.querySelectorAll("[aria-disabled]").length).toBe(0)
    await view.keys("Tab", "ArrowRight", "ArrowRight", "Enter")
    expect(view.state.value).toBe("Titrate")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press", source: "keyboard" })
    await view.keys("ArrowLeft", "Space")
    expect(view.state.value).toBe("Dissolve")
    expect(step(view, "Dissolve").getAttribute("tabindex")).toBe("0")
    expect(view.root.querySelectorAll('[data-slot=lab-stepper-step][tabindex="0"]').length).toBe(1)
  } finally {
    view.unmount()
  }
})

test("keyboard: only the current step has aria-current=step, and only its panel shows", async () => {
  const view = mount(labStepper, options, markup)
  try {
    expect(step(view, "Weigh").getAttribute("aria-current")).toBe("step")
    expect(step(view, "Weigh").hasAttribute("data-current")).toBe(true)
    expect(view.root.querySelectorAll("[aria-current]").length).toBe(1)
    expect(openPanels(view)).toEqual(["Weigh panel"])
    expect(view.api.goTo("Record")).toBe(true)
    await view.settle()
    expect(step(view, "Weigh").hasAttribute("aria-current")).toBe(false)
    expect(step(view, "Weigh").hasAttribute("data-current")).toBe(false)
    expect(step(view, "Record").getAttribute("aria-current")).toBe("step")
    expect(view.root.querySelectorAll("[aria-current]").length).toBe(1)
    expect(openPanels(view)).toEqual(["Record panel"])
  } finally {
    view.unmount()
  }
})

test("keyboard: a click opens any step, and goTo refuses a step that is not in the list", async () => {
  const view = mount(labStepper, options, markup)
  try {
    await view.click(step(view, "Titrate"))
    expect(view.state.value).toBe("Titrate")
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "item-press" })
    await view.click(step(view, "Weigh"))
    expect(view.state.value).toBe("Weigh")
    expect(view.api.goTo("Filter")).toBe(false)
    expect(view.state.value).toBe("Weigh")
    expect(view.api.goTo("Dissolve")).toBe(true)
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "imperative" })
  } finally {
    view.unmount()
  }
})

test("server: the stepper renders with no DOM", () => {
  checkServer(labStepper, options, markup)
})

test("direction: Left and Right follow the text direction", async () => {
  await checkDirection(labStepper, { ...options, defaultValue: "Dissolve" }, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = (root = page.root) => root.querySelector("[data-status]")!.textContent
const stepButton = (name: string, root = page.root) =>
  [...root.querySelectorAll<HTMLElement>("f08-step button")].find((b) => b.textContent === name)!
const input = (step: string, root = page.root) => root.querySelector<HTMLInputElement>(`f08-panel[value="${step}"] input`)!
const liquid = (root = page.root) => root.querySelector<SVGElement>("[data-liquid]")!
const caption = (root = page.root) => root.querySelector("[data-caption]")!.textContent
// jsdom reads an inline fill back as rgb().
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(", ")})`

test("names: the page names the stepper, each step, the fields and the button", async () => {
  page = mountUI(ui)
  await settle()
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  expect(page.live().map((entry) => entry.label).sort()).toEqual(["Sample mass", "Titration procedure"])
  expect(page.root.querySelector("f08-stepper")!.getAttribute("role")).toBe("group")
  expect([...page.root.querySelectorAll("f08-step button")].map((b) => b.textContent)).toEqual(STEPS)
  expect(page.root.querySelector("[data-sign] button")!.textContent).toBe("Sign the entry")
  expect([...page.root.querySelectorAll("f08-panel ui-field-label")].map((l) => l.textContent)).toEqual(["Sample mass", "Water volume", "Burette reading"])
  expect(stepButton("Weigh").getAttribute("aria-current")).toBe("step")
  expect(page.root.querySelectorAll("f08-panel:not([hidden])").length).toBe(1)
  expect(status()).toBe("Step 1 of 4: Weigh.")
})

test("keyboard: the beaker is drawn in its first state and is hidden from the agent", () => {
  const svg = page.root.querySelector("[data-beaker]")!
  expect(svg.getAttribute("aria-hidden")).toBe("true")
  expect(svg.querySelector("text")).toBeNull()
  expect(liquid().style.fill).toBe(rgb("#ebe6d8"))
  expect(liquid().style.transform).toBe("scaleY(0.1)")
  expect(caption()).toBe("Beaker: dry KHP powder, no water yet.")
  expect(animations.length).toBe(0)
})

test("keyboard: on the page, Enter on a step opens its panel, and the beaker and the status follow", async () => {
  stepButton("Weigh").focus()
  await keys("ArrowRight", "ArrowRight", "Enter")
  await settle()
  expect(document.activeElement).toBe(stepButton("Titrate"))
  expect(status()).toBe("Step 3 of 4: Titrate.")
  expect(stepButton("Titrate").getAttribute("aria-current")).toBe("step")
  expect(input("Titrate").closest("f08-panel")!.hasAttribute("hidden")).toBe(false)
  expect(input("Weigh").closest("f08-panel")!.hasAttribute("hidden")).toBe(true)
  expect(liquid().style.fill).toBe(rgb("#ee9cc0"))
  expect(liquid().style.transform).toBe("scaleY(0.62)")
  expect(caption()).toBe("Beaker: a faint pink that stays for 30 s, the endpoint.")
  const change = animations.find((a) => a.el === liquid())!
  expect(change.keyframes).toEqual([
    { fill: "#ebe6d8", transform: "scaleY(0.1)" },
    { fill: "#ee9cc0", transform: "scaleY(0.62)" },
  ])
  expect(page.live().map((entry) => entry.label).sort()).toEqual(["Burette reading", "Titration procedure"])
  await keys("Home", "Space")
  await settle()
  expect(status()).toBe("Step 1 of 4: Weigh.")
  expect(liquid().style.fill).toBe(rgb("#ebe6d8"))
})

test("keyboard: on the page, Tab returns to the current step, not to the step that had focus last", async () => {
  stepButton("Weigh").focus()
  await keys("ArrowRight")
  expect(document.activeElement).toBe(stepButton("Dissolve"))
  expect(stepButton("Dissolve").getAttribute("tabindex")).toBe("-1")
  input("Weigh").focus()
  await settle()
  await keys("Shift+Tab")
  expect(document.activeElement).toBe(stepButton("Weigh"))
  expect(page.root.querySelectorAll('f08-step button[tabindex="0"]').length).toBe(1)
})

test("keyboard: Sign the entry says what is missing, then signs the computed molarity", async () => {
  stepButton("Record").focus()
  await keys("Enter")
  await settle()
  expect(page.root.querySelector("[data-molarity]")!.textContent).toBe("Not known")
  const sign = page.root.querySelector<HTMLElement>("[data-sign] button")!
  sign.focus()
  await keys("Enter")
  expect(status()).toBe("Enter the sample mass and the burette reading first.")
  input("Weigh").value = "0.5105"
  input("Titrate").value = "25.00"
  stepButton("Record").focus()
  await keys("ArrowLeft", "Enter", "ArrowRight", "Enter")
  await settle()
  expect(page.root.querySelector("[data-mass]")!.textContent).toBe("0.5105 g")
  expect(page.root.querySelector("[data-volume]")!.textContent).toBe("25.00 mL")
  expect(page.root.querySelector("[data-molarity]")!.textContent).toBe("0.1000 M")
  sign.focus()
  await keys("Space")
  expect(status()).toBe("Signed: 0.5105 g KHP, 25.00 mL NaOH, 0.1000 M.")
})

// A new copy of the page for each check below, on the same bridge: a test file has 1 bridge.
const fresh = async () => {
  page.root.remove()
  const root = document.body.appendChild(document.createElement("section"))
  ui.mount(root, { agent: page.agent, ask: async () => false })
  page = { ...page, root }
  await settle()
  return root
}

test("keyboard: with reduced motion the beaker changes with no animation", async () => {
  const matchMedia = window.matchMedia
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce") })) as unknown as typeof window.matchMedia
  try {
    const root = await fresh()
    const before = animations.length
    stepButton("Dissolve", root).click()
    await settle()
    expect(status(root)).toBe("Step 2 of 4: Dissolve.")
    expect(liquid(root).style.fill).toBe(rgb("#d3e8f4"))
    expect(liquid(root).style.transform).toBe("scaleY(0.5)")
    expect(animations.length).toBe(before)
  } finally {
    window.matchMedia = matchMedia
  }
})

test("agent: a field on a closed step is reported as behind the steps that can open it", async () => {
  await fresh()
  const result = await page.agent.act({ steps: [{ ref: "Burette reading", action: "setValue", args: ["25.00"] }] })
  expect(result.ok).toBe(false)
  expect(result.error?.message).toMatch(
    /^No component "Burette reading" on the page\. .*It may be behind one of these, which a step can open first: Titration procedure \(c\d+\): Dissolve, Titrate, Record\.$/,
  )
  expect(input("Titrate").value).toBe("")
  const sign = await page.agent.act({ steps: [{ ref: "Sign the entry", action: "press" }] })
  expect(sign.error?.message).toContain("Titration procedure (")
  expect(sign.error?.message).toContain("Dissolve, Titrate, Record.")
})

test("agent: the stepper lists its 4 steps, and a step that is not one of them is refused", async () => {
  const stepper = page.live().find((entry) => entry.label === "Titration procedure")!
  expect(stepper.actions).toEqual(["goTo"])
  expect(stepper.value).toBe("Weigh")
  const found = await page.agent.query({ within: "Titration procedure" })
  expect(JSON.stringify(found)).toContain(JSON.stringify(STEPS.map((name) => ({ value: name, label: name }))))
  const wrong = await page.agent.act({ steps: [{ ref: "Titration procedure", action: "goTo", args: ["Filter"] }] })
  expect(wrong.ok).toBe(false)
  expect(wrong.error?.message).toMatch(/^No item "Filter" in Titration procedure \(c\d+\)\. Its items: Weigh, Dissolve, Titrate, Record\.$/)
  expect(status()).toBe("Step 1 of 4: Weigh.")
})

test("agent: an agent opens each step first, fills its field and signs the entry", async () => {
  const root = await fresh()
  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(ui.task!.done(root)).toBe(true)
  expect(stepButton("Record", root).getAttribute("aria-current")).toBe("step")
  expect(root.querySelector("[data-molarity]")!.textContent).toBe("0.1000 M")
  expect(liquid(root).style.fill).toBe(rgb("#f6c3d8"))
})
