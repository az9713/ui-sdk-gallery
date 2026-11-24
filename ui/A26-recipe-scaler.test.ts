import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A26-recipe-scaler"

const { root, agent, person, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const quantities = () => [...root.querySelectorAll("[data-quantity]")].map((el) => el.textContent)
const servings = () => root.querySelector<HTMLInputElement>("ui-number-input input")!
const flour = () => root.querySelector<HTMLInputElement>("ui-input input")!
const fit = () => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Fit to flour")!

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Number format", "Servings", "Flour on hand", "Fit to flour"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(root.querySelector("[data-ingredients]")!.getAttribute("aria-label")).toBe("Ingredients")
  expect(fit().getAttribute("aria-disabled")).toBeNull()
})

test("keyboard: the recipe starts at 4 servings, and the servings field is 1 tab stop", async () => {
  expect(servings().value).toBe("4")
  expect(quantities()).toEqual(["250 g", "0.75 cup", "300 ml", "2", "1.5 tsp"])
  expect(status()).toBe("Recipe for 4 servings (x1), English format.")
  expect(tabbable(root).filter((el) => el.closest("ui-number-input"))).toEqual([servings()])
})

test("keyboard: the arrow keys step the servings and each quantity follows", async () => {
  servings().focus()
  await keys("ArrowUp")
  expect(servings().value).toBe("5")
  expect(quantities()).toEqual(["312.5 g", "0.94 cup", "375 ml", "2.5", "1.88 tsp"])
  expect(status()).toBe("Recipe for 5 servings (x1.25), English format.")
  await keys("ArrowDown", "ArrowDown")
  expect(servings().value).toBe("3")
  expect(quantities()[0]).toBe("187.5 g")
  expect(status()).toBe("Recipe for 3 servings (x0.75), English format.")
  await keys("ArrowUp")
  expect(status()).toBe("Recipe for 4 servings (x1), English format.")
})

test("keyboard: Shift steps by 4, and Home and End go to 1 and 48", async () => {
  servings().focus()
  await keys("Shift+ArrowUp")
  expect(servings().value).toBe("8")
  expect(quantities()[0]).toBe("500 g")
  await keys("End")
  expect(servings().value).toBe("48")
  expect(quantities()).toEqual(["3,000 g", "9 cup", "3,600 ml", "24", "18 tsp"])
  await keys("Home")
  expect(servings().value).toBe("1")
  expect(status()).toBe("Recipe for 1 serving (x0.25), English format.")
  expect(quantities()[0]).toBe("62.5 g")
  await keys("Shift+ArrowUp")
  expect(servings().value).toBe("5")
})

test("keyboard: a typed number above the maximum is lowered when it commits", async () => {
  servings().focus()
  servings().value = "100"
  servings().dispatchEvent(new Event("input", { bubbles: true }))
  await keys("Enter")
  expect(servings().value).toBe("48")
  expect(status()).toBe("Recipe for 48 servings (x12), English format.")
  servings().value = "4"
  servings().dispatchEvent(new Event("input", { bubbles: true }))
  await keys("Enter")
  expect(servings().value).toBe("4")
})

test("keyboard: Enter and Space on Fit to flour read the flour field in the chosen format", async () => {
  flour().value = "1.000"
  fit().focus()
  await keys("Enter")
  expect(servings().value).toBe("1")
  expect(status()).toBe("Recipe for 1 serving (x0.25), English format.")
  flour().value = "500"
  await keys("Space")
  expect(servings().value).toBe("8")
  expect(status()).toBe("Recipe for 8 servings (x2), English format.")
  flour().value = "100"
  await keys("Enter")
  expect(servings().value).toBe("2")
  expect(quantities()[0]).toBe("125 g")
})

test("keyboard: text that is not a number is named in the status, and the servings stay", async () => {
  fit().focus()
  flour().value = "lots"
  await keys("Enter")
  expect(status()).toBe('Cannot read "lots" as a number in English format.')
  expect(servings().value).toBe("2")
  flour().value = "-"
  await keys("Enter")
  expect(status()).toBe('"-" is not a full number yet.')
  expect(servings().value).toBe("2")
})

test("agent: an agent switches to German, types 1.000 g of flour, and fits the recipe", async () => {
  const done = await agent.act({ steps: ui.task!.steps })
  expect(done.ok, done.error?.message).toBe(true)
  expect(servings().value).toBe("16")
  expect(quantities()).toEqual(["1.000 g", "3 cup", "1.200 ml", "8", "6 tsp"])
  expect(status()).toBe("Recipe for 16 servings (x4), German format.")
  expect(ui.task!.done(root)).toBe(true)
  expect(person.asked).toEqual([])
})

test("agent: German reads 1,5 as one and a half, and shows the quantities with a decimal comma", async () => {
  const set = await agent.act({
    steps: [
      { ref: "Servings", action: "setValue", args: [6] },
      { ref: "Flour on hand", action: "setValue", args: ["1.250,5"] },
    ],
  })
  expect(set.ok, set.error?.message).toBe(true)
  expect(quantities()).toEqual(["375 g", "1,13 cup", "450 ml", "3", "2,25 tsp"])
  expect(status()).toBe("Recipe for 6 servings (x1,5), German format.")
  const fitted = await agent.act({ steps: [{ ref: "Fit to flour", action: "press" }] })
  expect(fitted.ok, fitted.error?.message).toBe(true)
  expect(servings().value).toBe("20")
  expect(status()).toBe("Recipe for 20 servings (x5), German format.")
})

test("agent: the same text 1.000 reads as 1 in English, and the amount snaps up to 1 serving", async () => {
  const back = await agent.act({
    steps: [
      { ref: "Number format", action: "setValue", args: ["English"] },
      { ref: "Flour on hand", action: "setValue", args: ["1.000"] },
      { ref: "Fit to flour", action: "press" },
    ],
  })
  expect(back.ok, back.error?.message).toBe(true)
  expect(servings().value).toBe("1")
  expect(status()).toBe("Recipe for 1 serving (x0.25), English format.")
  expect(quantities()[0]).toBe("62.5 g")
})

test("agent: an agent step above the maximum is clamped, and a step to an unknown format is refused", async () => {
  const high = await agent.act({ steps: [{ ref: "Servings", action: "setValue", args: [99] }] })
  expect(high.ok, high.error?.message).toBe(true)
  expect(servings().value).toBe("48")
  const refused = await agent.act({ steps: [{ ref: "Number format", action: "setValue", args: ["French"] }] })
  expect(refused.ok).toBe(false)
  expect(status()).toBe("Recipe for 48 servings (x12), English format.")
})
