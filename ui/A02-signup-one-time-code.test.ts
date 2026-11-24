import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A02-signup-one-time-code"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => (b.textContent === name || b.getAttribute("aria-label") === name))!

test("names: each control has the name that the page shows", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const labels = live().map((entry) => entry.label)
  for (const label of ["Email address", "Choose a password", "Verification code", "I accept the terms", "Create account"])
    expect(labels, `${label} is not in the snapshot`).toContain(label)
})

test("keyboard: the code is 1 tab stop, and the toggle shows and hides the password", async () => {
  const stops = tabbable(root)
  expect(stops.filter((el) => el.closest("ui-otp-input"))).toHaveLength(1)
  const input = root.querySelector<HTMLInputElement>("ui-password-input input")!
  expect(input.type).toBe("password")
  button("Show password").focus()
  await keys("Space")
  expect(input.type).toBe("text")
  await keys("Enter")
  expect(input.type).toBe("password")
})

test("keyboard: Space checks the terms, and a short code is refused", async () => {
  const terms = root.querySelector<HTMLElement>("ui-checkbox")!
  terms.focus()
  await keys("Space")
  expect(terms.getAttribute("aria-checked")).toBe("true")
  await keys("Space")
  expect(terms.getAttribute("aria-checked")).toBe("false")
  const result = await agent.act({
    steps: [
      { ref: "Email address", action: "setValue", args: ["ana@example.com"] },
      { ref: "Choose a password", action: "setValue", args: ["correct-horse-9"] },
      { ref: "Verification code", action: "setValue", args: ["123"] },
      { ref: "Create account", action: "press" },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Enter the 6-digit code.")
})

test("agent: an agent signs up, and the snapshot never shows the password or the code", async () => {
  const result = await agent.act(ui.task!)
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Account created for ana@example.com.")
  const seen = JSON.stringify(agent.snapshot()) + JSON.stringify(result)
  expect(seen).not.toContain("correct-horse-9")
  expect(seen).not.toContain("123456")
  expect(seen).toContain("[redacted]")
})
