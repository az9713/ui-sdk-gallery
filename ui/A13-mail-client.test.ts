import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./A13-mail-client"

const { root, agent, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const el = (selector: string) => root.querySelector<HTMLElement>(selector)!
const item = (list: string, value: string) => el(`${list} ui-listbox-item[value="${value}"]`)
const focusList = async (selector: string) => {
  const target = el(selector).querySelector<HTMLElement>("ui-listbox-item[tabindex='0'], ui-listbox-item[data-selected]") ?? el(selector).querySelector<HTMLElement>("ui-listbox-item")!
  target.focus()
  await settle()
  return target
}

test("names: both lists have the name that the page shows", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  expect(labels).toEqual(["Mail folders", "Messages"])
  expect(el("[data-reader]").querySelector("h2")!.textContent).toBe("No message open")
})

test("keyboard: each list is 1 tab stop", async () => {
  await settle()
  const stops = (selector: string) => tabbable(el(selector)).length
  expect(stops("[data-folders]")).toBe(1)
  expect(stops("[data-messages]")).toBe(1)
})

test("keyboard: ArrowDown in the folders changes the message list, ArrowUp goes back", async () => {
  await focusList("[data-folders]")
  expect(item("[data-folders]", "inbox").hasAttribute("data-selected")).toBe(true)
  await keys("ArrowDown")
  expect(item("[data-folders]", "starred").hasAttribute("data-selected")).toBe(true)
  expect(status()).toBe("Folder: starred")
  expect([...root.querySelectorAll("[data-messages] ui-listbox-item")].map((i) => i.getAttribute("value"))).toEqual(["m4", "m5"])
  await keys("ArrowUp")
  expect(item("[data-folders]", "inbox").hasAttribute("data-selected")).toBe(true)
  expect([...root.querySelectorAll("[data-messages] ui-listbox-item")].map((i) => i.getAttribute("value"))).toEqual(["m1", "m2", "m3"])
})

test("keyboard: arrows in the message list open the message in the reading pane", async () => {
  await focusList("[data-messages]")
  await keys("ArrowDown")
  expect(status()).toMatch(/^Opened: /)
  const first = el("[data-subject]").textContent
  await keys("ArrowDown")
  expect(el("[data-subject]").textContent).not.toBe(first)
  expect(el("[data-from]").textContent).toMatch(/^From /)
  expect(el("[data-body]").textContent!.length).toBeGreaterThan(20)
  await keys("ArrowUp")
  expect(el("[data-subject]").textContent).toBe(first)
})

test("keyboard: Home and End in the message list move to the first and the last message", async () => {
  await focusList("[data-messages]")
  await keys("End")
  expect(el("[data-subject]").textContent).toBe("Lunch on Friday?")
  await keys("Home")
  expect(el("[data-subject]").textContent).toBe("Launch checklist")
})

test("keyboard: a new folder clears the reading pane", async () => {
  await focusList("[data-folders]")
  await keys("ArrowDown")
  expect(el("[data-subject]").textContent).toBe("No message open")
  expect(el("[data-body]").textContent).toBe("Choose a message in the list.")
})

test("agent: an agent opens a folder and a message", async () => {
  const done = await agent.act({ steps: ui.task!.steps })
  expect(done.ok, done.error?.message).toBe(true)
  expect(status()).toBe("Opened: Trip receipts")
  expect(el("[data-from]").textContent).toBe("From Ravi Menon")
  expect(el("[data-body]").textContent).toContain("7 receipts")
  expect(ui.task!.done(root)).toBe(true)
})

test("agent: an agent sees only the messages of the open folder", async () => {
  const messages = live().find((entry) => entry.label === "Messages")!
  expect(messages.items!.map((i) => i.value)).toEqual(["m6", "m7"])
})
