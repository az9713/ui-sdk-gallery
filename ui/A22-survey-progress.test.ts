import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A22-survey-progress"

// jsdom never calls formResetCallback and its FormData leaves custom elements out, so the rating's
// submit and reset are asserted in the browser, through task.done.
const { root, agent, person, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!
const radio = (value: string) => root.querySelector<HTMLElement>(`ui-radio[value=${value}]`)!
const progress = () => root.querySelector("ui-progress")!
const shown = (field: number) => !root.querySelectorAll<HTMLElement>("ui-field-error")[field].hidden

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Survey progress", "Your name", "Overall rating", "What should we improve?", "Send answers", "Clear answers"])
    expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(progress().getAttribute("aria-valuetext")).toBe("0 of 3 answered")
})

test("keyboard: Tab stops on the name, the rating group once, the suggestion and the 2 buttons", () => {
  const stops = tabbable(root)
  expect(stops.map((el) => el.localName)).toEqual(["input", "ui-radio", "textarea", "button", "button"])
  expect(stops[1]).toBe(radio("poor"))
})

test("keyboard: Enter on Send with no answers shows the required-field errors and sends nothing", async () => {
  button("Send answers").focus()
  await keys("Enter")
  expect(status()).toBe("Not sent: 3 of 3 questions have no answer.")
  expect(shown(0)).toBe(true)
  expect(shown(2)).toBe(true)
  expect(root.querySelector("input")!.getAttribute("aria-invalid")).toBe("true")
  expect(document.activeElement).toBe(root.querySelector("input"))
})

test("keyboard: typing a name clears its error and moves the progress bar to 1 of 3", async () => {
  const input = root.querySelector("input")!
  input.value = "Grace"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
  expect(shown(0)).toBe(false)
  expect(progress().getAttribute("aria-valuetext")).toBe("1 of 3 answered")
})

test("keyboard: Space checks a rating, and the arrow keys move the rating both ways", async () => {
  radio("poor").focus()
  await keys("Space")
  expect(radio("poor").getAttribute("aria-checked")).toBe("true")
  expect(progress().getAttribute("aria-valuetext")).toBe("2 of 3 answered")
  await keys("ArrowDown")
  expect(radio("fair").getAttribute("aria-checked")).toBe("true")
  expect(document.activeElement).toBe(radio("fair"))
  await keys("ArrowRight")
  expect(radio("good").getAttribute("aria-checked")).toBe("true")
  await keys("ArrowUp")
  expect(radio("fair").getAttribute("aria-checked")).toBe("true")
  await keys("ArrowLeft")
  expect(radio("poor").getAttribute("aria-checked")).toBe("true")
  expect(radio("good").getAttribute("aria-checked")).toBe("false")
  expect(tabbable(root).filter((el) => el.localName === "ui-radio")).toEqual([radio("poor")])
})

test("agent: an agent answers the 3 questions, sends them, and clears the form", async () => {
  const answered = await agent.act({
    steps: [
      { ref: "Your name", action: "setValue", args: ["Ada Lovelace"] },
      { ref: "Overall rating", action: "setValue", args: ["Good"] },
      { ref: "improve", action: "setValue", args: ["Longer breaks"] },
      { ref: "Send answers", action: "press" },
    ],
  })
  expect(answered.ok, answered.error?.message).toBe(true)
  expect(radio("good").getAttribute("aria-checked")).toBe("true")
  expect(progress().getAttribute("aria-valuetext")).toBe("3 of 3 answered")
  expect(progress().hasAttribute("data-complete")).toBe(true)
  expect(status()).toMatch(/^Sent: Ada Lovelace, .+, "Longer breaks"\.$/)

  const cleared = await agent.act({ steps: [{ ref: "Clear answers", action: "press" }] })
  expect(cleared.ok, cleared.error?.message).toBe(true)
  await new Promise((resolve) => setTimeout(resolve))
  expect(status()).toMatch(/^Sent: Ada Lovelace, .+\. Answers cleared\.$/)
  expect(root.querySelector("input")!.value).toBe("")
  expect(root.querySelector("textarea")!.value).toBe("")
  expect(person.asked).toEqual([])
})
