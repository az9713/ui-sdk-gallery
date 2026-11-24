import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A10-site-header"

const { root, agent, person, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const nav = () => root.querySelector<HTMLElement & { value: string | null }>("ui-navigation-menu")!
const card = () => root.querySelector<HTMLElement & { open: boolean }>("ui-hover-card")!
const menu = () => root.querySelector<HTMLElement & { open: boolean }>("ui-menu")!
const button = (name: string) =>
  [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent!.trim() === name || b.getAttribute("aria-label")?.startsWith(name))!
const link = (name: string) => [...root.querySelectorAll<HTMLElement>("a")].find((a) => a.textContent!.trim().startsWith(name))!
const item = (name: string) => [...root.querySelectorAll<HTMLElement>("ui-menu-item")].find((i) => i.textContent!.trim() === name)!
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("names: each control has the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Site sections", "What is new in 4.2", "Account menu for Hollis Grant"]) expect(labels, `${label} is not in the snapshot`).toContain(label)
  expect(root.querySelector("ui-navigation-menu")!.getAttribute("aria-label")).toBe("Site sections")
  expect(button("Account menu for Hollis Grant").getAttribute("aria-disabled")).toBeNull()
})

test("keyboard: Tab visits the brand, each trigger, Pricing, the preview link and the account button, in order", async () => {
  link("Lumen").focus()
  const seen = [document.activeElement]
  for (let i = 0; i < 5; i++) {
    await keys("Tab")
    seen.push(document.activeElement)
  }
  expect(seen).toEqual([link("Lumen"), button("Products"), button("Resources"), link("Pricing"), link("What is new in 4.2"), button("Account menu for Hollis Grant")])
  const stops = tabbable(root).filter((el) => !el.closest("ui-navigation-menu-content, ui-hover-card-content, ui-menu-content"))
  expect(stops).toHaveLength(6)
})

test("keyboard: Enter opens a panel, Escape closes it, and focus goes back to the trigger", async () => {
  button("Products").focus()
  await keys("Enter")
  expect(nav().value).toBe("products")
  expect(button("Products").getAttribute("aria-expanded")).toBe("true")
  expect(root.querySelector("ui-navigation-menu-item[value=products]")!.hasAttribute("data-open")).toBe(true)
  await keys("Escape")
  expect(nav().value).toBeNull()
  expect(button("Products").getAttribute("aria-expanded")).toBe("false")
  expect(document.activeElement).toBe(button("Products"))
})

test("keyboard: ArrowRight and ArrowLeft move between the top items, and ArrowDown opens a panel and enters it", async () => {
  button("Products").focus()
  await keys("ArrowRight")
  expect(document.activeElement).toBe(button("Resources"))
  await keys("ArrowRight")
  expect(document.activeElement).toBe(link("Pricing"))
  await keys("ArrowLeft", "ArrowLeft")
  expect(document.activeElement).toBe(button("Products"))
  await keys("ArrowDown")
  expect(nav().value).toBe("products")
  expect(document.activeElement).toBe(link("Analytics"))
  await keys("ArrowDown")
  expect(document.activeElement).toBe(link("Automations"))
  await keys("ArrowUp")
  expect(document.activeElement).toBe(link("Analytics"))
  await keys("Enter")
  expect(status()).toBe("Opened: Analytics.")
})

test("keyboard: Enter on Pricing follows its link", async () => {
  link("Pricing").focus()
  await keys("Enter")
  expect(status()).toBe("Opened: Pricing.")
})

test("keyboard: the preview opens when the link keeps focus, Escape closes it, and Enter follows the link", async () => {
  const trigger = link("What is new in 4.2")
  trigger.focus()
  await wait(250)
  await settle()
  expect(card().open).toBe(true)
  expect(root.querySelector("ui-hover-card-content")!.textContent).toContain("Saved views")
  await keys("Escape")
  expect(card().open).toBe(false)
  expect(document.activeElement).toBe(trigger)
  await keys("Enter")
  expect(status()).toBe("Opened: What is new in 4.2.")
})

test("keyboard: Enter opens the account menu, ArrowDown moves, Enter runs an item, and focus goes back to the button", async () => {
  button("Account menu for Hollis Grant").focus()
  await keys("Enter")
  expect(menu().open).toBe(true)
  expect(button("Account menu for Hollis Grant").getAttribute("aria-expanded")).toBe("true")
  expect(document.activeElement).toBe(item("Your profile"))
  await keys("ArrowDown")
  expect(document.activeElement).toBe(item("Billing"))
  await keys("Enter")
  expect(status()).toBe("Opened: Billing.")
  expect(menu().open).toBe(false)
  expect(document.activeElement).toBe(button("Account menu for Hollis Grant"))
})

test("keyboard: Escape closes the account menu and runs nothing", async () => {
  button("Account menu for Hollis Grant").focus()
  await keys("Enter", "Escape")
  expect(menu().open).toBe(false)
  expect(status()).toBe("Opened: Billing.")
  expect(document.activeElement).toBe(button("Account menu for Hollis Grant"))
})

test("keyboard: Sign out from the keyboard signs out", async () => {
  button("Account menu for Hollis Grant").focus()
  await keys("Enter", "ArrowUp")
  expect(document.activeElement).toBe(item("Sign out"))
  await keys("Enter")
  expect(status()).toBe("Signed out.")
})

test("agent: an agent opens a panel and the preview link, and the sign out step waits for the person", async () => {
  const opened = await agent.act({
    steps: [
      { ref: "Site sections", action: "setValue", args: ["Resources"] },
      { ref: "What is new in 4.2", action: "press" },
    ],
  })
  expect(opened.ok, opened.error?.message).toBe(true)
  expect(status()).toBe("Opened: What is new in 4.2.")

  const sections = live().find((entry) => entry.label === "Site sections")!
  expect((sections.items as { label: string }[]).map((entry) => entry.label)).toEqual(["Products", "Resources", "Pricing"])
  const panel = await agent.act({ steps: [{ ref: "Site sections", action: "setValue", args: ["Products"] }] })
  expect(panel.ok, panel.error?.message).toBe(true)
  expect(nav().value).toBe("products")

  const profile = await agent.act({ steps: [{ ref: "Account menu for Hollis Grant", action: "press", args: ["Your profile"] }] })
  expect(profile.ok, profile.error?.message).toBe(true)
  expect(status()).toBe("Opened: Your profile.")

  const signOut = { steps: [{ ref: "Account menu for Hollis Grant", action: "press", args: ["Sign out"] }] }
  expect((await agent.act(signOut)).ok).toBe(false)
  expect(person.asked).toEqual(["Signs Hollis Grant out on this device"])
  expect(status()).toBe("Opened: Your profile.")
  person.approves = true
  const done = await agent.act(signOut)
  expect(done.ok, done.error?.message).toBe(true)
  expect(status()).toBe("Signed out.")
})
