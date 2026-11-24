import { expect, test, vi } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./A20-phone-nav-drawer"

const { root, agent, live } = mountUI(ui)
const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!
const status = () => q("[data-status]").textContent
const heading = () => q("[data-heading]").textContent
const drawer = () => q<HTMLElement & { open: boolean }>("ui-drawer")
const content = () => q("ui-drawer-content")
const trigger = () => q("ui-drawer-trigger button")
const button = (name: string) => [...content().querySelectorAll<HTMLElement>("button")].find((b) => b.textContent!.trim() === name)!

test("names: the drawer has the name that the page shows, and it starts closed", async () => {
  await settle()
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  expect(live().map((entry) => entry.label)).toContain("Main navigation")
  expect(trigger().textContent).toBe("Open menu")
  expect(drawer().open).toBe(false)
  expect(content().getAttribute("data-side") ?? "left").toBe("left")
})

test("keyboard: Enter on the trigger opens a modal drawer named by its title, and focus moves inside", async () => {
  trigger().focus()
  await keys("Enter")
  expect(drawer().open).toBe(true)
  expect(trigger().getAttribute("aria-haspopup")).toBe("dialog")
  expect(trigger().hasAttribute("data-open")).toBe(true)
  await vi.waitFor(() => expect(content().getAttribute("aria-modal")).toBe("true"))
  expect(content().getAttribute("aria-labelledby")).toBe(q("ui-drawer-title").id)
  expect(content().contains(document.activeElement)).toBe(true)
})

test("keyboard: Tab stays inside the drawer and visits the 4 pages and Close menu, in order", async () => {
  const order = ["Home", "Orders", "Messages", "Account", "Close menu"]
  const seen: (string | null)[] = []
  button("Home").focus()
  seen.push(document.activeElement!.textContent)
  for (let i = 0; i < 4; i++) {
    await keys("Tab")
    seen.push(document.activeElement!.textContent)
  }
  expect(seen).toEqual(order)
  await keys("Tab")
  expect(content().contains(document.activeElement)).toBe(true)
  await keys("Shift+Tab")
  expect(content().contains(document.activeElement)).toBe(true)
})

test("keyboard: Escape closes the drawer, chooses no page, and gives focus back to the trigger", async () => {
  await keys("Escape")
  expect(drawer().open).toBe(false)
  expect(status()).toBe("Menu closed. No page is chosen.")
  expect(heading()).toBe("Home")
  expect(document.activeElement).toBe(trigger())
})

test("keyboard: Space on the trigger opens the drawer, and Enter on a page opens it and closes the drawer", async () => {
  trigger().focus()
  await keys("Space")
  expect(drawer().open).toBe(true)
  button("Messages").focus()
  await keys("Enter")
  expect(drawer().open).toBe(false)
  expect(status()).toBe("Opened page: Messages.")
  expect(heading()).toBe("Messages")
  expect(document.activeElement).toBe(trigger())
})

test("keyboard: Space on a page chooses it, and Close menu closes the drawer with no page", async () => {
  trigger().focus()
  await keys("Enter")
  button("Account").focus()
  await keys("Space")
  expect(status()).toBe("Opened page: Account.")
  expect(heading()).toBe("Account")
  await keys("Enter")
  button("Close menu").focus()
  await keys("Enter")
  expect(drawer().open).toBe(false)
  expect(status()).toBe("Menu closed. No page is chosen.")
  expect(heading()).toBe("Account")
})

test("agent: an agent opens the drawer, and the page behind it shows no change until a page is chosen", async () => {
  expect(heading()).toBe("Account")
  expect(status()).toBe("Menu closed. No page is chosen.")
  const opened = await agent.act({ steps: [{ ref: "Main navigation", action: "press" }] })
  expect(opened.ok, opened.error?.message).toBe(true)
  expect(drawer().open).toBe(true)
  const entry = live().find((e) => e.label === "Main navigation")!
  expect(entry.component).toBe("drawer")
  expect(entry.open).toBe(true)
  expect(heading()).toBe("Account")
  expect(status()).toBe("Menu closed. No page is chosen.")
})

test("agent: an agent chooses Orders, the drawer closes, and the page changes", async () => {
  const done = await agent.act({ steps: [{ ref: "Main navigation", action: "press", args: ["Orders"] }] })
  expect(done.ok, done.error?.message).toBe(true)
  expect(drawer().open).toBe(false)
  expect(status()).toBe("Opened page: Orders.")
  expect(heading()).toBe("Orders")
})

test("agent: an agent opens the drawer with setOpen and closes it with Close menu", async () => {
  const opened = await agent.act({ steps: [{ ref: "Main navigation", action: "setOpen", args: [true] }] })
  expect(opened.ok, opened.error?.message).toBe(true)
  expect(drawer().open).toBe(true)
  const closed = await agent.act({ steps: [{ ref: "Main navigation", action: "press", args: ["Close menu"] }] })
  expect(closed.ok, closed.error?.message).toBe(true)
  expect(drawer().open).toBe(false)
  expect(status()).toBe("Menu closed. No page is chosen.")
  expect(heading()).toBe("Orders")
})
