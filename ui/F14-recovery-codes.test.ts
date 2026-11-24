import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./F14-recovery-codes"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const vaultStatus = () => root.querySelector("[data-vault-status]")!.textContent
const list = () => root.querySelector<HTMLOListElement>("[data-codes]")!
const codes = () => [...list().querySelectorAll("code")].map((c) => c.textContent!)
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!

test("names: the sign-in controls are in the snapshot, and no part of the vault is", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Two-step sign-in", "Second factor", "Sign out other devices"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(labels).not.toContain("Open vault")
  expect(labels).not.toContain("Regenerate codes")
  expect(status()).toBe("Two-step sign-in on. Second factor: Authenticator app. Vault sealed.")
  expect(codes()).toHaveLength(10)
  for (const code of codes()) expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  expect(root.querySelector("[data-door] svg")!.getAttribute("aria-hidden")).toBe("true")
})

test("keyboard: the page has 5 tab stops, and 2 of them are in the vault", () => {
  const stops = tabbable(root)
  expect(stops).toHaveLength(5)
  expect(stops.filter((el) => el.closest("[data-agent-hidden]"))).toHaveLength(2)
})

test("keyboard: Space turns two-step sign-in off and on", async () => {
  const toggle = root.querySelector<HTMLElement>("ui-switch")!
  toggle.focus()
  await keys("Space")
  expect(toggle.getAttribute("aria-checked")).toBe("false")
  expect(status()).toBe("Two-step sign-in off. Second factor: Authenticator app. Vault sealed.")
  await keys("Space")
  expect(status()).toContain("Two-step sign-in on.")
})

test("keyboard: Enter opens the vault and shows the codes, and Enter again seals it", async () => {
  const open = button("Open vault")
  open.focus()
  await keys("Enter")
  expect(list().hidden).toBe(false)
  expect(open.textContent).toBe("Seal vault")
  expect(root.querySelector("[data-vault-card]")!.hasAttribute("data-open")).toBe(true)
  expect(vaultStatus()).toBe("Vault open. Batch 1: 10 codes. Store them offline.")
  expect(status()).toContain("Vault open.")
  expect(document.activeElement).toBe(open)
  await keys("Enter")
  expect(list().hidden).toBe(true)
  expect(open.textContent).toBe("Open vault")
  expect(vaultStatus()).toBe("Vault sealed.")
})

test("keyboard: Space on Regenerate codes makes 10 new codes", async () => {
  const before = codes()
  button("Regenerate codes").focus()
  await keys("Space")
  expect(codes()).toHaveLength(10)
  expect(codes()).not.toEqual(before)
  expect(vaultStatus()).toBe("Batch 2: 10 new codes. The old codes no longer work.")
})

test("agent: the open vault and its codes stay out of snapshot and query", async () => {
  button("Open vault").click()
  await settle()
  expect(list().hidden).toBe(false)
  const seen = JSON.stringify(agent.snapshot())
  for (const code of codes()) expect(seen).not.toContain(code)
  expect(seen).not.toContain("vault")
  expect(seen).not.toContain("Regenerate")
  const found = await agent.query({ text: "vault" })
  expect(Array.isArray(found) ? found : []).toHaveLength(0)
  button("Seal vault").click()
  await settle()
  expect(list().hidden).toBe(true)
})

test("agent: the agent changes the sign-in settings, and a step on the vault fails with nothing opened", async () => {
  const result = await agent.act({ steps: ui.task!.steps })
  expect(result.ok).toBe(false)
  expect(result.error?.step).toBe(2)
  expect(result.error?.message).toMatch(/person/i)
  expect(status()).toBe("Two-step sign-in on. Second factor: Security key. Vault sealed.")
  expect(root.querySelector("[data-devices]")!.textContent).toBe("No other device is signed in.")
  expect(list().hidden).toBe(true)
  expect(ui.task!.done(root)).toBe(true)
})

test("agent: a step on Regenerate codes fails too", async () => {
  const before = codes()
  const result = await agent.act({ steps: [{ ref: "Regenerate codes", action: "press" }] })
  expect(result.ok).toBe(false)
  expect(codes()).toEqual(before)
})

test("keyboard: with reduced motion the door is open at once", async () => {
  const media = window.matchMedia
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query }) as MediaQueryList) as typeof window.matchMedia
  const calm = document.body.appendChild(document.createElement("section"))
  calm.setAttribute("data-agent-hidden", "")
  ui.mount(calm, { agent, ask: async () => false })
  await settle()
  calm.querySelector<HTMLElement>("[data-open] button")!.click()
  await settle()
  const door = calm.querySelector<HTMLElement>("[data-door]")!
  expect(calm.querySelector<HTMLOListElement>("[data-codes]")!.hidden).toBe(false)
  expect(door.style.opacity).toBe("0")
  expect(calm.querySelector("[data-wheel]")!.getAttribute("transform")).toBe("rotate(-300 120 120)")
  calm.remove()
  window.matchMedia = media
})
